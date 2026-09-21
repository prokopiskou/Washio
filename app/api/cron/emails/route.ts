import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPush } from '@/lib/push'

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

async function sendEmail(payload: Record<string, unknown>) {
  await fetch(`${BASE_URL}/api/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': process.env.INTERNAL_API_SECRET || '',
    },
    body: JSON.stringify(payload),
  })
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Reminder: κράτηση ~1 ώρα μπροστά (παράθυρο 50–70').
  const remFrom = athensParts(new Date(now.getTime() + 50 * 60 * 1000))
  const remTo = athensParts(new Date(now.getTime() + 70 * 60 * 1000))

  const { data: reminders } = await supabase
    .from('bookings')
    .select('id, user_id, booking_ref, car_plate, slot_start_time, slot_date, total_amount, reminder_sent, locations(name, address, city), services(name), profiles(email, full_name)')
    .eq('status', 'confirmed')
    .eq('reminder_sent', false)
    .eq('slot_date', remFrom.date)
    .gte('slot_start_time', remFrom.time)
    .lte('slot_start_time', remTo.time)

  for (const booking of reminders || []) {
    const location = booking.locations as { name?: string; address?: string; city?: string } | null
    const service = booking.services as { name?: string } | null
    const profile = booking.profiles as { email?: string; full_name?: string } | null
    if (!profile?.email) continue

    // Πραγματικός χρόνος μέχρι το ραντεβού → ακριβές κείμενο (όχι σταθερό «1 ώρα»).
    const mins = Math.round((athensEpoch(booking.slot_date, booking.slot_start_time) - now.getTime()) / 60000)
    const until = untilText(mins)

    await sendEmail({
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

    // PUSH στον πελάτη με τον ίδιο πραγματικό χρόνο.
    // Το παράθυρο 50–70' εγγυάται ότι last-minute κρατήσεις (π.χ. για σε 30')
    // ΔΕΝ μπαίνουν εδώ — δεν προλαβαίνουν ποτέ να είναι 50-70' μπροστά.
    const bUserId = (booking as { user_id?: string }).user_id
    if (bUserId) {
      await sendPush(bUserId, {
        title: `⏰ Το ραντεβού σου ${until}`,
        body: `${location?.name || 'Πλυντήριο'} • ${booking.slot_start_time?.slice(0, 5) || ''}. Σε περιμένουν!`,
        url: '/profile/bookings',
      })
    }

    await supabase.from('bookings').update({ reminder_sent: true }).eq('id', booking.id)
  }

  // Follow-up: ~1 ώρα μετά (παράθυρο -70'..-50').
  const folFrom = athensParts(new Date(now.getTime() - 70 * 60 * 1000))
  const folTo = athensParts(new Date(now.getTime() - 50 * 60 * 1000))

  const { data: followups } = await supabase
    .from('bookings')
    .select('id, booking_ref, slot_start_time, slot_date, followup_sent, locations(name), services(name), profiles(id, email, full_name)')
    .eq('status', 'confirmed')
    .eq('followup_sent', false)
    .eq('slot_date', folFrom.date)
    .gte('slot_start_time', folFrom.time)
    .lte('slot_start_time', folTo.time)

  // Χρήστες που έχουν ΗΔΗ βαθμολογήσει → δεν τους ξαναζητάμε review.
  // Defensive: αν η στήλη has_reviewed δεν υπάρχει ακόμα, σύνολο κενό
  // (στέλνει κανονικά — τίποτα δεν σπάει).
  const reviewedUsers = new Set<string>()
  {
    const { data: rv } = await supabase.from('profiles').select('id').eq('has_reviewed', true)
    for (const p of rv || []) reviewedUsers.add((p as { id: string }).id)
  }

  for (const booking of followups || []) {
    const location = booking.locations as { name?: string } | null
    const service = booking.services as { name?: string } | null
    const profile = booking.profiles as { id?: string; email?: string; full_name?: string } | null
    if (!profile?.email) continue

    // Έχει ήδη βαθμολογήσει σε προηγούμενο πλύσιμο → κλείσε ως done, χωρίς email.
    if (profile.id && reviewedUsers.has(profile.id)) {
      await supabase.from('bookings').update({ followup_sent: true }).eq('id', booking.id)
      continue
    }

    const firstName = profile.full_name?.split(' ')[0] || ''

    await sendEmail({
      type: 'followup',
      to: profile.email,
      bookingRef: booking.booking_ref,
      locationName: location?.name || '',
      service: service?.name || '',
      firstName,
    })

    await supabase.from('bookings').update({ followup_sent: true }).eq('id', booking.id)
  }

  // Operator reminder (push): φεύγει μόλις το ραντεβού είναι ≤10' μακριά — μία φορά ανά κράτηση.
  const opFrom = athensParts(now)
  const opTo = athensParts(new Date(now.getTime() + 10 * 60 * 1000))

  const { data: opReminders } = await supabase
    .from('bookings')
    .select('id, booking_ref, car_plate, slot_start_time, slot_date, operator_reminder_sent, locations(name, owner_id), services(name)')
    .eq('status', 'confirmed')
    .eq('operator_reminder_sent', false)
    .eq('slot_date', opFrom.date)
    .gte('slot_start_time', opFrom.time)
    .lte('slot_start_time', opTo.time)

  for (const booking of opReminders || []) {
    const location = booking.locations as { name?: string; owner_id?: string } | null
    const service = booking.services as { name?: string } | null
    if (location?.owner_id) {
      await sendPush(location.owner_id, {
        title: "Ραντεβού σε ~10' ⏰",
        body: `${service?.name || 'Πλύσιμο'} • ${booking.slot_start_time?.slice(0, 5) || ''}${booking.car_plate ? ' • ' + booking.car_plate : ''}`,
        url: '/dashboard',
      })
    }
    await supabase.from('bookings').update({ operator_reminder_sent: true }).eq('id', booking.id)
  }

  return NextResponse.json({
    reminders: reminders?.length || 0,
    followups: followups?.length || 0,
    operatorReminders: opReminders?.length || 0,
  })
}
