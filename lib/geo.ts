// ============================================================
// Τοποθεσία χρήστη — native πρώτα, browser fallback.
//
// Στο iOS το WKWebView ΔΕΝ αποθηκεύει μόνιμα το permission του
// navigator.geolocation — γι' αυτό το app ξαναρωτούσε «Allow» σε
// κάθε άνοιγμα. Το @capacitor/geolocation μιλάει με το native
// CoreLocation: το «Allow» γράφεται ΜΙΑ φορά στα Settings του
// iPhone και κρατάει για πάντα.
// ============================================================

import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

export type GeoResult = { latitude: number; longitude: number }

export async function getCurrentPosition(options?: {
  enableHighAccuracy?: boolean
  timeout?: number
  maximumAge?: number
}): Promise<GeoResult> {
  const opts = {
    enableHighAccuracy: options?.enableHighAccuracy ?? true,
    timeout: options?.timeout ?? 10000,
    maximumAge: options?.maximumAge ?? 300000,
  }

  if (Capacitor.isNativePlatform()) {
    // Native (iOS/Android): μόνιμο permission μέσω του λειτουργικού.
    // ΠΡΟΣΟΧΗ: παλιά binaries (1.0/1.0.1) φορτώνουν το washio.gr αλλά ΔΕΝ
    // περιέχουν το plugin → UNIMPLEMENTED. Σε κάθε αποτυχία → browser fallback.
    try {
      const pos = await Geolocation.getCurrentPosition(opts)
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
    } catch {
      // πέφτουμε στο browser fallback παρακάτω
    }
  }

  // Browser fallback.
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('unsupported')); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      err => reject(err),
      opts
    )
  })
}

// ============================================================
// Εξαγωγή περιοχής (δήμος + περιφέρεια) από Google Places address_components.
//
// Πρόβλημα: για την Αθήνα το Google επιστρέφει «Νότιος Τομέας Αθηνών»
// (administrative_area_level_2) ως locality σε πολλές διευθύνσεις — γενικό
// και άχρηστο για τον χρήστη. Θέλουμε τον ΔΗΜΟ, π.χ. «Άλιμος Αττικής».
//
// Προτεραιότητα: γειτονιά/δήμος (sublocality → admin_level_3 → locality),
// αγνοώντας «Τομέα», «Athens/Αθήνα» και νομαρχιακούς όρους. Μετά προσθέτουμε
// «Αττικής» όταν η περιφέρεια είναι Αττική.
// ============================================================

type AddrComp = { long_name: string; short_name?: string; types: string[] }

const SECTOR_RE = /τομέα|τομέας|sector|περιφερειακή ενότητα|regional unit|νομός|prefecture/i
const GENERIC_RE = /^(αθήνα|athens|greece|ελλάδα|ελλάς)$/i

export function extractCityLabel(components: AddrComp[] | undefined | null): string {
  if (!components || components.length === 0) return ''
  let subloc = '', al3 = '', al2 = '', locality = '', al1 = ''
  for (const c of components) {
    const t = c.types || []
    if (t.includes('sublocality_level_1') || t.includes('sublocality')) subloc = c.long_name
    if (t.includes('administrative_area_level_3')) al3 = c.long_name
    if (t.includes('administrative_area_level_2')) al2 = c.long_name
    if (t.includes('locality')) locality = c.long_name
    if (t.includes('administrative_area_level_1')) al1 = c.long_name
  }

  const usable = (s: string) => !!s && !SECTOR_RE.test(s) && !GENERIC_RE.test(s)
  // Ο δήμος/η γειτονιά — με σειρά προτίμησης.
  let area = ''
  for (const cand of [subloc, al3, locality]) {
    if (usable(cand)) { area = cand; break }
  }
  if (!area) area = locality || al3 || subloc || al2 || ''

  // Περιφέρεια → «Αττικής» (γενική) όταν είναι Αττική· αλλιώς κενό.
  const isAttica = /αττικ|attic/i.test(al1) || /αττικ|attic/i.test(al2)
  const region = isAttica ? 'Αττικής' : ''

  return [area, region].filter(Boolean).join(' ').trim()
}
