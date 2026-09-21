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

// Ημερομηνία ημερολογίου ως 'YYYY-MM-DD' από τοπικά πεδία του Date (όχι UTC / toISOString).
export function ymdFromLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Ημέρα εβδομάδας για 'YYYY-MM-DD': 1 = Δευτέρα … 7 = Κυριακή
// (ίδιο mapping με location_hours.day_of_week).
export function weekdayMon1FromYmd(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  const utcNoon = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12, 0, 0))
  const jsDay = utcNoon.getUTCDay()
  return jsDay === 0 ? 7 : jsDay
}

// Το instant (epoch ms) μιας ώρας 'YYYY-MM-DD' + 'HH:MM' σε τοπική ώρα Ελλάδας.
// Χειρίζεται σωστά θερινή/χειμερινή ώρα. Ασφαλές για server (UTC) και client.
export function athensEpoch(dateStr: string, timeStr: string): number {
  const naive = new Date(`${dateStr}T${String(timeStr).slice(0, 5)}:00Z`).getTime()
  const local = new Date(naive)
  const asAthens = new Date(local.toLocaleString('en-US', { timeZone: 'Europe/Athens' }))
  const asUtc = new Date(local.toLocaleString('en-US', { timeZone: 'UTC' }))
  return naive + (asUtc.getTime() - asAthens.getTime())
}
