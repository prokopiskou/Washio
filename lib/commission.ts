// Πλυντήρια όπου, όταν ο πελάτης χρησιμοποιεί κουπόνι −3€, η Washio ΔΕΝ παίρνει
// προμήθεια για εκείνη την κράτηση (συμφωνία με το πλυντήριο). Σε όλες τις άλλες
// κρατήσεις τους (χωρίς κουπόνι) η προμήθεια ισχύει κανονικά.
export const NO_COMMISSION_ON_COUPON_LOCATION_IDS = new Set<string>([
  '458dfa16-47c1-471a-ad7a-acdf08d11cce', // RANACAR WASH
  '019bcedf-9092-484a-971a-8b8a68232cd9', // AS Wash&Detailing
])

// Το κουπόνι καλωσορίσματος/παραπομπής είναι 3€ — μόνο τότε μηδενίζεται η προμήθεια.
export const COUPON_EUR = 3

export function couponWaivesCommission(locationId: string | null | undefined, appliedCredit: number): boolean {
  return !!locationId
    && NO_COMMISSION_ON_COUPON_LOCATION_IDS.has(locationId)
    && Math.abs((Number(appliedCredit) || 0) - COUPON_EUR) < 0.005
}

/** Σύνολο extras (πρόσθετα) μιας κράτησης — δέχεται [{name, price}] ή [{n, p}]. */
export function addonsTotalOf(addons: unknown): number {
  if (!Array.isArray(addons)) return 0
  return +addons.reduce((s: number, a) => {
    const o = (a || {}) as { price?: unknown; p?: unknown }
    return s + (Number(o.price ?? o.p) || 0)
  }, 0).toFixed(2)
}

// Προμήθεια Washio για μια κράτηση.
//  • Κανονικά: ποσοστό επί του ποσού που πληρώνει ο πελάτης (τιμή − κουπόνι).
//  • Συμφωνία «χωρίς προμήθεια με κουπόνι» (AS, Ranacar): το μηδέν ισχύει ΜΟΝΟ για το πλύσιμο.
//    Κάθε extra προϊόν/υπηρεσία έχει κανονική προμήθεια επί της τιμής του.
export function platformFeeFor(o: {
  locationId: string | null | undefined
  appliedCredit: number
  payable: number
  addonsTotal: number
  ratePct: number
}): number {
  const r = (Number(o.ratePct) || 0) / 100
  const base = couponWaivesCommission(o.locationId, o.appliedCredit)
    ? Math.max(0, Number(o.addonsTotal) || 0)
    : Math.max(0, Number(o.payable) || 0)
  return +(base * r).toFixed(2)
}
