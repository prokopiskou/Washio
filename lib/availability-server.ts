// ============================================================
// Server-side έλεγχος διαθεσιμότητας — φορτώνει τα δεδομένα
// από τη DB και εφαρμόζει τους κοινούς κανόνες του lib/availability.
// Καλείται από: create-intent, create-cash, create-manual.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { athensToday, athensMinutesOfDay, weekdayMon1FromYmd } from '@/lib/time'
import { canBookSlot, isOpenAtMinutes, type OccupancyBooking } from '@/lib/availability'

export type AvailabilityCheckResult =
  | { ok: true; durationMinutes: number; capacity: number }
  | { ok: false; error: string }

/**
 * Ελέγχει αν μπορεί να γίνει κράτηση στο συγκεκριμένο slot,
 * με βάση ωράριο, εξαιρέσεις, capacity (μάνικες) και διάρκεια υπηρεσίας.
 */
export async function checkSlotAvailability(admin: SupabaseClient, args: {
  locationId: string
  serviceId: string
  slotDate: string      // 'YYYY-MM-DD'
  slotStartTime: string // 'HH:MM'
}): Promise<AvailabilityCheckResult> {
  const { locationId, serviceId, slotDate, slotStartTime } = args

  const dayOfWeek = (() => {
    const d = new Date(`${slotDate}T12:00:00`)
    const js = d.getDay()
    return js === 0 ? 7 : js
  })()

  const [
    { data: location },
    { data: service },
    { data: dayHours },
    { data: exception },
    { data: dayBookings },
  ] = await Promise.all([
    admin.from('locations').select('id, capacity').eq('id', locationId).maybeSingle(),
    admin.from('services').select('id, duration_minutes').eq('id', serviceId).maybeSingle(),
    admin.from('location_hours')
      .select('is_closed, open_time, close_time')
      .eq('location_id', locationId).eq('day_of_week', dayOfWeek).maybeSingle(),
    admin.from('location_hours_exceptions')
      .select('is_closed, closed_from, closed_to, periods')
      .eq('location_id', locationId).eq('exception_date', slotDate).maybeSingle(),
    admin.from('bookings')
      .select('slot_start_time, duration_minutes')
      .eq('location_id', locationId).eq('slot_date', slotDate)
      .not('status', 'in', '("cancelled","no_show")'),
  ])

  if (!location) return { ok: false, error: 'Άγνωστο πλυντήριο' }

  const capacity = Math.max(1, Number(location.capacity) || 1)
  const durationMinutes = Math.max(30, Number(service?.duration_minutes) || 30)

  const available = canBookSlot({
    dayHours: dayHours as { is_closed: boolean; open_time: string; close_time: string } | null,
    exception: exception as {
      is_closed: boolean; closed_from?: string | null; closed_to?: string | null
      periods?: { open: string; close: string }[] | null
    } | null,
    bookings: (dayBookings || []) as OccupancyBooking[],
    capacity,
    durationMinutes,
    isToday: slotDate === athensToday(),
    nowMinutes: athensMinutesOfDay(),
    startTime: slotStartTime,
  })

  if (!available) {
    return { ok: false, error: 'Η ώρα δεν είναι πλέον διαθέσιμη. Διάλεξε άλλη ώρα.' }
  }
  return { ok: true, durationMinutes, capacity }
}

/**
 * Αποφασίζει αν θα σταλεί ΤΩΡΑ ειδοποίηση νέας κράτησης στον πρατηριούχο.
 *
 * Κανόνας (κατόπιν επιλογής): ειδοποίηση ΜΟΝΟ όταν
 *   1) η κράτηση είναι για ΣΗΜΕΡΑ (ώρα Ελλάδας), ΚΑΙ
 *   2) το πλυντήριο είναι ΑΝΟΙΧΤΟ αυτή τη στιγμή (μέσα στο ωράριό του).
 *
 * Έτσι: μελλοντικές κρατήσεις → τις βλέπει στο πρόγραμμα το πρωί (καμία push),
 * σημερινές που μπαίνουν πριν ανοίξει / μετά κλείσει → καμία push.
 */
export async function shouldNotifyOwnerNow(
  admin: SupabaseClient,
  locationId: string,
  slotDate: string
): Promise<boolean> {
  // 1) Μόνο σημερινές κρατήσεις.
  if (slotDate !== athensToday()) return false

  // 2) Είναι ανοιχτά τώρα;
  const today = athensToday()
  const dayOfWeek = weekdayMon1FromYmd(today)
  const [{ data: dayHours }, { data: exception }] = await Promise.all([
    admin.from('location_hours')
      .select('is_closed, open_time, close_time')
      .eq('location_id', locationId).eq('day_of_week', dayOfWeek).maybeSingle(),
    admin.from('location_hours_exceptions')
      .select('is_closed, closed_from, closed_to, periods')
      .eq('location_id', locationId).eq('exception_date', today).maybeSingle(),
  ])

  return isOpenAtMinutes({
    dayHours: dayHours as { is_closed: boolean; open_time: string; close_time: string } | null,
    exception: exception as {
      is_closed: boolean; closed_from?: string | null; closed_to?: string | null
      periods?: { open: string; close: string }[] | null
    } | null,
    minutes: athensMinutesOfDay(),
  })
}
