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
