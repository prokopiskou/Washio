'use client'

import { Capacitor } from '@capacitor/core'
import { funnel } from '@/lib/funnel'

// Βαθμολογία ΕΦΑΡΜΟΓΗΣ (App Store / Google Play).
//  • Μέσα στην εφαρμογή (iOS/Android): το native παράθυρο της Apple/Google — αστέρια με ένα πάτημα,
//    χωρίς να βγει ο χρήστης στο store (plugin @capacitor-community/in-app-review).
//    Η Apple/Google ΑΠΟΦΑΣΙΖΟΥΝ αν θα εμφανιστεί (Apple: έως 3 φορές τον χρόνο ανά χρήστη) και ΔΕΝ μας λένε
//    αν βαθμολόγησε. Γι' αυτό: ξαναζητάμε το πολύ κάθε 60 μέρες, σε επόμενη 5★ κριτική.
//  • Στο web: ανοίγει τη σελίδα κριτικής στο store.
export const APPLE_ID = '6785925766'
export const ANDROID_PKG = 'gr.washio.app'
const KEY = 'washio_native_review_at'
const EVERY_MS = 60 * 864e5

export function storeReviewUrl(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  if (/android/i.test(ua)) return `https://play.google.com/store/apps/details?id=${ANDROID_PKG}`
  return `https://apps.apple.com/app/id${APPLE_ID}?action=write-review`
}

export const isNativeApp = () => { try { return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('InAppReview') } catch { return false } }

/** Native παράθυρο βαθμολογίας (αν επιτρέπεται τώρα). true = ζητήθηκε. */
export async function requestNativeReview(src: string): Promise<boolean> {
  if (!isNativeApp()) return false
  try {
    const last = Number(localStorage.getItem(KEY) || 0)
    if (last && Date.now() - last < EVERY_MS) return false
    localStorage.setItem(KEY, String(Date.now()))
  } catch { /* ignore */ }
  try {
    const { InAppReview } = await import('@capacitor-community/in-app-review')
    await InAppReview.requestReview()
    funnel('app_review_prompt', { meta: { src, platform: Capacitor.getPlatform() } })
    return true
  } catch { return false }
}

/** Κουμπί «Βαθμολόγησε την εφαρμογή»: native αν γίνεται, αλλιώς store. */
export async function openAppReview(src: string) {
  if (isNativeApp()) {
    try {
      const { InAppReview } = await import('@capacitor-community/in-app-review')
      await InAppReview.requestReview()
      funnel('app_review_prompt', { meta: { src, platform: Capacitor.getPlatform(), manual: true } })
      return
    } catch { /* fallback στο store */ }
  }
  funnel('app_review_store', { meta: { src } })
  window.open(storeReviewUrl(), '_blank', 'noopener,noreferrer')
}
