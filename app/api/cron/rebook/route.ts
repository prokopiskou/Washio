import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail, ADMIN_EMAILS } from '@/lib/admins'
import { isInternalEmail } from '@/lib/internal'
import { unsubHeaders, unsubFooterLink, isOptedOut } from '@/lib/unsubscribe'
import { NO_SHOW_UNTIL_MIN } from '@/lib/no-show'

// «Ώρα για το επόμενο πλύσιμο» — email επαναληπτικής κράτησης.
// Λόγος: η 1η κράτηση κοστίζει ~3,5€ διαφήμιση και φέρνει ~0,40€ προμήθεια → το κέρδος είναι
// στο 2ο, 3ο… πλύσιμο. (Υπάρχει και push στις 10 μέρες — /api/cron/wash-reminders — μόνο για
// όσους έχουν ενεργές ειδοποιήσεις· το email φτάνει σε όλους.)
//
// Ποιοι: πελάτες με ΟΛΟΚΛΗΡΩΜΕΝΟ πλύσιμο (ώρα + 4h, όχι ακύρωση / no-show) πριν από ≥14 μέρες,
// ΧΩΡΙΣ επόμενη κράτηση. ΕΝΑ email ανά πλύσιμο (app_metadata.rebook_for = id τελευταίας κράτησης)
// και το πολύ ένα ανά 30 μέρες. Εξαιρούνται: διαγραμμένοι, ομάδα/δοκιμές, admins, πλυντήρια.
// Ώρες αποστολής 10:00–20:59 Ελλάδας. Έως 40 ανά run (το cron τρέχει κάθε 15').
//
// GET  (cron, Bearer CRON_SECRET) → στέλνει.
// POST (admin) → { mode: 'preview' } ποιοι θα το πάρουν · { mode: 'test' } μόνο στον admin.
export const maxDuration = 120

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const resend = new Resend(process.env.RESEND_API_KEY)

const CAMPAIGN = 'rebook'
const REBOOK_SUBJECT = 'Ώρα για το επόμενο πλύσιμο'
const AFTER_DAYS = 14
const MAX_DAYS = 120
const RENOTIFY_DAYS = 30
const SEND_FROM_H = 10
const SEND_TO_H = 20
const PER_RUN = 40
const UTM = `utm_source=email&utm_medium=auto&utm_campaign=${CAMPAIGN}`
const DAY = 86_400_000

function athensHour(d = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', hourCycle: 'h23' }).format(d))
}
function athensEpoch(dateStr: string, timeStr: string): number {
  const naive = new Date(`${dateStr}T${String(timeStr || '00:00').slice(0, 5)}:00Z`).getTime()
  const local = new Date(naive)
  const asAthens = new Date(local.toLocaleString('en-US', { timeZone: 'Europe/Athens' }))
  const asUtc = new Date(local.toLocaleString('en-US', { timeZone: 'UTC' }))
  return naive + (asUtc.getTime() - asAthens.getTime())
}
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

type Candidate = {
  id: string; email: string; firstName: string
  bookingId: string; washer: string; slug: string; serviceId: string; days: number; credit: number
}

// Χωρίς όνομα στον τίτλο: στα ελληνικά θα ήθελε κλητική («Γιώργο») — το «Γιώργος, πάνε…» ακούγεται λάθος.
function html(c: Pick<Candidate, 'washer' | 'days' | 'credit'>, link: string, userId: string): string {
  const cr = Math.min(3, c.credit)
  const crTxt = Number.isInteger(cr) ? String(cr) : cr.toFixed(2)
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#F7FAFC;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Πάνε ${c.days} μέρες από το τελευταίο σου πλύσιμο. Κλείσε ξανά σε 30″.</div>
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 16px;">
    <div style="background:#10182A;border-radius:18px 18px 0 0;padding:28px 28px 22px;text-align:center;">
      <img src="https://washio.gr/logo.png" alt="Washio" width="120" style="display:block;margin:0 auto 6px;" />
      <p style="margin:0;color:#19A8C7;font-size:12px;font-weight:700;letter-spacing:1.6px;">ΩΡΑ ΓΙΑ ΤΟ ΕΠΟΜΕΝΟ ΠΛΥΣΙΜΟ</p>
    </div>
    <div style="background:#FFFFFF;border:1px solid #E8EEF2;border-top:none;border-radius:0 0 18px 18px;padding:28px;">
      <h1 style="margin:0 0 12px;color:#10182A;font-size:23px;line-height:1.3;font-weight:800;">Πάνε <span style="color:#078EAD;">${c.days} μέρες</span> από το τελευταίο σου πλύσιμο.</h1>
      <p style="margin:0 0 18px;color:#4B5563;font-size:15px;line-height:1.6;">Το <strong style="color:#10182A;">${esc(c.washer)}</strong> σε περιμένει. Διαλέγεις ώρα, πας, δεν περιμένεις στην ουρά.</p>
      ${cr >= 0.5 ? `<div style="background:#EAF8FB;border:1px solid #CFECF3;border-radius:14px;padding:14px 16px;margin:0 0 20px;">
        <p style="margin:0;color:#078EAD;font-size:15px;font-weight:800;">🎁 Έχεις −${crTxt}€ στον λογαριασμό σου</p>
        <p style="margin:4px 0 0;color:#6F7785;font-size:12px;">Μπαίνει αυτόματα στην κράτηση · Σε πλύσιμο από 12€.</p>
      </div>` : ''}
      <a href="${link}" style="display:block;background:#19A8C7;color:#FFFFFF;text-align:center;padding:16px;border-radius:14px;text-decoration:none;font-size:16px;font-weight:700;">Κλείσε ξανά στο ${esc(c.washer)} →</a>
      <p style="margin:12px 0 0;text-align:center;"><a href="https://www.washio.gr/map?${UTM}" style="color:#078EAD;font-size:13px;font-weight:600;text-decoration:none;">ή δες άλλα πλυντήρια κοντά σου</a></p>
      <div style="border-top:1px solid #F0F3F6;margin:22px 0 0;padding:16px 0 0;">
        <p style="margin:0;color:#10182A;font-size:13px;font-weight:700;">Φέρε έναν φίλο</p>
        <p style="margin:4px 0 0;color:#6F7785;font-size:13px;line-height:1.5;">−3€ για εκείνον, −3€ για σένα όταν ολοκληρωθεί το πλύσιμό του. <a href="https://www.washio.gr/profile/rewards?tab=referral&${UTM}" style="color:#078EAD;font-weight:600;text-decoration:none;">Ο σύνδεσμός σου →</a></p>
      </div>
    </div>
    <p style="margin:16px 0 0;color:#9AA3AF;font-size:11px;line-height:1.5;text-align:center;">Λαμβάνεις αυτό το email επειδή έχεις κάνει κράτηση στο Washio. Δεν θέλεις τέτοια μηνύματα; ${unsubFooterLink(userId)}.</p>
  </div></body></html>`
}

// Προσωπικό link: συνδέει αυτόματα → σελίδα του ΙΔΙΟΥ πλυντηρίου με την ΙΔΙΑ υπηρεσία ήδη επιλεγμένη
// (μένει μόνο να διαλέξει ώρα — «Κλείσε ξανά»).
async function personalLink(email: string, slug: string, serviceId = ''): Promise<string> {
  const next = slug ? `/locations/${slug}?${serviceId ? `service=${serviceId}&` : ''}${UTM}` : `/map?${UTM}`
  const fallback = `https://www.washio.gr${next}`
  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const th = data?.properties?.hashed_token
    if (error || !th) return fallback
    return `https://www.washio.gr/auth/link?token_hash=${encodeURIComponent(th)}&next=${encodeURIComponent(next)}`
  } catch { return fallback }
}

async function candidates(now = Date.now()): Promise<Candidate[]> {
  // Χρήστες (email, σήματα).
  const users = new Map<string, { email: string; meta: Record<string, unknown>; name: string }>()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    for (const u of data.users) {
      const email = (u.email || '').toLowerCase()
      if (!email || ADMIN_EMAILS.includes(email) || isInternalEmail(email)) continue
      const meta = (u.app_metadata || {}) as Record<string, unknown>
      if (meta.internal || isOptedOut(meta)) continue
      const um = (u.user_metadata || {}) as Record<string, unknown>
      users.set(u.id, { email, meta, name: String(um.full_name || um.name || '') })
    }
    if (data.users.length < 1000) break
  }

  const since = new Date(now - MAX_DAYS * DAY).toISOString().slice(0, 10)
  const [{ data: bks }, { data: owners }, { data: profs }, { data: recent }] = await Promise.all([
    admin.from('bookings')
      .select('id, user_id, status, slot_date, slot_start_time, source, location_id, service_id, locations(name, slug)')
      .not('user_id', 'is', null).gte('slot_date', since).in('status', ['confirmed', 'completed']),
    admin.from('locations').select('owner_id').not('owner_id', 'is', null),
    admin.from('profiles').select('id, full_name, referral_credit'),
    // Πρόσφατη δραστηριότητα (ΟΠΟΙΑΔΗΠΟΤΕ κατάσταση — και ακυρωμένη / no-show): όποιος έκανε κράτηση
    // τις τελευταίες 14 μέρες δεν χρειάζεται «ώρα για το επόμενο».
    admin.from('bookings').select('user_id').not('user_id', 'is', null).gte('created_at', new Date(now - AFTER_DAYS * DAY).toISOString()),
  ])
  const recentSet = new Set((recent || []).map(r => r.user_id as string))
  const ownerSet = new Set((owners || []).map(o => o.owner_id as string))
  const prof = new Map((profs || []).map(p => [p.id as string, p]))

  // Ανά χρήστη: τελευταίο ολοκληρωμένο πλύσιμο + αν έχει επόμενη κράτηση.
  type B = { id: string; at: number; washer: string; slug: string; serviceId: string }
  const last = new Map<string, B>()
  const upcoming = new Set<string>()
  for (const b of bks || []) {
    if (b.source === 'manual') continue
    const uid = b.user_id as string
    const at = athensEpoch(String(b.slot_date), String(b.slot_start_time || '00:00'))
    if (at + NO_SHOW_UNTIL_MIN * 60_000 > now) { upcoming.add(uid); continue }
    const loc = (b.locations || {}) as { name?: string; slug?: string }
    const cur = last.get(uid)
    if (!cur || at > cur.at) last.set(uid, { id: b.id as string, at, washer: String(loc.name || 'πλυντήριο').trim(), slug: String(loc.slug || ''), serviceId: String(b.service_id || '') })
  }

  const out: Candidate[] = []
  for (const [uid, b] of last) {
    if (upcoming.has(uid) || ownerSet.has(uid) || recentSet.has(uid)) continue
    const u = users.get(uid)
    if (!u) continue
    const days = Math.floor((now - b.at) / DAY)
    if (days < AFTER_DAYS) continue
    if (u.meta.rebook_for === b.id) continue // ήδη στάλθηκε για αυτό το πλύσιμο
    const lastSent = u.meta.rebook_email_at ? new Date(String(u.meta.rebook_email_at)).getTime() : 0
    if (lastSent && now - lastSent < RENOTIFY_DAYS * DAY) continue
    const p = prof.get(uid) as { full_name?: string; referral_credit?: number } | undefined
    const full = String(p?.full_name || u.name || '').trim()
    out.push({
      id: uid, email: u.email, firstName: full.split(/\s+/)[0] || '',
      bookingId: b.id, washer: b.washer, slug: b.slug, serviceId: b.serviceId, days, credit: Number(p?.referral_credit) || 0,
    })
  }
  return out.sort((a, b) => a.days - b.days)
}

async function mark(userId: string, bookingId: string | null) {
  await admin.auth.admin.updateUserById(userId, {
    app_metadata: bookingId ? { rebook_for: bookingId, rebook_email_at: new Date().toISOString() } : { rebook_for: null, rebook_email_at: null },
  })
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const h = athensHour()
  if (h < SEND_FROM_H || h > SEND_TO_H) return NextResponse.json({ ok: true, sent: 0, quiet: true })
  try {
    const list = await candidates()
    let sent = 0
    const errors: string[] = []
    for (const c of list.slice(0, PER_RUN)) {
      await mark(c.id, c.bookingId) // claim πρώτα → ποτέ διπλό
      const { error } = await resend.emails.send({
        from: 'Washio <noreply@washio.gr>',
        to: c.email,
        subject: REBOOK_SUBJECT,
        html: html(c, await personalLink(c.email, c.slug, c.serviceId), c.id),
        headers: unsubHeaders(c.id),
        tags: [{ name: 'campaign', value: CAMPAIGN }],
      })
      if (error) { errors.push(error.message); await mark(c.id, null) } // retry στο επόμενο run
      else sent++
    }
    return NextResponse.json({ ok: errors.length === 0, sent, pending: Math.max(0, list.length - PER_RUN), errors })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Σφάλμα' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const { mode } = (await req.json().catch(() => ({}))) as { mode?: 'preview' | 'test' }

  if (mode === 'test') {
    const { data: asLoc } = await admin.from('locations').select('slug').eq('id', '019bcedf-9092-484a-971a-8b8a68232cd9').maybeSingle()
    const testSlug = String(asLoc?.slug || '')
    const { error } = await resend.emails.send({
      from: 'Washio <noreply@washio.gr>',
      to: user.email!,
      subject: '[ΔΟΚΙΜΗ] ' + REBOOK_SUBJECT,
      html: html({ washer: 'AS Wash Detailing', days: 16, credit: 3 }, await personalLink(user.email!, testSlug), user.id),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, sentTo: user.email })
  }

  const list = await candidates()
  return NextResponse.json({
    subject: REBOOK_SUBJECT,
    sendingNow: athensHour() >= SEND_FROM_H && athensHour() <= SEND_TO_H,
    total: list.length,
    sample: list.slice(0, 10).map(c => ({ email: c.email.replace(/^(.{2}).*(@.*)$/, '$1***$2'), washer: c.washer, days: c.days, credit: c.credit })),
  })
}
