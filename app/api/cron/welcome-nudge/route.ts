import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail, ADMIN_EMAILS } from '@/lib/admins'

// Welcome nudge: όποιος γράφτηκε πριν 1–24 ώρες και ΔΕΝ έχει κάνει κράτηση (ούτε έφτασε
// στην πληρωμή) παίρνει ΕΝΑ email «Το −3€ σου σε περιμένει» με τα πλυντήρια και προσωπικό link.
// Λόγος: οι εγγραφές από διαφημίσεις κλείνουν ραντεβού μόνο όταν τους σπρώξει email.
//
// GET  (cron, Bearer CRON_SECRET) → στέλνει. Τρέχει κάθε 15' από GitHub Actions (reminders.yml).
// POST (admin συνδεδεμένος)       → { mode: 'preview' } ποιοι θα το πάρουν · { mode: 'test' } μόνο στον admin.
//
// Κανόνες: 1 email ανά χρήστη ΠΟΤΕ (σημάδι app_metadata.welcome_nudge_at, claim πριν την αποστολή).
// Ώρες αποστολής 09:00–21:59 Ελλάδας (όποιος γράφτηκε βράδυ, το παίρνει το πρωί).
// Όσοι έφτασαν στην πληρωμή εξαιρούνται: τους καλύπτει το «Δεν ολοκλήρωσες την κράτησή σου».
export const maxDuration = 60

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const resend = new Resend(process.env.RESEND_API_KEY)

const CAMPAIGN = 'welcome_nudge'
const SUBJECT = 'Το −3€ σου σε περιμένει'
const PREHEADER = 'Διάλεξε πλυντήριο, δες ελεύθερες ώρες, κλείσε σε 30″.'
const MIN_AGE_MIN = 60
const MAX_AGE_H = 24
// Όσοι γράφτηκαν ΠΡΙΝ από αυτό πήραν ήδη την υπενθύμιση «Ξέχασες το −3€ σου;» (7/10, 21:20) → όχι δεύτερο.
const START_AT = '2026-10-07T18:30:00Z'
const SEND_FROM_H = 9
const SEND_TO_H = 21 // έως 21:59

const UTM = `utm_source=email&utm_medium=auto&utm_campaign=${CAMPAIGN}`

function athensHour(d = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', hourCycle: 'h23' }).format(d))
}

type Washer = { name: string; area: string; from: number | null; url: string }

async function washers(): Promise<Washer[]> {
  const { data } = await admin.from('locations')
    .select('name, city, slug, services(price, is_range, price_min, is_active)')
    .eq('is_active', true)
  return (data || []).map(l => {
    const prices = ((l.services || []) as { price: number | null; is_range?: boolean; price_min?: number | null; is_active?: boolean }[])
      .filter(s => s.is_active !== false)
      .map(s => Number(s.is_range ? s.price_min : s.price))
      .filter(p => p > 0)
    return {
      name: String(l.name || ''),
      area: String(l.city || ''),
      from: prices.length ? Math.min(...prices) : null,
      url: `https://www.washio.gr/locations/${l.slug}?${UTM}`,
    }
  }).sort((a, b) => a.area.localeCompare(b.area, 'el'))
}

function html(link: string, list: Washer[]): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  const rows = list.map(w => `<tr>
      <td style="padding:10px 0;border-bottom:1px solid #F0F3F6;">
        <a href="${w.url}" style="color:#10182A;text-decoration:none;font-size:14px;font-weight:700;">${esc(w.name)}</a>
        <div style="color:#8A93A0;font-size:12px;margin-top:2px;">📍 ${esc(w.area || 'Αθήνα')}</div>
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #F0F3F6;text-align:right;white-space:nowrap;">
        ${w.from ? `<span style="color:#6F7785;font-size:12px;">από</span> <strong style="color:#10182A;font-size:14px;">${w.from}€</strong>` : ''}
      </td></tr>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#F7FAFC;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${PREHEADER}</div>
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 16px;">
    <div style="background:#10182A;border-radius:18px 18px 0 0;padding:28px 28px 22px;text-align:center;">
      <img src="https://washio.gr/logo.png" alt="Washio" width="120" style="display:block;margin:0 auto 6px;" />
      <p style="margin:0;color:#19A8C7;font-size:12px;font-weight:700;letter-spacing:1.6px;">ΚΑΛΩΣ ΗΡΘΕΣ</p>
    </div>
    <div style="background:#FFFFFF;border:1px solid #E8EEF2;border-top:none;border-radius:0 0 18px 18px;padding:28px;">
      <h1 style="margin:0 0 12px;color:#10182A;font-size:23px;line-height:1.3;font-weight:800;">Το <span style="color:#078EAD;">−3€</span> είναι ήδη στον λογαριασμό σου.</h1>
      <p style="margin:0 0 18px;color:#4B5563;font-size:15px;line-height:1.6;">Διάλεξε πλυντήριο. Δες ελεύθερες ώρες. Κλείσε σε 30″. Πας στην ώρα σου, χωρίς ουρά.</p>
      <div style="background:#EAF8FB;border:1px solid #CFECF3;border-radius:14px;padding:14px 16px;margin:0 0 20px;">
        <p style="margin:0;color:#078EAD;font-size:15px;font-weight:800;">🎁 −3€ στο πρώτο σου πλύσιμο</p>
        <p style="margin:4px 0 0;color:#6F7785;font-size:12px;">Μπαίνει αυτόματα στην κράτηση · Κάρτα ή μετρητά · Σε πλύσιμο από 12€.</p>
      </div>
      <a href="${link}" style="display:block;background:#19A8C7;color:#FFFFFF;text-align:center;padding:16px;border-radius:14px;text-decoration:none;font-size:16px;font-weight:700;margin:0 0 22px;">Δες ελεύθερες ώρες →</a>
      ${list.length ? `<p style="margin:0 0 4px;color:#10182A;font-size:13px;font-weight:700;letter-spacing:.3px;">ΠΛΥΝΤΗΡΙΑ ΣΤΟ WASHIO</p>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">${rows}</table>` : ''}
      <p style="margin:18px 0 0;color:#9AA3AF;font-size:12px;line-height:1.6;text-align:center;">Δωρεάν ακύρωση έως 2 ώρες πριν.</p>
    </div>
    <p style="margin:16px 0 0;color:#9AA3AF;font-size:11px;line-height:1.5;text-align:center;">Λαμβάνεις αυτό το email επειδή έφτιαξες λογαριασμό στο Washio. Δεν θέλεις τέτοια μηνύματα; <a href="mailto:withinsuccess@gmail.com?subject=Unsubscribe%20Washio" style="color:#9AA3AF;">Διαγραφή</a>.</p>
  </div></body></html>`
}

// Προσωπικό link: συνδέει αυτόματα (ίδιο μηχανισμό με τις καμπάνιες) → χάρτης.
async function personalLink(email: string): Promise<string> {
  const fallback = `https://www.washio.gr/map?${UTM}`
  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const th = data?.properties?.hashed_token
    if (error || !th) return fallback
    return `https://www.washio.gr/auth/link?token_hash=${encodeURIComponent(th)}&next=${encodeURIComponent('/map?' + UTM)}`
  } catch { return fallback }
}

type Candidate = { id: string; email: string; createdAt: string }

async function candidates(now = Date.now()): Promise<Candidate[]> {
  const minCreated = Math.max(new Date(START_AT).getTime(), now - MAX_AGE_H * 3600_000)
  const maxCreated = now - MIN_AGE_MIN * 60_000
  const fresh: Candidate[] = []
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    for (const u of data.users) {
      const t = new Date(u.created_at).getTime()
      const email = (u.email || '').toLowerCase()
      if (!email || t < minCreated || t > maxCreated) continue
      if (!(u.last_sign_in_at || u.email_confirmed_at)) continue // μόνο ολοκληρωμένες εγγραφές (όχι bounce)
      if (email.includes('+test') || ADMIN_EMAILS.includes(email)) continue
      if ((u.app_metadata as Record<string, unknown> | undefined)?.welcome_nudge_at) continue
      fresh.push({ id: u.id, email, createdAt: u.created_at })
    }
    if (data.users.length < 1000) break
  }
  if (!fresh.length) return []

  const ids = fresh.map(c => c.id)
  const emails = fresh.map(c => c.email)
  const [{ data: bk }, { data: ca }, { data: owners }, { data: apps }, { data: onb }] = await Promise.all([
    admin.from('bookings').select('user_id').in('user_id', ids),            // ΚΑΘΕ κράτηση (και ακυρωμένη)
    admin.from('checkout_attempts').select('user_id').in('user_id', ids),   // → τους καλύπτει το abandoned-checkout
    admin.from('locations').select('owner_id').in('owner_id', ids),
    admin.from('applications').select('email').in('email', emails),
    admin.from('partner_onboarding').select('email').in('email', emails),
  ])
  const skip = new Set<string>([
    ...(bk || []).map(r => r.user_id as string),
    ...(ca || []).map(r => r.user_id as string),
    ...(owners || []).map(r => r.owner_id as string),
  ])
  const partner = new Set([...(apps || []), ...(onb || [])].map(r => String((r as { email?: string }).email || '').toLowerCase()))
  return fresh.filter(c => !skip.has(c.id) && !partner.has(c.email))
}

// −3€ πρέπει να υπάρχει ΠΡΙΝ φύγει το email (το υπόσχεται). Ίδια πολιτική με την εγγραφή.
async function ensureCoupon(userId: string): Promise<boolean> {
  const { data: p } = await admin.from('profiles').select('referral_credit').eq('id', userId).maybeSingle()
  if (Number(p?.referral_credit) >= 3) return true
  const { data: had } = await admin.from('credit_ledger').select('id').eq('user_id', userId).eq('kind', 'welcome').maybeSingle()
  if (had) return false // το πήρε και το χρησιμοποίησε/χάθηκε → δεν υποσχόμαστε κάτι που δεν έχει
  await admin.rpc('apply_credit', { p_user: userId, p_delta: 3, p_kind: 'welcome', p_note: 'Καλωσόρισμα' })
  const { data: p2 } = await admin.from('profiles').select('referral_credit').eq('id', userId).maybeSingle()
  return Number(p2?.referral_credit) >= 3
}

async function mark(userId: string, value: string | null) {
  await admin.auth.admin.updateUserById(userId, { app_metadata: { welcome_nudge_at: value } })
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const h = athensHour()
  if (h < SEND_FROM_H || h > SEND_TO_H) return NextResponse.json({ ok: true, sent: 0, quiet: true })

  try {
    const list = await candidates()
    if (!list.length) return NextResponse.json({ ok: true, sent: 0 })
    const ws = await washers()
    let sent = 0, skipped = 0
    const errors: string[] = []
    for (const c of list.slice(0, 40)) {
      await mark(c.id, new Date().toISOString()) // claim πρώτα → ποτέ διπλό
      if (!(await ensureCoupon(c.id))) { skipped++; continue }
      const { error } = await resend.emails.send({
        from: 'Washio <noreply@washio.gr>',
        to: c.email,
        subject: SUBJECT,
        html: html(await personalLink(c.email), ws),
        headers: { 'List-Unsubscribe': '<mailto:withinsuccess@gmail.com?subject=Unsubscribe%20Washio>' },
        tags: [{ name: 'campaign', value: CAMPAIGN }],
      })
      if (error) { errors.push(error.message); await mark(c.id, null) } // retry στο επόμενο run
      else sent++
    }
    return NextResponse.json({ ok: errors.length === 0, sent, skipped, errors })
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
    const { error } = await resend.emails.send({
      from: 'Washio <noreply@washio.gr>',
      to: user.email!,
      subject: '[ΔΟΚΙΜΗ] ' + SUBJECT,
      html: html(await personalLink(user.email!), await washers()),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, sentTo: user.email })
  }

  const list = await candidates()
  return NextResponse.json({
    subject: SUBJECT,
    athensHour: athensHour(),
    sendingNow: athensHour() >= SEND_FROM_H && athensHour() <= SEND_TO_H,
    total: list.length,
    sample: list.slice(0, 10).map(c => ({ email: c.email.replace(/^(.{2}).*(@.*)$/, '$1***$2'), createdAt: c.createdAt })),
  })
}
