// Παγίδες ανίχνευσης αντιγραφής δεδομένων (ΜΟΝΟ στο δημόσιο API του χάρτη — δεν φαίνονται στους πελάτες).
// 1) Αόρατο υδατογράφημα στα ονόματα πλυντηρίων (χαρακτήρες μηδενικού πλάτους που κωδικοποιούν «WSH»).
//    Αν κάποιος αντιγράψει ονόματα από το API μας, το υδατογράφημα πάει μαζί → απόδειξη.
// 2) Ένα «ψεύτικο» πλυντήριο (CANARY_ID) που ο χάρτης μας κρύβει. Αν εμφανιστεί σε άλλη εφαρμογή → μας αντέγραψαν.
// Έλεγχος υδατογραφήματος σε κείμενο: hasWatermark(text).
const bits = [...'WSH'].map(c => c.charCodeAt(0).toString(2).padStart(8, '0')).join('')
export const WATERMARK = '⁠' + bits.replace(/0/g, '​').replace(/1/g, '‌') + '⁠'
export const hasWatermark = (s: string) => s.includes(WATERMARK)
export const stripWatermark = (s: string) => s.split(WATERMARK).join('')

export const CANARY_ID = '00000000-0000-4000-8000-00000000c0de'
export const CANARY_LOCATION = {
  id: CANARY_ID,
  name: 'AquaPrime Car Spa',
  address: 'Θηβών 214',
  city: 'Περιστέρι',
  slug: 'aquaprime-car-spa-peristeri',
  lat: 38.01247,
  lng: 23.68931,
  capacity: 2,
  photos: [] as string[],
  services: [{ id: '00000000-0000-4000-8000-00000000c0d1', name: 'Μέσα & Έξω', price: 17, price_moto: null, price_suv: 21, duration_minutes: 45, is_range: false, price_min: null, price_max: null, price_min_suv: null, price_max_suv: null, is_active: true, sort_order: 1 }],
  reviews: [{ rating: 5 }],
}
export const isCanary = (id: string | null | undefined) => id === CANARY_ID
