import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPush } from '@/lib/push'
import { alertCritical } from '@/lib/alert'
import { processReferralRewards } from '@/lib/referral-server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = 'https://washio.gr'

// Ώρα/ημερομηνία σε ζώνη Ελλάδας (Europe/Athens) — όχι UTC του server.
function athensParts(d: Date): { date: string; time: string } {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Athens',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]))
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` }
}

// Το instant (epoch ms) μιας ώρας που δίνεται σε τοπική ώρα Ελλάδας.
function athensEpoch(dateStr: string, timeStr: string): number {
  const naive = new Date(`${dateStr}T${timeStr.slice(0, 5)}:00Z`).getTime()
  // Offset Αθήνας εκείνη τη στιγμή (χειρίζεται θερινή/χειμερινή ώρα).
  const local = new Date(naive)
  const asAthens = new Date(local.toLocaleString('en-US', { timeZone: 'Europe/Athens' }))
  const asUtc = new Date(local.toLocaleString('en-US', { timeZone: 'UTC' }))
  const offset = asUtc.getTime() - asAthens.getTime()
  return naive + offset
}

// Φυσικό κείμενο για «σε πόση ώρα» (στρογγυλοποίηση στα 5').
function untilText(minutes: number): string {
  const m = Math.max(5, Math.round(minutes / 5) * 5)
  if (m >= 55 && m <= 65) return 'σε ~1 ώρα'
  return `σε ~${m} λεπτά`
}

// Επιστρέφει true ΜΟΝΟ αν το email όντως στάλθηκε (πριν αγνοούσαμε το status
// και μαρκάραμε «στάλθηκε» ακόμα κι όταν το Resend γύριζε 500).
async function sendEmail(payload: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_API_SECRET || '',
      },
      body: JSON.stringify(payload),
    })
    return res.ok
  } catch {
    return false
  }
}

type Flag = 'reminder_sent' | 'followup_sent' | 'operator_reminder_sent'

// Claim-first: μαρκάρει το flag ΜΟΝΟ αν ήταν false. Αν δύο cron runs τρέξουν
// ταυτόχρονα (late GitHub Actions + επόμενο), μόνο το ένα «παίρνει» την κράτηση.
async function claim(id: string, flag: Flag): Promise<boolean> {
  const { data } = await supabase.from('bookings')
    .update({ [flag]: true }).eq('id', id).eq(flag, false).select('id')
  return !!(data && data.length > 0)
}
async function unclaim(id: string, flag: Flag) {
  await supabase.from('bookings').update({ [flag]: false }).eq('id', id)
}

// Κρατήσεις με slot μέσα σε [from, to] (ώρα Ελλάδας). Χειρίζεται και παράθυρο
// που περνάει μεσάνυχτα (δύο ημερομηνίες) — πριν αυτό γύριζε κενό σύνολο.
/* eslint-disable @typescript-eslint/no-explicit-any -- dynamic select/joins από supabase builder */
async function bookingsInWindow(select: string, flag: Flag, from: Date, to: Date, extra?: (q: any) => any) {
  const a = athensParts(from), b = athensParts(to)
  const base = () => {
    let q: any = supabase.from('bookings').select(select).eq('status', 'confirmed').eq(flag, false)
    if (extra) q = extra(q)
    return q
  }
  if (a.date === b.date) {
    const { data } = await base().eq('slot_date', a.date).gte('slot_start_time', a.time).lte('slot_start_time', b.time)
    return (data || []) as any[]
  }
  const [{ data: d1 }, { data: d2 }] = await Promise.all([
    base().eq('slot_date', a.date).gte('slot_start_time', a.time),
    base().eq('slot_date', b.date).lte('slot_start_time', b.time),
  ])
  return [...(d1 || []), ...(d2 || [])] as any[]
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// Τρέχει μέχρι N παράλληλα, χωρίς ένα σφάλμα να ρίχνει τα υπόλοιπα.
async function inChunks<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += n) {
    await Promise.allSettled(items.slice(i, i + n).map(fn))
  }
}

// Vercel: default 10" — με 8+ κρατήσεις στο παράθυρο κοβόταν η λούπα.
export const maxDuration = 120

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const stats = { reminders: 0, reminderFailures: 0, followups: 0, followupFailures: 0, operatorReminders: 0 }

  // ── Reminder πελάτη: slot σε 45–80' (πλατύ παράθυρο ώστε ένα αργοπορημένο/
  //    χαμένο cron run των 15' να ΜΗΝ αφήνει κρατήσεις χωρίς υπενθύμιση).
  //    Last-minute κρατήσεις (φτιαγμένες τα τελευταία 30') εξαιρούνται ρητά.
  const reminders = await bookingsInWindow(
    'id, user_id, booking_ref, car_plate, slot_start_time, slot_date, created_at, locations(name, address, city), services(name), profiles(email, full_name)',
    'reminder_sent',
    new Date(now.getTime() + 45 * 60 * 1000),
    new Date(now.getTime() + 80 * 60 * 1000),
    q => q.lt('created_at', new Date(now.getTime() - 30 * 60 * 1000).toISOString()),
  )

  await inChunks(reminders, 5, async (booking) => {
    const location = booking.locations as { name?: string; address?: string; city?: string } | null
    const service = booking.services as { name?: string } | null
    const profile = booking.profiles as { email?: string; full_name?: string } | null
    if (!profile?.email) { await claim(booking.id, 'reminder_sent'); return }
    if (!(await claim(booking.id, 'reminder_sent'))) return // το πήρε άλλο run

    const mins = Math.round((athensEpoch(booking.slot_date, booking.slot_start_time) - now.getTime()) / 60000)
    const until = untilText(mins)

    const ok = await sendEmail({
      type: 'reminder',
      to: profile.email,
      bookingRef: booking.booking_ref,
      locationName: location?.name || '',
      locationAddress: `${location?.address || ''}, ${location?.city || ''}`,
      service: service?.name || '',
      date: booking.slot_date,
      time: booking.slot_start_time?.slice(0, 5),
      plate: booking.car_plate || '',
      until,
    })

    // Push best-effort (δεν καθορίζει επιτυχία/αποτυχία της υπενθύμισης).
    const bUserId = (booking as { user_id?: string }).user_id
    if (bUserId) {
      await sendPush(bUserId, {
        title: `⏰ Το ραντεβού σου ${until}`,
        body: `${location?.name || 'Πλυντήριο'} • ${booking.slot_start_time?.slice(0, 5) || ''}. Σε περιμένουν!`,
        url: '/profile/bookings',
      }).catch(() => null)
    }

    if (ok) { stats.reminders++ }
    else {
      // Δεν στάλθηκε → ξεκλείδωσε για retry στο επόμενο run + ειδοποίηση.
      await unclaim(booking.id, 'reminder_sent')
      stats.reminderFailures++
      await alertCritical('Αποτυχία reminder email', `booking: ${booking.booking_ref}\nto: ${profile.email}`).catch(() => null)
    }
  })

  // ── Follow-up / αίτημα κριτικής → /api/cron/review-requests (push → email → SMS, ανά πλυντήριο).

  // ── Operator reminder (push): ραντεβού σε 10–20' — μία φορά ανά κράτηση, με ΟΛΑ τα στοιχεία.
  // Παράθυρο 20' (το cron τρέχει κάθε 15') → φτάνει πάντα ~10–20' πριν, ποτέ την ώρα του ραντεβού.
  const opReminders = await bookingsInWindow(
    'id, booking_ref, car_plate, car_model, customer_name, slot_start_time, slot_date, total_amount, coupon_amount, stripe_payment_intent_id, addons, locations(name, owner_id), services(name), profiles(full_name, phone)',
    'operator_reminder_sent',
    now,
    new Date(now.getTime() + 20 * 60 * 1000),
  )

  // Ταξί (στήλη bookings.is_taxi — supabase/vehicle_models.sql). Ξεχωριστό query: αν λείπει η στήλη, απλώς χωρίς.
  const taxiIds = new Set<string>()
  if (opReminders.length) {
    const { data: tx, error: txErr } = await supabase.from('bookings').select('id').in('id', opReminders.map((b: { id: string }) => b.id)).eq('is_taxi', true)
    if (!txErr) for (const r of tx || []) taxiIds.add(r.id)
  }
  await inChunks(opReminders, 5, async (booking) => {
    if (!(await claim(booking.id, 'operator_reminder_sent'))) return
    const location = booking.locations as { name?: string; owner_id?: string } | null
    const service = booking.services as { name?: string } | null
    const prof = booking.profiles as { full_name?: string; phone?: string } | null
    if (location?.owner_id) {
      const hhmm = String(booking.slot_start_time || '').slice(0, 5)
      const mins = Math.max(0, Math.round((athensEpoch(booking.slot_date, hhmm) - now.getTime()) / 60000))
      const name = String(booking.customer_name || prof?.full_name || '').trim()
      const addonNames = (Array.isArray(booking.addons) ? booking.addons : [])
        .map((a: { name?: string; n?: string }) => String(a?.name || a?.n || '').trim()).filter(Boolean)
      const total = Number(booking.total_amount) || 0
      const coupon = Number(booking.coupon_amount) || 0
      const due = Math.max(0, total - coupon)
      const eur = (n: number) => n.toFixed(2).replace('.', ',').replace(',00', '') + '€'
      const paid = !!booking.stripe_payment_intent_id
      const money = paid
        ? `💳 Πληρωμένο online ${eur(due)} — μην ζητήσεις χρήματα`
        : `💶 Πληρώνει εκεί ${eur(due)}${coupon > 0 ? ` (κουπόνι −${eur(coupon)})` : ''}`
      const car = ['🚗', booking.car_model, booking.car_plate, taxiIds.has(booking.id) ? '🚕 ΤΑΞΙ' : ''].filter(Boolean).join(' ').replace(/^🚗$/, '')
      const lines = [
        [name || 'Πελάτης', prof?.phone].filter(Boolean).join(' · '),
        [service?.name || 'Πλύσιμο', addonNames.length ? '+ ' + addonNames.join(', ') : ''].filter(Boolean).join(' '),
        car,
        money,
        booking.booking_ref,
      ].filter(Boolean)
      await sendPush(location.owner_id, {
        title: `Ραντεβού σε ${mins}' ⏰ · ${hhmm}`,
        body: lines.join('\n'),
        url: `/dashboard?booking=${booking.id}`,
      }).catch(() => null)
      stats.operatorReminders++
    }
  })

  // ── Referral: +3€ στον referrer όταν ολοκληρωθεί το πρώτο πλύσιμο του φίλου ──
  const referralRewards = await processReferralRewards(supabase)

  // Τα υπόλοιπα crons τρέχουν μαζί με αυτό (ό,τι χτυπά το /api/cron/emails κάθε 15' —
  // το GitHub workflow είναι απενεργοποιημένο, οπότε rebook / welcome-nudge / push δεν έτρεχαν ΠΟΤΕ).
  // Παράλληλα, best-effort· το καθένα έχει δικούς του κανόνες (ώρες, 1 φορά ανά χρήστη, claim).
  const SUB = ['sms', 'rebook', 'welcome-nudge', 'coupon-report', 'wash-reminders', 'loyalty-drops', 'washer-morning', 'lead-followups', 'campaigns', 'metrics-daily', 'announcement-reminders', 'review-requests', 'feedback-calls', 'ads-sync'] as const
  const athH = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  const callSub = async (name: string) => {
    // Push «ώρα για πλύσιμο»: μόνο 10:00–20:59 (δεν έχει δικό του έλεγχο ώρας).
    if (name === 'wash-reminders' && (athH < 10 || athH > 20)) return { skipped: 'hours' }
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 45_000)
      const r = await fetch(`${BASE_URL.replace('://washio.gr', '://www.washio.gr')}/api/cron/${name}`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: ctrl.signal,
      })
      clearTimeout(t)
      return await r.json().catch(() => ({ status: r.status }))
    } catch (e) { return { error: e instanceof Error ? e.message : 'fetch' } }
  }
  const subResults = await Promise.all(SUB.map(n => callSub(n)))
  const sub = Object.fromEntries(SUB.map((n, i) => [n, subResults[i]]))
  const sms = sub['sms']

  return NextResponse.json({ ...stats, referralRewards, sms, sub })
}
