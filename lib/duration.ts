// Εμφάνιση διάρκειας: λεπτά κάτω από 1 ώρα, ώρες από 60' και πάνω.
//   45  → «45′»
//   60  → «1 ώρα»      90 → «1 ώρα 30′»
//   1440 → «24 ώρες»  (π.χ. βιολογικός αυτοκινήτου / παιδικού καθίσματος)
export function formatDuration(minutes: number | null | undefined, locale: 'el' | 'en' = 'el'): string {
  const m = Math.max(0, Math.round(Number(minutes) || 0))
  if (m < 60) return `${m}′`
  const h = Math.floor(m / 60)
  const r = m % 60
  const hours = locale === 'en' ? `${h} h` : `${h} ${h === 1 ? 'ώρα' : 'ώρες'}`
  return r ? `${hours} ${r}′` : hours
}
