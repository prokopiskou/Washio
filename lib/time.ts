// Ώρα/ημερομηνία ΠΑΝΤΑ σε ζώνη Ελλάδας (Europe/Athens), ανεξάρτητα από τη ζώνη
// της συσκευής/server. Για να μη μετατοπίζονται slots/«τώρα»/«σήμερα» όταν ο χρήστης
// ή ο server δεν είναι σε ελληνική ζώνη.
const ATHENS = 'Europe/Athens'

function athensFields(d: Date): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: ATHENS,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  })
  const out: Record<string, string> = {}
  for (const part of fmt.formatToParts(d)) out[part.type] = part.value
  return out
}

// 'YYYY-MM-DD' στην ώρα Ελλάδας.
export function athensToday(d: Date = new Date()): string {
  const p = athensFields(d)
  return `${p.year}-${p.month}-${p.day}`
}

// Λεπτά από τα μεσάνυχτα (0-1439) στην ώρα Ελλάδας.
export function athensMinutesOfDay(d: Date = new Date()): number {
  const p = athensFields(d)
  return Number(p.hour) * 60 + Number(p.minute)
}
