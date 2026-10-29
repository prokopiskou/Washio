// Υπηρεσίες εύρους (π.χ. βιολογικός): ο πελάτης κλείνει με εύρος (π.χ. 50–80€).
// Στη βάση το total_amount = μέσος όρος → πάνω σε αυτόν υπολογίζεται η προμήθεια (backend).
// Στο πλυντήριο / admin ΔΕΝ δείχνουμε τον μέσο όρο — δείχνουμε το εύρος.
export type RangeSvc = {
  is_range?: boolean | null
  price_min?: number | null; price_max?: number | null
  price_min_suv?: number | null; price_max_suv?: number | null
} | null | undefined

export const RANGE_SVC_COLS = 'is_range, price_min, price_max, price_min_suv, price_max_suv'

/** «50–80» αν η κράτηση είναι υπηρεσία εύρους, αλλιώς null. Διαλέγει κανονικό/SUV από τον μέσο όρο. */
export function rangeLabel(total: number | null | undefined, svc: RangeSvc): string | null {
  if (!svc?.is_range) return null
  const t = Number(total) || 0
  const opts: [number, number][] = []
  const a = Number(svc.price_min) || 0, b = Number(svc.price_max) || 0
  const c = Number(svc.price_min_suv) || 0, d = Number(svc.price_max_suv) || 0
  if (a > 0 && b >= a) opts.push([a, b])
  if (c > 0 && d >= c) opts.push([c, d])
  if (!opts.length) return null
  opts.sort((x, y) => Math.abs((x[0] + x[1]) / 2 - t) - Math.abs((y[0] + y[1]) / 2 - t))
  const [lo, hi] = opts[0]
  return `${lo.toFixed(0)}–${hi.toFixed(0)}`
}
