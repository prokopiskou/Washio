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
