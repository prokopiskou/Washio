import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSms, smsConfigured, toMsisdn } from '@/lib/sms'
import { alertCritical } from '@/lib/alert'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'

// SMS υπενθύμιση πριν το ραντεβού — κόβει τα «Δεν ήρθε».
//  • ~2 ώρες πριν (slot σε 100–140'), μόνο 08:00–20:59 ώρα Ελλάδας.
//  • Πρωινά ραντεβού (πριν τις 10:00): το προηγούμενο βράδυ, 20:00–20:59 («αύριο»).
//  • Μόνο κρατήσεις πλατφόρμας, confirmed, ελληνικό κινητό, φτιαγμένες πριν από 30'+.
//  • Scope: SMS_SCOPE=all → όλοι · αλλιώς ΜΟΝΟ επισκέπτες (guest checkout) — εκεί ξεκινάμε.
//  • Έως 2 SMS, κανονικά ελληνικά: πλυντήριο + ώρα + link χάρτη (washio.gr/m/<κωδικός> → Google Maps του πλυντηρίου). Χωρίς αλλαγή ώρας.
//  • Μία φορά ανά κράτηση (bookings.sms_reminder_sent — supabase/sms_reminders.sql).
// GET (Bearer CRON_SECRET), κάθε 15' από το GitHub workflow.
//   ?dry=1  → ποιοι ΘΑ έπαιρναν SMS τώρα (χωρίς αποστολή)
//   ?test=1 → ένα δοκιμαστικό SMS στο SMS_TEST_PHONE
export const maxDuration = 60

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

function athensParts(d: Date) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, hour: Number(p.hour) }
}

/** Κείμενο σε κανονικά ελληνικά (Unicode) — έως 2 SMS (2 × 67 = 134 χαρ.). Χωρίς αλλαγή ώρας.
 *  Πρώτα η πλήρης διατύπωση· αν δεν χωράει το όνομα του πλυντηρίου, πιο σύντομη. */
function reminderText(day: 'σήμερα' | 'αύριο', time: string, place: string, ref: string, mapsUrl?: string | null): string {
  const code = String(ref || '').replace(/^WS-/i, '')
  const when = day === 'σήμερα' ? `είναι σε 2 ώρες, στις ${time}` : `είναι αύριο στις ${time}`
  // Κατευθείαν το link Google Maps του πλυντηρίου (https — απαραίτητο για να ανοίξει η εφαρμογή):
  // το tap από τα Μηνύματα ανοίγει την εφαρμογή Google Maps αν υπάρχει. Το redirect μέσω washio.gr
  // άνοιγε πρώτα τον browser. Χωρίς link → washio.gr/m/<κωδικός> (οδηγίες προς τις συντεταγμένες).
  const direct = String(mapsUrl || '').trim().replace(/^http:\/\//i, 'https://')
  const link = /^https:\/\/maps\.app\.goo\.gl\/\w+$/i.test(direct) ? direct : `washio.gr/m/${code}`
  const MAX = 134
  const name = (place || 'το πλυντήριο').trim().replace(/\s+/g, ' ')
  const variants: [string, string][] = [
    ['Το ραντεβού σου για πλύσιμο στο ', ` ${when}. Δες το πλυντήριο στον χάρτη: `],
    ['Το ραντεβού σου στο ', ` ${when}. Δες το πλυντήριο στον χάρτη: `],
    ['Το ραντεβού σου στο ', ` ${when}. Χάρτης: `],
  ]
  for (const [h, m] of variants) {
    if (h.length + name.length + m.length + link.length <= MAX) return h + name + m + link
  }
  const [h, m] = variants[variants.length - 1]
  return h + name.slice(0, MAX - h.length - m.length - link.length - 1).trimEnd() + '…' + m + link
}

type Row = {
  id: string; booking_ref: string; user_id: string | null; slot_date: string; slot_start_time: string
  created_at: string; locations: { name?: string; google_maps_url?: string | null } | null; profiles: { phone?: string | null } | null
}

async function candidates(now: Date): Promise<{ row: Row; day: 'σήμερα' | 'αύριο' }[]> {
  const a = athensParts(now)
  const out: { row: Row; day: 'σήμερα' | 'αύριο' }[] = []
  const sel = 'id, booking_ref, user_id, slot_date, slot_start_time, created_at, locations(name, google_maps_url), profiles(phone)'
  const recentCut = new Date(now.getTime() - 30 * 60 * 1000).toISOString()
  const base = () => admin.from('bookings').select(sel)
    .eq('status', 'confirmed').eq('source', 'platform').eq('sms_reminder_sent', false).lt('created_at', recentCut)

  // A) ~2 ώρες πριν, 08:00–20:59.
  if (a.hour >= 8 && a.hour < 21) {
    const from = athensParts(new Date(now.getTime() + 100 * 60 * 1000))
    const to = athensParts(new Date(now.getTime() + 140 * 60 * 1000))
    const parts = from.date === to.date
      ? [base().eq('slot_date', from.date).gte('slot_start_time', from.time).lte('slot_start_time', to.time)]
      : [base().eq('slot_date', from.date).gte('slot_start_time', from.time), base().eq('slot_date', to.date).lte('slot_start_time', to.time)]
    for (const q of parts) {
      const { data } = await q
      for (const r of (data || []) as unknown as Row[]) out.push({ row: r, day: r.slot_date === a.date ? 'σήμερα' : 'αύριο' })
    }
  }
  // B) Πρωινά ραντεβού αύριο (πριν τις 10:00): απόψε 20:00–20:59.
  if (a.hour === 20) {
    const tomorrow = athensParts(new Date(now.getTime() + 24 * 60 * 60 * 1000)).date
    const { data } = await base().eq('slot_date', tomorrow).lt('slot_start_time', '10:00')
    for (const r of (data || []) as unknown as Row[]) out.push({ row: r, day: 'αύριο' })
  }
  // Μοναδικά ανά κράτηση.
  const seen = new Set<string>()
  return out.filter(c => (seen.has(c.row.id) ? false : (seen.add(c.row.id), true)))
}

async function isGuest(userId: string | null): Promise<boolean> {
  if (!userId) return false
  try {
    const { data } = await admin.auth.admin.getUserById(userId)
    return (data?.user?.user_metadata as { signup_method?: string } | undefined)?.signup_method === 'guest_checkout'
  } catch { return false }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const cronOk = !!process.env.CRON_SECRET && req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  if (!cronOk) {
    // Admin συνδεδεμένος στον browser: ΜΟΝΟ ?test=1 (SMS στο SMS_TEST_PHONE) και ?dry=1 (λίστα, χωρίς αποστολή).
    let isAdmin = false
    try {
      const sb = await createServerClient()
      const { data: { user } } = await sb.auth.getUser()
      isAdmin = isAdminEmail(user?.email)
    } catch { /* όχι admin */ }
    if (!isAdmin || (sp.get('test') !== '1' && sp.get('dry') !== '1')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  const now = new Date()

  if (sp.get('test') === '1') {
    const to = process.env.SMS_TEST_PHONE || ''
    if (!toMsisdn(to)) return NextResponse.json({ ok: false, error: 'SMS_TEST_PHONE λείπει ή δεν είναι ελληνικό κινητό' })
    // ?ref=WS-XXXX → δοκιμή με πραγματική κράτηση (όνομα + link χάρτη εκείνου του πλυντηρίου).
    let place = 'Nitro wash', ref = 'WS-TEST0000', maps: string | null = null
    const want = String(sp.get('ref') || '').toUpperCase().replace(/[^A-Z0-9-]/g, '')
    if (want) {
      const { data } = await admin.from('bookings').select('booking_ref, locations(name, google_maps_url)').eq('booking_ref', want).maybeSingle()
      if (data) {
        const l = (data as { locations?: { name?: string; google_maps_url?: string | null } | null }).locations
        ref = data.booking_ref as string; place = l?.name || place; maps = l?.google_maps_url || null
      }
    }
    const text = reminderText('σήμερα', '16:00', place, ref, maps)
    const r = await sendSms(to, text)
    return NextResponse.json({ ...r, text, length: text.length })
  }

  const scopeAll = (process.env.SMS_SCOPE || '').toLowerCase() === 'all'
  const list = await candidates(now)
  const dry = sp.get('dry') === '1' || !smsConfigured()
  const stats = { candidates: list.length, sent: 0, skippedScope: 0, skippedPhone: 0, failed: 0, dry, scope: scopeAll ? 'all' : 'guests' }
  const preview: { ref: string; day: string; time: string; phone: string; guest: boolean; text: string }[] = []

  for (const { row, day } of list) {
    const guest = await isGuest(row.user_id)
    if (!scopeAll && !guest) { stats.skippedScope++; continue }
    const phone = row.profiles?.phone || ''
    if (!toMsisdn(phone)) {
      stats.skippedPhone++
      if (!dry) await admin.from('bookings').update({ sms_reminder_sent: true }).eq('id', row.id) // ποτέ δεν θα σταλεί
      continue
    }
    const time = String(row.slot_start_time || '').slice(0, 5)
    const text = reminderText(day, time, row.locations?.name || '', row.booking_ref, row.locations?.google_maps_url)
    if (dry) { preview.push({ ref: row.booking_ref, day, time, phone: `…${phone.replace(/\D/g, '').slice(-3)}`, guest, text }); continue }

    // Claim-first: μόνο ένα run παίρνει την κράτηση.
    const { data: claimed } = await admin.from('bookings').update({ sms_reminder_sent: true })
      .eq('id', row.id).eq('sms_reminder_sent', false).select('id')
    if (!claimed || claimed.length === 0) continue
    const r = await sendSms(phone, text)
    if (r.ok) stats.sent++
    else {
      stats.failed++
      // Σίγουρη αποτυχία (όχι timeout) → ξεκλείδωμα για retry στο επόμενο run.
      if (r.error && !/abort|network/i.test(r.error)) await admin.from('bookings').update({ sms_reminder_sent: false }).eq('id', row.id)
      await alertCritical('Αποτυχία SMS υπενθύμισης', `booking: ${row.booking_ref}\n${r.error || r.skipped || ''}`).catch(() => null)
    }
  }
  return NextResponse.json({ ok: true, ...stats, ...(dry ? { preview } : {}) })
}
