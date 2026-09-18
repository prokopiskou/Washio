import type { SupabaseClient } from '@supabase/supabase-js'
import {
  INACTIVE_STATUS_FILTER,
  isSlotTooSoon,
  offeredTimesForDay,
  weekdayMon1FromYmd,
} from '@/lib/slots'

export async function offeredTimesForLocationDate(
  admin: SupabaseClient,
  locationId: string,
  slotDate: string,
): Promise<string[]> {
  const dayOfWeek = weekdayMon1FromYmd(slotDate)

  const { data: exception } = await admin
    .from('location_hours_exceptions')
    .select('periods, is_closed')
    .eq('location_id', locationId)
    .eq('exception_date', slotDate)
    .maybeSingle()

  if (exception) {
    return offeredTimesForDay(null, exception)
  }

  const { data: hours } = await admin
    .from('location_hours')
    .select('open_time, close_time, is_closed')
    .eq('location_id', locationId)
    .eq('day_of_week', dayOfWeek)
    .maybeSingle()

  return offeredTimesForDay(hours)
}

/** Μήνυμα σφάλματος αν το slot δεν πρέπει να κλείσει, αλλιώς null. */
export async function slotBookingBlockReason(
  admin: SupabaseClient,
  locationId: string,
  slotDate: string,
  slotStartTime: string,
): Promise<string | null> {
  const time = (slotStartTime || '').slice(0, 5)
  const offered = await offeredTimesForLocationDate(admin, locationId, slotDate)
  if (!offered.includes(time)) {
    return 'Η ώρα δεν ανήκει στο ωράριο του πρατηρίου.'
  }
  if (isSlotTooSoon(time, slotDate)) {
    return 'Η ώρα είναι πολύ κοντά. Διάλεξε επόμενο διαθέσιμο slot.'
  }

  const { data: existing } = await admin
    .from('bookings')
    .select('id, slot_start_time')
    .eq('location_id', locationId)
    .eq('slot_date', slotDate)
    .not('status', 'in', INACTIVE_STATUS_FILTER)

  if ((existing || []).some(b => (b.slot_start_time || '').slice(0, 5) === time)) {
    return 'Το slot μόλις κλείστηκε. Διάλεξε άλλη ώρα.'
  }
  return null
}
