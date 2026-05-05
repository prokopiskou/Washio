import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = 'https://washio-ten.vercel.app'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // Reminder — κρατήσεις που ξεκινούν σε 50-70 λεπτά
  const reminderFrom = new Date(now.getTime() + 50 * 60 * 1000)
  const reminderTo = new Date(now.getTime() + 70 * 60 * 1000)

  const reminderFromTime = reminderFrom.toTimeString().slice(0, 5)
  const reminderToTime = reminderTo.toTimeString().slice(0, 5)
  const todayDate = now.toISOString().split('T')[0]

  const { data: reminders } = await supabase
    .from('bookings')
    .select(`
      id, booking_ref, car_plate, slot_start_time, slot_date, total_amount,
      reminder_sent,
      locations (name, address, city),
      services (name),
      profiles (email, full_name)
    `)
    .eq('status', 'confirmed')
    .eq('reminder_sent', false)
    .eq('slot_date', todayDate)
    .gte('slot_start_time', reminderFromTime)
    .lte('slot_start_time', reminderToTime)

  for (const booking of reminders || []) {
    const location = booking.locations as any
    const service = booking.services as any
    const profile = booking.profiles as any

    if (!profile?.email) continue

    await fetch(`${BASE_URL}/api/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'reminder',
        to: profile.email,
        bookingRef: booking.booking_ref,
        locationName: location?.name || '',
        locationAddress: `${location?.address || ''}, ${location?.city || ''}`,
        service: service?.name || '',
        date: booking.slot_date,
        time: booking.slot_start_time?.slice(0, 5),
        plate: booking.car_plate || '',
      })
    })

    await supabase
      .from('bookings')
      .update({ reminder_sent: true })
      .eq('id', booking.id)
  }

  // Follow-up — κρατήσεις που ξεκίνησαν 50-70 λεπτά πριν
  const followupFrom = new Date(now.getTime() - 70 * 60 * 1000)
  const followupTo = new Date(now.getTime() - 50 * 60 * 1000)

  const followupFromTime = followupFrom.toTimeString().slice(0, 5)
  const followupToTime = followupTo.toTimeString().slice(0, 5)

  const { data: followups } = await supabase
    .from('bookings')
    .select(`
      id, booking_ref, slot_start_time, slot_date,
      followup_sent,
      locations (name),
      services (name),
      profiles (email, full_name)
    `)
    .eq('status', 'confirmed')
    .eq('followup_sent', false)
    .eq('slot_date', todayDate)
    .gte('slot_start_time', followupFromTime)
    .lte('slot_start_time', followupToTime)

  for (const booking of followups || []) {
    const location = booking.locations as any
    const service = booking.services as any
    const profile = booking.profiles as any

    if (!profile?.email) continue

    const firstName = profile.full_name?.split(' ')[0] || ''

    await fetch(`${BASE_URL}/api/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'followup',
        to: profile.email,
        bookingRef: booking.booking_ref,
        locationName: location?.name || '',
        service: service?.name || '',
        firstName,
      })
    })

    await supabase
      .from('bookings')
      .update({ followup_sent: true })
      .eq('id', booking.id)
  }

  return NextResponse.json({
    reminders: reminders?.length || 0,
    followups: followups?.length || 0,
  })
}