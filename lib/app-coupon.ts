// −3€ πρώτου πλυσίματος ΜΟΝΟ σε κρατήσεις από την εφαρμογή (iOS/Android).
// Λόγος (23/11): όσοι έχουν την εφαρμογή ξανακλείνουν ~26% vs ~3% στο web.
// Στο web: τιμή χωρίς κουπόνι + «Κατέβασε την εφαρμογή για το −3€».
// Washio Club (5ο πλύσιμο) ΔΕΝ επηρεάζεται. Για επαναφορά: false.
export const APP_ONLY_COUPON = true

/** Client: τρέχει μέσα στην εφαρμογή (Capacitor); */
export function inNativeApp(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return !!cap?.isNativePlatform?.()
}

/** Client: το κουπόνι ισχύει σε αυτή τη συσκευή/κανάλι; */
export function couponChannelOk(): boolean {
  return !APP_ONLY_COUPON || inNativeApp()
}

const APP_STORE = 'https://apps.apple.com/app/apple-store/id6785925766?pt=129101712&ct=web_coupon_app_only&mt=8'
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=gr.washio.app&referrer=' +
  encodeURIComponent('utm_source=washio_web&utm_medium=coupon_app_only&utm_campaign=web_to_app')

/** Client: link καταστήματος για τη συσκευή (iPhone → App Store, Android → Play, αλλιώς /landing#app). */
export function storeLinkForDevice(): string {
  if (typeof navigator === 'undefined') return '/landing#app'
  const ua = navigator.userAgent || ''
  return /iphone|ipad|ipod/i.test(ua) ? APP_STORE : /android/i.test(ua) ? PLAY_STORE : '/landing#app'
}
