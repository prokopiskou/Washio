// «Κλείσε ξανά με ένα πάτημα»: το τελευταίο ολοκληρωμένο πλύσιμο του πελάτη → ίδιο πλυντήριο, ίδια υπηρεσία,
// ΧΩΡΙΣ πρόσθετα, στην πιο κοντινή ελεύθερη ώρα γύρω από την ώρα που είχε έρθει την τελευταία φορά.
// Χρησιμοποιείται από: κάρτα αρχικής (components/RebookCard), /rebook (push «Ώρα για φρεσκάρισμα;»).
import type { SupabaseClient } from '@supabase/supabase-js'
import { athensEpoch, athensMinutesOfDay, athensToday, weekdayMon1FromYmd } from '@/lib/time'
import { computeSlots, toMinutes, type HoursException, type OccupancyBooking, type WeeklyHours } from '@/lib/availability'

/** Από πόσες μέρες μετά το τελευταίο πλύσιμο εμφανίζεται η κάρτα «Κλείσε ξανά». */
export const REBOOK_AFTER_DAYS = 7
const LOOKAHEAD_DAYS = 7

export type RebookSuggestion = {
  daysSince: number
  location: { id: string; name: string; slug: string }
  service: { id: string; name: string; price: number }
  date: string; slot: string
  url: string        // checkout με όλα έτοιμα
  otherTimeUrl: string // σελίδα πλυντηρίου με επιλεγμένη την υπηρεσία
}

const addDays = (ymd: string, n: number) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }

type Row = {
  id: string; location_id: string; service_id: string | null; slot_date: string; slot_start_time: string; duration_minutes: number | null
  car_model: string | null; checked_in_at: string | null; status: string
  services: { id: string; name: string; price: number | null; price_suv: number | null; price_moto: number | null; duration_minutes: number | null; is_active: boolean | null; is_range: boolean | null } | null
  locations: { id: string; name: string; slug: string; capacity: number | null; is_active: boolean | null } | null
}

export async function suggestRebook(db: SupabaseClient, userId: string): Promise<RebookSuggestion | null> {
  const today = athensToday()
  const { data } = await db.from('bookings')
    .select('id, location_id, service_id, slot_date, slot_start_time, duration_minutes, car_model, checked_in_at, status, services(id, name, price, price_suv, price_moto, duration_minutes, is_active, is_range), locations(id, name, slug, capacity, is_active)')
    .eq('user_id', userId).not('status', 'in', '(cancelled,no_show)')
    .order('slot_date', { ascending: false }).order('slot_start_time', { ascending: false }).limit(15)
  const rows = (data || []) as unknown as Row[]
  const now = Date.now()
  // Έχει ήδη επόμενη κράτηση → δεν προτείνουμε τίποτα.
  if (rows.some(b => athensEpoch(b.slot_date, b.slot_start_time) > now && !b.checked_in_at)) return null
  // Τελευταίο ΑΠΛΟ πλύσιμο (όχι βιολογικός/εύρος τιμής — αυτά δεν επαναλαμβάνονται κάθε 2 εβδομάδες).
  const last = rows.find(b => b.services && !b.services.is_range && b.services.is_active !== false && b.locations?.is_active !== false && b.locations?.slug)
  if (!last || !last.services || !last.locations) return null
  const daysSince = Math.floor((now - athensEpoch(last.slot_date, last.slot_start_time)) / 864e5)
  const loc = last.locations, svc = last.services
  const duration = Math.max(30, Number(svc.duration_minutes) || 30)
  const wantMin = toMinutes(String(last.slot_start_time).slice(0, 5))

  const days = Array.from({ length: LOOKAHEAD_DAYS }, (_, i) => addDays(today, i))
  const [{ data: hours }, { data: exc }, { data: busy }] = await Promise.all([
    db.from('location_hours').select('day_of_week, is_closed, open_time, close_time, open_time2, close_time2').eq('location_id', loc.id),
    db.from('location_hours_exceptions').select('exception_date, is_closed, closed_from, closed_to, periods').eq('location_id', loc.id).in('exception_date', days),
    db.from('bookings').select('slot_date, slot_start_time, duration_minutes').eq('location_id', loc.id).in('slot_date', days).not('status', 'in', '(cancelled,no_show)'),
  ])
  let pick: { date: string; slot: string } | null = null
  for (const d of days) {
    const dow = weekdayMon1FromYmd(d)
    const slots = computeSlots({
      dayHours: ((hours || []).find(h => h.day_of_week === dow) || null) as WeeklyHours,
      exception: ((exc || []).find(e => e.exception_date === d) || undefined) as HoursException,
      bookings: ((busy || []).filter(b => b.slot_date === d)) as OccupancyBooking[],
      capacity: Math.max(1, Number(loc.capacity) || 1), durationMinutes: duration,
      isToday: d === today, nowMinutes: athensMinutesOfDay(),
      leadMinutes: 90, // σήμερα: τουλάχιστον 1,5 ώρα μετά — να προλάβει να πάει
    }).filter(s => s.available)
    if (!slots.length) continue
    const best = slots.reduce((a, b) => Math.abs(toMinutes(b.time) - wantMin) < Math.abs(toMinutes(a.time) - wantMin) ? b : a)
    pick = { date: d, slot: best.time }
    break
  }
  const otherTimeUrl = `/locations/${loc.slug}?service=${svc.id}&utm_source=rebook`
  if (!pick) return null
  const q = new URLSearchParams({ location: loc.id, service: svc.id, slot: pick.slot, date: pick.date, vehicleType: 'ΙΧ', utm_source: 'rebook' })
  if (last.car_model) q.set('carModel', last.car_model) // η σελίδα κράτησης βρίσκει μόνη της ΙΧ/SUV από το μοντέλο
  return {
    daysSince,
    location: { id: loc.id, name: loc.name, slug: loc.slug },
    service: { id: svc.id, name: svc.name, price: Number(svc.price) || 0 },
    date: pick.date, slot: pick.slot,
    url: `/booking?${q.toString()}`, otherTimeUrl,
  }
}
