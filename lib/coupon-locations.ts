// Πλυντήρια που ΔΕΝ δέχονται το κουπόνι −3€ (καλωσορίσματος / παραπομπής).
// Το κουπόνι το απορροφά το πλυντήριο· όποιο δεν το θέλει μπαίνει εδώ.
//  • Server (create-intent, create-cash): δεν εφαρμόζεται κουπόνι σε κράτηση εκεί — το υπόλοιπο του πελάτη μένει άθικτο.
//  • Εφαρμογή (χάρτης, σελίδα πλυντηρίου, checkout): οι τιμές φαίνονται ΧΩΡΙΣ −3€ και, αν ο πελάτης έχει κουπόνι,
//    βλέπει ειδοποίηση ότι το πλυντήριο δεν περιλαμβάνεται στην έκπτωση.
// Το Washio Club (5ο πλύσιμο στο ίδιο πλυντήριο) ΔΕΝ επηρεάζεται.
export const NO_COUPON_LOCATION_IDS = new Set<string>([
  '135fecab-7251-4e0e-b823-91740a833251', // Αύρα carwash (Νέα Φιλαδέλφεια)
])

export function couponAllowedAt(locationId: string | null | undefined): boolean {
  return !locationId || !NO_COUPON_LOCATION_IDS.has(locationId)
}

export const NO_COUPON_NOTICE = {
  el: 'Το πλυντήριο δεν περιλαμβάνεται στην έκπτωση −3€ για την πρώτη σας κράτηση.',
  en: 'This car wash is not included in the −€3 first-booking discount.',
} as const
