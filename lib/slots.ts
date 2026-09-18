// Κανόνες διαθεσιμότητας slots — μία πηγή αλήθειας για προφίλ πρατηρίου, χάρτη και APIs.
// Ζώνη: Europe/Athens. Πηγή ωραρίου: location_hours + location_hours_exceptions
// (οι εξαιρέσεις υπερισχύουν πάντα του εβδομαδιαίου).

import { athensMinutesOfDay, athensToday, weekdayMon1FromYmd } from '@/lib/time'

export const SLOT_INTERVAL_MINUTES = 30
export const MIN_LEAD_MINUTES = 15
export const TIGHT_SLOT_THRESHOLD_MINUTES = 20
export const NOW_WINDOW_MINUTES = 60

export const INACTIVE_STATUS_FILTER = '("cancelled","no_show")'

export type WeeklyHours = {
  open_time: string
  close_time: string
  is_closed?: boolean | null
}

export type HoursException = {
  is_closed?: boolean | null
  periods?: { open: string; close: string }[] | null
}

export type AnnotatedSlot = {
  time: string
  available: boolean
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.slice(0, 5).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function generateSlots(openTime: string, closeTime: string): string[] {
  const slots: string[] = []
  let current = timeToMinutes(openTime)
  const end = timeToMinutes(closeTime)
  while (current < end) {
    const h = Math.floor(current / 60).toString().padStart(2, '0')
    const min = (current % 60).toString().padStart(2, '0')
    slots.push(`${h}:${min}`)
    current += SLOT_INTERVAL_MINUTES
  }
  return slots
}

/** Ώρες που προσφέρει το πρατήριο τη συγκεκριμένη μέρα. Κενό = κλειστό. */
export function offeredTimesForDay(
  weekly: WeeklyHours | null | undefined,
  exception?: HoursException | null,
): string[] {
  if (exception) {
    if (exception.is_closed) return []
    return (exception.periods || []).flatMap(p => generateSlots(p.open, p.close))
  }
  if (!weekly || weekly.is_closed) return []
  return generateSlots(weekly.open_time, weekly.close_time)
}

export function isSlotTooSoon(
  slotTime: string,
  dateStr: string,
  leadMinutes: number = MIN_LEAD_MINUTES,
  now: Date = new Date(),
): boolean {
  if (dateStr !== athensToday(now)) return false
  return timeToMinutes(slotTime) < athensMinutesOfDay(now) + leadMinutes
}

export function annotateSlots(
  times: string[],
  bookedTimes: Set<string>,
  dateStr: string,
  leadMinutes: number = MIN_LEAD_MINUTES,
  now: Date = new Date(),
): AnnotatedSlot[] {
  return times.map(time => ({
    time,
    available: !bookedTimes.has(time) && !isSlotTooSoon(time, dateStr, leadMinutes, now),
  }))
}

export function nextAvailableSlot(
  times: string[],
  bookedTimes: Set<string>,
  dateStr: string,
  opts?: { leadMinutes?: number; maxMinutesAhead?: number; now?: Date },
): string | null {
  const lead = opts?.leadMinutes ?? MIN_LEAD_MINUTES
  const now = opts?.now ?? new Date()
  const nowMin = athensMinutesOfDay(now)
  const isToday = dateStr === athensToday(now)
  const maxMin = opts?.maxMinutesAhead != null ? nowMin + opts.maxMinutesAhead : Infinity

  return times.find(t => {
    if (bookedTimes.has(t)) return false
    if (!isToday) return true
    const slotMin = timeToMinutes(t)
    return slotMin >= nowMin + lead && slotMin <= maxMin
  }) || null
}

export function minutesUntilSlot(slotTime: string, now: Date = new Date()): number {
  return timeToMinutes(slotTime) - athensMinutesOfDay(now)
}

export { weekdayMon1FromYmd }
