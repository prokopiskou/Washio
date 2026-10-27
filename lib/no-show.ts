import { athensEpoch } from '@/lib/time'

// Παράθυρο «Δεν εμφανίστηκε» (no-show) για το πλυντήριο:
// το κουμπί ανοίγει 15' μετά την ώρα του ραντεβού και μένει μέχρι το ΤΕΛΟΣ ΤΗΣ ΗΜΕΡΑΣ του ραντεβού
// (23:59 ώρα Ελλάδας) — και τουλάχιστον 5 ώρες (για βραδινά ραντεβού).
// Αν δεν πατηθεί μέχρι τότε, η κράτηση μετράει ως ολοκληρωμένη.
export const NO_SHOW_FROM_MIN = 15
export const NO_SHOW_UNTIL_MIN = 5 * 60

/** Μέχρι πότε (epoch ms) επιτρέπεται το «Δεν εμφανίστηκε». */
export function noShowDeadline(slotDate: string, slotStartTime: string): number {
  const start = athensEpoch(slotDate, slotStartTime)
  const endOfDay = athensEpoch(slotDate, '23:59') + 59_000
  return Math.max(start + NO_SHOW_UNTIL_MIN * 60_000, endOfDay)
}
