import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPush } from '@/lib/push'
import { computeSlots, toMinutes, type HoursException } from '@/lib/availability'
import { athensToday, athensMinutesOfDay, weekdayMon1FromYmd } from '@/lib/time'
import { isInternalEmail } from '@/lib/internal'

// Push στο ΠΛΥΝΤΗΡΙΟ ~15' πριν ανοίξει: «Οι κρατήσεις σου σήμερα» — για να δει τι έχει.
// Τρέχει από το /api/cron/emails (κάθε 15'). Παράθυρο: 7–22' πριν το άνοιγμα → πιάνεται μία φορά.
// Μία φορά τη μέρα ανά πλυντήριο (locations.morning_push_date · supabase/washer_morning.sql).
// Χωρίς κρατήσεις → δεν στέλνει τίποτα. Δεν μετράει κρατήσεις της ομάδας (δοκιμές).
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const today = athensToday()
  const now = athensMinutesOfDay()
  const dow = weekdayMon1FromYmd(today)

  const { data: locs, error } = await db.from('locations')
    .select('id, name, owner_id, morning_push_date').eq('is_active', true)
  if (error) return NextResponse.json({ ok: false, skipped: 'column', error: error.message })
  const pending = (locs || []).filter(l => l.owner_id && l.morning_push_date !== today)
  if (!pending.length) return NextResponse.json({ ok: true, sent: 0 })

  const ids = pending.map(l => l.id)
  const [{ data: hours }, { data: excs }] = await Promise.all([
    db.from('location_hours').select('location_id, day_of_week, open_time, close_time, open_time2, close_time2, is_closed').eq('day_of_week', dow).in('location_id', ids),
    db.from('location_hours_exceptions').select('location_id, exception_date, periods, is_closed, closed_from, closed_to').eq('exception_date', today).in('location_id', ids),
  ])

  let sent = 0
  for (const l of pending) {
    const dayAll = computeSlots({
      dayHours: (hours || []).find(h => h.location_id === l.id) || null,
      exception: (excs || []).find(e => e.location_id === l.id) as HoursException,
      bookings: [], capacity: 1, durationMinutes: 30, isToday: false, nowMinutes: 0,
    })
    if (!dayAll.length) continue // κλειστό σήμερα
    const open = toMinutes(dayAll[0].time)
    const before = open - now
    if (before < 7 || before > 22) continue

    // Claim πρώτα (να μη σταλεί δύο φορές αν τρέξουν δύο crons μαζί).
    const { data: claimed } = await db.from('locations').update({ morning_push_date: today })
      .eq('id', l.id).or(`morning_push_date.is.null,morning_push_date.neq.${today}`).select('id')
    if (!claimed?.length) continue

    const { data: bks } = await db.from('bookings')
      .select('slot_start_time, user_id, source, services(name), profiles(email)')
      .eq('location_id', l.id).eq('slot_date', today).not('status', 'in', '(cancelled,no_show)')
      .order('slot_start_time')
    const real = ((bks || []) as unknown as { slot_start_time: string; source: string | null; services: { name?: string } | null; profiles: { email?: string } | null }[])
      .filter(b => !isInternalEmail(b.profiles?.email))
    if (!real.length) continue

    const times = real.map(b => String(b.slot_start_time).slice(0, 5))
    const n = real.length
    const body = n === 1
      ? `Έχεις 1 κράτηση για σήμερα: ${times[0]}${real[0].services?.name ? ' · ' + real[0].services.name : ''}.`
      : `Έχεις ${n} κρατήσεις για σήμερα: ${times.slice(0, 6).join(', ')}${n > 6 ? '…' : ''}.`
    try {
      await sendPush(l.owner_id as string, { title: `Οι κρατήσεις σου σήμερα · ${String(l.name).trim()}`, body, url: "/dashboard" })
      sent++
    } catch { /* best-effort */ }
  }
  return NextResponse.json({ ok: true, sent })
}
