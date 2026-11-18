import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'
import { memberLocationIds } from '@/lib/location-access'

// Πρωινή αναφορά ΙΔΙΟΚΤΗΤΗ (αλυσίδες / πολλά πλυντήρια): κάθε πρωί 08:00–09:59 (Ελλάδα), ένα email με
// το τι έγινε ΧΘΕΣ σε ΚΑΘΕ πλυντήριό του μέσω Washio — πόσα ραντεβού, τι τζίρο, αναλυτικά οι κρατήσεις —
// και σύνολο. Μόνο κρατήσεις πλατφόρμας (όχι τα χειροκίνητα ραντεβού του πλυντηρίου).
//
// ΣΕ ΠΟΙΟΥΣ: μόνο όσους έχουμε δηλώσει ρητά — app_settings 'owner_daily' = { emails: ['owner@…'] }.
// Κανείς άλλος δεν λαμβάνει τίποτα (προεπιλογή: κενή λίστα).
//
// GET (cron, Bearer CRON_SECRET) → στέλνει, μία φορά τη μέρα ανά ιδιοκτήτη (app_settings 'owner_daily_last').
// POST (admin) { email, day?, send? } → προεπισκόπηση (html) για έναν ιδιοκτήτη· send:true → στέλνει το δείγμα ΣΤΟΝ ADMIN.
export const maxDuration = 60
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(d)
const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const eur = (n: number) => `${n.toFixed(2).replace('.', ',').replace(',00', '')}€`

type Bk = {
  booking_ref: string; location_id: string; slot_date: string; slot_start_time: string; status: string; created_at: string
  total_amount: number | null; coupon_amount: number | null; stripe_payment_intent_id: string | null; checked_in_at: string | null
  customer_name: string | null; car_model: string | null; addons: unknown
  services: { name?: string } | null; profiles: { full_name?: string | null } | null
}
type LocRep = {
  id: string; name: string; city: string
  done: Bk[]; noShow: number; revenue: number; card: number; cash: number; newYesterday: number; today: number
}

async function ownerIdByEmail(email: string): Promise<string | null> {
  const want = email.trim().toLowerCase()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return null
    const u = data.users.find(x => (x.email || '').toLowerCase() === want)
    if (u) return u.id
    if (data.users.length < 1000) break
  }
  return null
}

async function report(ownerId: string, day: string): Promise<LocRep[]> {
  // Πλυντήρια του: όσα έχει ως κύριος λογαριασμός + όσα είναι μέλος (ιδιοκτήτης αλυσίδας — location_members).
  const memIds = await memberLocationIds(db, ownerId)
  const { data: locs } = await db.from('locations').select('id, name, city')
    .or(`owner_id.eq.${ownerId}${memIds.length ? `,id.in.(${memIds.join(',')})` : ''}`).order('name', { ascending: true })
  const list = (locs || []) as { id: string; name: string; city: string | null }[]
  if (!list.length) return []
  const ids = list.map(l => l.id)
  const today = ymd(new Date(new Date(day + 'T12:00:00Z').getTime() + 864e5))
  const sel = 'booking_ref, location_id, slot_date, slot_start_time, status, created_at, total_amount, coupon_amount, stripe_payment_intent_id, checked_in_at, customer_name, car_model, addons, services(name), profiles(full_name)'
  const platform = 'source.is.null,source.eq.platform'
  const [{ data: a }, { data: b }, { data: c }] = await Promise.all([
    db.from('bookings').select(sel).in('location_id', ids).eq('slot_date', day).or(platform).order('slot_start_time', { ascending: true }).limit(2000),
    db.from('bookings').select('location_id, created_at, status').in('location_id', ids).or(platform)
      .gte('created_at', new Date(new Date(day + 'T00:00:00Z').getTime() - 4 * 3600e3).toISOString())
      .lt('created_at', new Date(new Date(day + 'T00:00:00Z').getTime() + 28 * 3600e3).toISOString()).limit(5000),
    db.from('bookings').select('location_id').in('location_id', ids).eq('slot_date', today).eq('status', 'confirmed').or(platform).limit(5000),
  ])
  const yRows = (a || []) as unknown as Bk[]
  return list.map(l => {
    const mine = yRows.filter(r => r.location_id === l.id)
    const done = mine.filter(r => r.status !== 'cancelled' && r.status !== 'no_show')
    const paid = (r: Bk) => Math.max(0, (Number(r.total_amount) || 0) - (Number(r.coupon_amount) || 0))
    return {
      id: l.id, name: String(l.name || '').trim(), city: String(l.city || '').trim(),
      done, noShow: mine.filter(r => r.status === 'no_show').length,
      revenue: +done.reduce((s, r) => s + paid(r), 0).toFixed(2),
      card: done.filter(r => !!r.stripe_payment_intent_id).length,
      cash: done.filter(r => !r.stripe_payment_intent_id).length,
      // Νέες κρατήσεις που ΕΓΙΝΑΝ χθες (ώρα Ελλάδας), ανεξάρτητα από τη μέρα του ραντεβού.
      newYesterday: ((b || []) as { location_id: string; created_at: string; status: string }[])
        .filter(r => r.location_id === l.id && r.status !== 'cancelled' && ymd(new Date(r.created_at)) === day).length,
      today: ((c || []) as { location_id: string }[]).filter(r => r.location_id === l.id).length,
    }
  })
}

function html(dayLabel: string, reps: LocRep[]) {
  // ΑΠΛΟ: πόσες κρατήσεις είχε κάθε πλυντήριο χθες + ο ΣΥΝΟΛΙΚΟΣ τζίρος (όχι ανά πλυντήριο, όχι αναλυτικά).
  const n = reps.reduce((s, r) => s + r.done.length, 0)
  const rev = reps.reduce((s, r) => s + r.revenue, 0)
  const td = 'padding:10px 6px;border-top:1px solid #EEF0F3;'
  const rows = [...reps].sort((a, b) => b.done.length - a.done.length).map(r => `<tr>
      <td style="${td}color:#10182A;">${esc(r.name)}${r.city ? ` <span style="color:#9AA3AF;font-size:12px;">· ${esc(r.city)}</span>` : ''}</td>
      <td style="${td}text-align:right;font-weight:700;font-size:16px;">${r.done.length}</td>
    </tr>`).join('')
  return `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px;color:#10182A;">
    <p style="margin:0;color:#19A8C7;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">Washio · πρωινή αναφορά</p>
    <h2 style="margin:4px 0 14px;">${esc(dayLabel)}</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:6px;"><tr>
      <td style="background:#F5F7FA;border-radius:12px;padding:14px 16px;"><div style="color:#6F7785;font-size:12px;">Κρατήσεις χθες</div><div style="font-size:26px;font-weight:700;">${n}</div></td>
      <td style="width:10px;"></td>
      <td style="background:#F5F7FA;border-radius:12px;padding:14px 16px;"><div style="color:#6F7785;font-size:12px;">Συνολικός τζίρος</div><div style="font-size:26px;font-weight:700;">${eur(rev)}</div></td>
    </tr></table>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:14px;">
      <tr style="color:#9AA3AF;font-size:12px;"><td style="padding:4px 6px;">Πλυντήριο</td><td style="padding:4px 6px;text-align:right;">Κρατήσεις</td></tr>
      ${rows}
    </table>
    <p style="margin-top:18px;color:#9AA3AF;font-size:11px;line-height:1.6;">Κρατήσεις μέσω Washio με ραντεβού χθες, χωρίς ακυρώσεις και χωρίς όσους δεν εμφανίστηκαν.</p>
    <p style="margin-top:8px;font-size:13px;"><a href="https://www.washio.gr/dashboard" style="color:#078EAD;">Δες τις αναλυτικά στο dashboard</a></p>
  </div>`
}

const dayLabelOf = (day: string) => new Intl.DateTimeFormat('el-GR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(day + 'T12:00:00Z'))

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  if (h < 8 || h > 9) return NextResponse.json({ skipped: 'hours' })
  const { data: cfg } = await db.from('app_settings').select('value').eq('key', 'owner_daily').maybeSingle()
  const emails = (((cfg?.value as { emails?: string[] } | null)?.emails) || []).map(e => String(e).trim().toLowerCase()).filter(Boolean)
  if (!emails.length) return NextResponse.json({ skipped: 'no recipients' })
  const today = ymd(new Date())
  const { data: flag } = await db.from('app_settings').select('value').eq('key', 'owner_daily_last').maybeSingle()
  const sent = ((flag?.value as { day?: string; emails?: string[] } | null)?.day === today ? (flag!.value as { emails?: string[] }).emails : []) || []
  const day = ymd(new Date(Date.now() - 864e5))
  const out: Record<string, string> = {}
  const resend = new Resend(process.env.RESEND_API_KEY)
  for (const email of emails) {
    if (sent.includes(email)) { out[email] = 'already'; continue }
    // Κλείδωμα ΠΡΙΝ την αποστολή → ποτέ δύο φορές την ίδια μέρα.
    sent.push(email)
    const { error: fErr } = await db.from('app_settings').upsert({ key: 'owner_daily_last', value: { day: today, emails: sent }, updated_at: new Date().toISOString() })
    if (fErr) { out[email] = 'no app_settings'; continue }
    const ownerId = await ownerIdByEmail(email)
    if (!ownerId) { out[email] = 'no user'; continue }
    const reps = await report(ownerId, day)
    if (!reps.length) { out[email] = 'no locations'; continue }
    const n = reps.reduce((s, r) => s + r.done.length, 0), rev = reps.reduce((s, r) => s + r.revenue, 0)
    const r = await resend.emails.send({
      from: 'Washio <noreply@washio.gr>', to: email,
      subject: `Washio · χθες: ${n} κρατήσεις · ${eur(rev)}`,
      html: html(dayLabelOf(day), reps),
    })
    out[email] = r.error ? `error: ${r.error.message}` : 'sent'
  }
  return NextResponse.json({ ok: true, day, out })
}

export async function POST(req: NextRequest) {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { email?: string; day?: string; send?: boolean }
  const email = String(b.email || '').trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'email ιδιοκτήτη;' }, { status: 400 })
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(b.day || '')) ? String(b.day) : ymd(new Date(Date.now() - 864e5))
  const ownerId = await ownerIdByEmail(email)
  if (!ownerId) return NextResponse.json({ error: 'Δεν βρέθηκε λογαριασμός με αυτό το email' }, { status: 404 })
  const reps = await report(ownerId, day)
  const body = html(dayLabelOf(day), reps)
  // send:true → το δείγμα πάει ΣΤΟΝ ADMIN που το ζήτησε, ποτέ στον ιδιοκτήτη.
  if (b.send && user.email) {
    await new Resend(process.env.RESEND_API_KEY).emails.send({ from: 'Washio <noreply@washio.gr>', to: user.email, subject: `[ΔΕΙΓΜΑ] Πρωινή αναφορά · ${email}`, html: body })
  }
  return NextResponse.json({
    day, owner: email,
    locations: reps.map(r => ({ name: r.name, done: r.done.length, revenue: r.revenue, noShow: r.noShow, newYesterday: r.newYesterday, today: r.today })),
    html: body,
  })
}
