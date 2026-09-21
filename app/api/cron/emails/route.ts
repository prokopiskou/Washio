import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPush } from '@/lib/push'
import { alertCritical } from '@/lib/alert'

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
export const maxDuration = 60

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

  // ── Follow-up («πώς πήγε;»): slot πριν 50'–180' (πιάνει και αργοπορημένα runs).
  const followups = await bookingsInWindow(
    'id, booking_ref, slot_start_time, slot_date, locations(name), services(name), profiles(id, email, full_name)',
    'followup_sent',
    new Date(now.getTime() - 180 * 60 * 1000),
    new Date(now.getTime() - 50 * 60 * 1000),
  )

  // Χρήστες που έχουν ΗΔΗ βαθμολογήσει → δεν τους ξαναζητάμε review.
  const reviewedUsers = new Set<string>()
  {
    const { data: rv } = await supabase.from('profiles').select('id').eq('has_reviewed', true)
    for (const p of rv || []) reviewedUsers.add((p as { id: string }).id)
  }

  await inChunks(followups, 5, async (booking) => {
    const location = booking.locations as { name?: string } | null
    const service = booking.services as { name?: string } | null
    const profile = booking.profiles as { id?: string; email?: string; full_name?: string } | null
    if (!profile?.email || (profile.id && reviewedUsers.has(profile.id))) {
      await claim(booking.id, 'followup_sent') // κλείσε ως done, χωρίς email
      return
    }
    if (!(await claim(booking.id, 'followup_sent'))) return

    const ok = await sendEmail({
      type: 'followup',
      to: profile.email,
      bookingRef: booking.booking_ref,
      locationName: location?.name || '',
      service: service?.name || '',
      firstName: profile.full_name?.split(' ')[0] || '',
    })
    if (ok) { stats.followups++ }
    else {
      await unclaim(booking.id, 'followup_sent')
      stats.followupFailures++
      await alertCritical('Αποτυχία followup email', `booking: ${booking.booking_ref}\nto: ${profile.email}`).catch(() => null)
    }
  })

  // ── Operator reminder (push): ραντεβού σε ≤10' — μία φορά ανά κράτηση.
  const opReminders = await bookingsInWindow(
    'id, booking_ref, car_plate, slot_start_time, slot_date, locations(name, owner_id), services(name)',
    'operator_reminder_sent',
    now,
    new Date(now.getTime() + 10 * 60 * 1000),
  )

  await inChunks(opReminders, 5, async (booking) => {
    if (!(await claim(booking.id, 'operator_reminder_sent'))) return
    const location = booking.locations as { name?: string; owner_id?: string } | null
    const service = booking.services as { name?: string } | null
    if (location?.owner_id) {
      await sendPush(location.owner_id, {
        title: "Ραντεβού σε ~10' ⏰",
        body: `${service?.name || 'Πλύσιμο'} • ${booking.slot_start_time?.slice(0, 5) || ''}${booking.car_plate ? ' • ' + booking.car_plate : ''}`,
        url: '/dashboard',
      }).catch(() => null)
      stats.operatorReminders++
    }
  })

  return NextResponse.json(stats)
}
