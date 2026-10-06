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

// Τελευταία γνωστή θέση (localStorage) — ο χάρτης κεντράρει ΑΜΕΣΩΣ εκεί,
// πριν απαντήσει το GPS. Ισχύει έως 24 ώρες.
const CACHE_KEY = 'washio_last_pos'
const CACHE_MAX_MS = 24 * 3600 * 1000

export function getCachedPosition(): GeoResult | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as GeoResult & { t: number }
    if (!c || Date.now() - c.t > CACHE_MAX_MS) return null
    return { latitude: c.latitude, longitude: c.longitude }
  } catch { return null }
}

function saveCachedPosition(p: GeoResult) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...p, t: Date.now() })) } catch { /* ignore */ }
}

// Απόσταση σε μέτρα (για να μην ξανα-ταξινομούμε/κεντράρουμε για μικρές διορθώσεις).
export function metersBetween(a: GeoResult, b: GeoResult): number {
  const R = 6371000, toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(b.latitude - a.latitude), dLng = toRad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * ΓΡΗΓΟΡΗ θέση σε 2 φάσεις:
 *  1) αμέσως: τελευταία γνωστή (cache), αν υπάρχει
 *  2) ~0,5″: θέση δικτύου/WiFi (enableHighAccuracy: false) — γρήγορη, ακρίβεια ~50–200μ
 *  3) στο παρασκήνιο: GPS υψηλής ακρίβειας — ενημερώνει ΜΟΝΟ αν μετακινήθηκε > 150μ
 * Το onUpdate καλείται σε κάθε βελτίωση. Επιστρέφει όταν βρεθεί η πρώτη πραγματική θέση.
 */
export async function getFastPosition(onUpdate: (p: GeoResult, source: 'cache' | 'quick' | 'precise') => void): Promise<void> {
  let last: GeoResult | null = getCachedPosition()
  if (last) onUpdate(last, 'cache')

  const quick = await getCurrentPosition({ enableHighAccuracy: false, timeout: 5000, maximumAge: 600000 }).catch(() => null)
  if (quick && (!last || metersBetween(last, quick) > 50)) { last = quick; onUpdate(quick, 'quick') }

  // Ακριβής θέση χωρίς να μπλοκάρει τίποτα.
  getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 })
    .then(precise => {
      if (!last || metersBetween(last, precise) > 150) { last = precise; onUpdate(precise, 'precise') }
    })
    .catch(() => { /* κρατάμε τη γρήγορη */ })
}

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
      const r = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
      saveCachedPosition(r)
      return r
    } catch {
      // πέφτουμε στο browser fallback παρακάτω
    }
  }

  // Browser fallback.
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('unsupported')); return }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const r = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
        saveCachedPosition(r)
        resolve(r)
      },
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

  // Μόνο η περιοχή/ο δήμος (π.χ. «Βύρωνας») — αυτό ψάχνει και αναγνωρίζει ο πελάτης.
  // (Πριν: «Άλιμος Αττικής» — περιττό, όλα τα πλυντήρια είναι Αττική.)
  return area.trim()
}
