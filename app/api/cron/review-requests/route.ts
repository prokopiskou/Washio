import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { sendPush } from '@/lib/push'
import { sendSms, smsConfigured } from '@/lib/sms'
import { athensEpoch, athensToday } from '@/lib/time'
import { reviewPath, reviewUrl } from '@/lib/review-link'
import { isOptedOut } from '@/lib/unsubscribe'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'

// Αίτημα κριτικής ΠΛΥΝΤΗΡΙΟΥ μετά το πλύσιμο — μία φορά ανά κράτηση, ΕΝΑ κανάλι:
//   push (αν έχει app/web push) → αλλιώς email → αλλιώς SMS.
// Πότε: 30' μετά το σκανάρισμα QR · χωρίς σκανάρισμα → 60' μετά το τέλος του ραντεβού.
// Δεν ζητάμε αν έχει ήδη αφήσει κριτική σε ΑΥΤΟ το πλυντήριο (σε άλλο πλυντήριο → ζητάμε).
// Ώρες αποστολής: 09:00–21:59 (Ελλάδα). Τρέχει από /api/cron/emails κάθε 15'.
// GET (cron) · POST (admin) { mode: 'preview' } → τι θα σταλεί, χωρίς αποστολή.
// Στήλες: supabase/review_requests.sql
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const resend = new Resend(process.env.RESEND_API_KEY)

type Row = {
  id: string; booking_ref: string; user_id: string; location_id: string; slot_date: string; slot_start_time: string
  duration_minutes: number | null; checked_in_at: string | null; customer_phone: string | null
  locations: { name?: string } | null; profiles: { email?: string | null; phone?: string | null; full_name?: string | null } | null
}

function ymdMinus(days: number): string {
  const [y, m, d] = athensToday().split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10)
}

function emailHtml(first: string, place: string, ref: string): string {
  const stars = [1, 2, 3, 4, 5].map(n => `<td style="padding:0 4px;"><a href="${reviewUrl(ref, n)}" style="display:block;width:46px;height:46px;background:#fff;border:1px solid #E5E5E5;border-radius:12px;text-align:center;line-height:46px;text-decoration:none;font-size:24px;color:#F5A623;">★</a></td>`).join('')
  return `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;background:#fff;">
  <div style="background:#10182A;padding:28px;text-align:center;border-radius:16px 16px 0 0;"><h1 style="color:#fff;font-size:22px;font-weight:600;margin:0;">washio</h1></div>
  <div style="padding:32px;border:1px solid #F0F0F0;border-top:none;border-radius:0 0 16px 16px;text-align:center;">
    <h2 style="font-size:18px;font-weight:600;color:#10182A;margin:0 0 6px;">${first ? first + ', π' : 'Π'}ώς ήταν το ${place};</h2>
    <p style="color:#999;font-size:13px;margin:0 0 22px;">Ένα πάτημα. Βοηθάει το πλυντήριο και τους επόμενους πελάτες.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 24px;"><tr>${stars}</tr></table>
    <p style="color:#CCC;font-size:11px;margin:0;">Washio · ${ref}</p>
  </div></div>`
}

async function run(dry: boolean) {
  const athH = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  if (!dry && (athH < 9 || athH > 21)) return { ok: true, skipped: 'hours' }

  const { data, error } = await db.from('bookings')
    .select('id, booking_ref, user_id, location_id, slot_date, slot_start_time, duration_minutes, checked_in_at, customer_phone, locations(name), profiles(email, phone, full_name)')
    .gte('slot_date', ymdMinus(1)).lte('slot_date', athensToday())
    .is('review_requested_at', null).not('user_id', 'is', null)
    .not('status', 'in', '(cancelled,no_show)')
    .or('source.is.null,source.eq.platform')
    .limit(300)
  if (error) return { ok: false, skipped: 'column', error: error.message }

  const now = Date.now()
  const due = ((data || []) as unknown as Row[]).filter(b => {
    if (!b.slot_date || !b.slot_start_time) return false
    const at = b.checked_in_at
      ? new Date(b.checked_in_at).getTime() + 30 * 60_000
      : athensEpoch(b.slot_date, b.slot_start_time) + ((Number(b.duration_minutes) || 30) + 60) * 60_000
    return now >= at
  })
  if (!due.length) return { ok: true, due: 0, sent: 0 }

  // Ήδη κριτική σε αυτό το πλυντήριο (από τον ίδιο χρήστη)?
  const users = [...new Set(due.map(b => b.user_id))]
  const { data: revs } = await db.from('reviews').select('user_id, location_id').in('user_id', users)
  const reviewed = new Set((revs || []).map(r => `${r.user_id}:${r.location_id}`))
  // Ποιοι έχουν push (native ή web)
  const [{ data: nat }, { data: web }] = await Promise.all([
    db.from('native_push_tokens').select('user_id').in('user_id', users),
    db.from('push_subscriptions').select('user_id').in('user_id', users),
  ])
  const hasPush = new Set([...(nat || []), ...(web || [])].map(r => (r as { user_id: string }).user_id))

  const stats = { due: due.length, push: 0, email: 0, sms: 0, skippedReviewed: 0, skippedNoChannel: 0, failed: 0 }
  const preview: { ref: string; place: string; channel: string }[] = []
  const askedNow = new Set<string>() // 2 κρατήσεις ίδιο πλυντήριο → ένα αίτημα

  for (const b of due) {
    const key = `${b.user_id}:${b.location_id}`
    const place = b.locations?.name || 'το πλυντήριο'
    const first = (b.profiles?.full_name || '').trim().split(/\s+/)[0] || ''
    let channel: 'push' | 'email' | 'sms' | 'skip_reviewed' | 'none' = 'none'
    if (reviewed.has(key) || askedNow.has(key)) channel = 'skip_reviewed'
    else if (hasPush.has(b.user_id)) channel = 'push'
    else if (b.profiles?.email) channel = 'email'
    else if ((b.customer_phone || b.profiles?.phone) && smsConfigured()) channel = 'sms'

    if (dry) { preview.push({ ref: b.booking_ref, place, channel }); continue }

    // Claim (μία φορά ανά κράτηση, και με παράλληλα runs).
    const { data: claimed } = await db.from('bookings').update({ review_requested_at: new Date().toISOString(), review_channel: channel })
      .eq('id', b.id).is('review_requested_at', null).select('id')
    if (!claimed?.length) continue
    if (channel === 'skip_reviewed') { stats.skippedReviewed++; continue }
    if (channel === 'none') { stats.skippedNoChannel++; continue }
    askedNow.add(key)

    try {
      if (channel === 'push') {
        await sendPush(b.user_id, { title: `Πώς ήταν το ${place}; ★`, body: 'Ένα πάτημα στα αστέρια. Βοηθάει τους επόμενους πελάτες.', url: reviewPath(b.booking_ref) })
        stats.push++
      } else if (channel === 'email') {
        // Opt-out από emails → δεν στέλνουμε.
        const { data: u } = await db.auth.admin.getUserById(b.user_id)
        if (isOptedOut(u?.user?.app_metadata as Record<string, unknown>)) { stats.skippedNoChannel++; continue }
        const r = await resend.emails.send({
          from: 'Washio <noreply@washio.gr>', to: b.profiles!.email!,
          subject: `Πώς ήταν το ${place};`, html: emailHtml(first, place, b.booking_ref),
        })
        if (r.error) { stats.failed++; continue }
        stats.email++
      } else {
        const phone = (b.customer_phone || b.profiles?.phone)!
        const r = await sendSms(phone, `Washio: Πώς ήταν το ${place}; Βαθμολόγησε με ένα πάτημα: ${reviewUrl(b.booking_ref)}`)
        if (!r.ok) { stats.failed++; continue }
        stats.sms++
      }
    } catch { stats.failed++ }
  }
  return { ok: true, ...stats, ...(dry ? { preview } : {}) }
}

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(await run(false))
}

export async function POST() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  return NextResponse.json(await run(true))
}
