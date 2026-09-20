// ============================================================
// Washio — ΚΟΙΝΗ λογική διαθεσιμότητας slots.
// Χρησιμοποιείται από: χάρτη, σελίδα πλυντηρίου, server routes
// (create-cash, create-intent, create-manual) και dashboard.
//
// ΕΝΑΣ κανόνας, ΕΝΑ σημείο. Μην ξαναγράψεις slot logic αλλού.
//
// Κανόνες:
//  - Slots ανά 30' μέσα στο ωράριο της μέρας.
//  - Lead time: ένα slot κλείνεται μόνο αν ξεκινά ≥ SLOT_LEAD_MINUTES
//    λεπτά από τώρα (ώρα Ελλάδας).
//  - Capacity (μάνικες): ένα slot είναι γεμάτο όταν οι ταυτόχρονες
//    κρατήσεις του = capacity του πλυντηρίου.
//  - Διάρκεια: υπηρεσία διάρκειας D δεσμεύει ceil(D/30) διαδοχικά
//    slots. Για βιολογικό 90' χρειάζονται 3 συνεχόμενα ελεύθερα.
//  - Εξαιρέσεις: is_closed = όλη μέρα κλειστό,
//    closed_from/closed_to = κλειστό μόνο σε αυτό το διάστημα.
// ============================================================

export const SLOT_STEP_MINUTES = 30
export const SLOT_LEAD_MINUTES = 15

export type WeeklyHours = {
  is_closed?: boolean
  open_time: string
  close_time: string
} | null | undefined

export type HoursException = {
  is_closed: boolean
  closed_from?: string | null
  closed_to?: string | null
  // Παλιό σχήμα (ώρες ΛΕΙΤΟΥΡΓΙΑΣ εκείνης της μέρας) — υποστηρίζεται για συμβατότητα.
  periods?: { open: string; close: string }[] | null
} | null | undefined

export type OccupancyBooking = {
  slot_start_time: string // 'HH:MM' ή 'HH:MM:SS'
  duration_minutes?: number | null
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function toTimeStr(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, '0')
  const m = (minutes % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

/** Slots ανά 30' από open έως close (χωρίς το close). */
export function generateSlots(openTime: string, closeTime: string): string[] {
  const slots: string[] = []
  let cur = toMinutes(openTime)
  const end = toMinutes(closeTime)
  while (cur < end) {
    slots.push(toTimeStr(cur))
    cur += SLOT_STEP_MINUTES
  }
  return slots
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

export type SlotAvailability = {
  time: string
  available: boolean
}

export type ComputeSlotsArgs = {
  dayHours: WeeklyHours
  exception?: HoursException
  bookings: OccupancyBooking[]
  capacity: number
  /** Διάρκεια της υπηρεσίας που θέλει να κλείσει ο χρήστης. Default 30'. */
  durationMinutes?: number
  /** true αν η ημερομηνία είναι η σημερινή (ώρα Ελλάδας). */
  isToday: boolean
  /** Λεπτά από τα μεσάνυχτα ΤΩΡΑ (ώρα Ελλάδας). Αγνοείται αν !isToday. */
  nowMinutes?: number
}

/**
 * Επιστρέφει ΟΛΑ τα slots της μέρας με flag διαθεσιμότητας.
 * Ένα slot είναι διαθέσιμο ως ΩΡΑ ΕΝΑΡΞΗΣ της ζητούμενης υπηρεσίας όταν:
 *  - όλο το διάστημα [start, start+duration) είναι μέσα στο ωράριο
 *  - δεν πέφτει σε κλειστό διάστημα εξαίρεσης
 *  - κάθε 30λεπτο του διαστήματος έχει occupancy < capacity
 *  - (σήμερα) start ≥ now + SLOT_LEAD_MINUTES
 */
export function computeSlots(args: ComputeSlotsArgs): SlotAvailability[] {
  const {
    dayHours, exception, bookings, capacity,
    durationMinutes = SLOT_STEP_MINUTES, isToday, nowMinutes = 0,
  } = args

  // Όλη μέρα κλειστά;
  if (exception?.is_closed) return []

  // Βάση: εβδομαδιαίο ωράριο — ΕΚΤΟΣ αν υπάρχει παλιού τύπου εξαίρεση
  // με δηλωμένες ώρες λειτουργίας (periods) για τη συγκεκριμένη μέρα.
  let baseRanges: { open: string; close: string }[]
  const legacyPeriods = exception?.periods
  const hasLegacy = !exception?.closed_from && Array.isArray(legacyPeriods) && legacyPeriods.length > 0
  if (hasLegacy) {
    baseRanges = legacyPeriods!
  } else {
    if (!dayHours || dayHours.is_closed) return []
    baseRanges = [{ open: dayHours.open_time.slice(0, 5), close: dayHours.close_time.slice(0, 5) }]
  }

  // Κλειστό διάστημα από νέου τύπου εξαίρεση ώρας.
  const closedFrom = exception?.closed_from ? toMinutes(exception.closed_from.slice(0, 5)) : null
  const closedTo = exception?.closed_to ? toMinutes(exception.closed_to.slice(0, 5)) : null
  const hasClosedRange = closedFrom !== null && closedTo !== null && closedTo > closedFrom

  // Occupancy ανά 30λεπτο: πόσες κρατήσεις καλύπτουν κάθε slot.
  const active = bookings.filter(b => b.slot_start_time)
  const occupancy = (slotStart: number): number => {
    const slotEnd = slotStart + SLOT_STEP_MINUTES
    let count = 0
    for (const b of active) {
      const bStart = toMinutes(b.slot_start_time.slice(0, 5))
      const bEnd = bStart + (b.duration_minutes || SLOT_STEP_MINUTES)
      if (overlaps(slotStart, slotEnd, bStart, bEnd)) count++
    }
    return count
  }

  const stepsNeeded = Math.max(1, Math.ceil(durationMinutes / SLOT_STEP_MINUTES))

  // Ένα 30λεπτο είναι «ανοιχτό» αν είναι μέσα σε κάποιο base range
  // και δεν πέφτει σε κλειστό διάστημα.
  const isStepOpen = (stepStart: number): boolean => {
    const stepEnd = stepStart + SLOT_STEP_MINUTES
    const inBase = baseRanges.some(rg =>
      stepStart >= toMinutes(rg.open) && stepEnd <= toMinutes(rg.close)
    )
    if (!inBase) return false
    if (hasClosedRange && overlaps(stepStart, stepEnd, closedFrom!, closedTo!)) return false
    return true
  }

  const result: SlotAvailability[] = []
  for (const rg of baseRanges) {
    for (const time of generateSlots(rg.open, rg.close)) {
      const start = toMinutes(time)

      // Το ίδιο το slot πρέπει να είναι ανοιχτό (μπορεί να κόβεται από εξαίρεση ώρας).
      if (!isStepOpen(start)) {
        result.push({ time, available: false })
        continue
      }

      let ok = true

      // Lead time (μόνο σήμερα).
      if (isToday && start < nowMinutes + SLOT_LEAD_MINUTES) ok = false

      // Όλα τα 30λεπτα της διάρκειας: ανοιχτά ΚΑΙ με χώρο.
      if (ok) {
        for (let i = 0; i < stepsNeeded; i++) {
          const step = start + i * SLOT_STEP_MINUTES
          if (!isStepOpen(step) || occupancy(step) >= capacity) { ok = false; break }
        }
      }

      result.push({ time, available: ok })
    }
  }
  return result
}

/** true αν η συγκεκριμένη ώρα έναρξης είναι διαθέσιμη — για server-side validation. */
export function canBookSlot(args: ComputeSlotsArgs & { startTime: string }): boolean {
  const slots = computeSlots(args)
  const t = args.startTime.slice(0, 5)
  return slots.some(s => s.time === t && s.available)
}
