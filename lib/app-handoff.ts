'use client'
// Σύνδεση web → εφαρμογή με τον ΙΔΙΟ λογαριασμό, χωρίς ξανά login (app/api/auth/handoff).
//
// WEB (συνδεδεμένος), πάτημα «Κατέβασε την εφαρμογή»:
//   1) κλειδί μιας χρήσης (prepareHandoff — έτοιμο πριν το πάτημα)
//   2) πρόχειρο ← https://www.washio.gr/h/<κλειδί>      (iPhone: το διαβάζει η εφαρμογή στο 1ο άνοιγμα)
//   3) Google Play link με referrer …&wl=<κλειδί>        (Android: Install Referrer, χωρίς τίποτα)
//   4) αν η εφαρμογή υπάρχει ήδη → ανοίγει απευθείας στο /h/<κλειδί>, αλλιώς → store
// ΕΦΑΡΜΟΓΗ (1ο άνοιγμα, χωρίς σύνδεση): checkInstallHandoff() → βρίσκει το κλειδί → συνδέεται.
import { createClient } from '@/lib/supabase/client'

const APP_STORE = 'https://apps.apple.com/app/apple-store/id6785925766?pt=129101712&ct=web_coupon_app_only&mt=8'
const playLink = (token?: string) => 'https://play.google.com/store/apps/details?id=gr.washio.app&referrer=' +
  encodeURIComponent(`utm_source=washio_web&utm_medium=coupon_app_only&utm_campaign=web_to_app${token ? `&wl=${token}` : ''}`)
const TOKEN_RE = /[A-Za-z0-9_-]{24,64}/

let cached: { token: string; at: number } | null = null

/** Web: φέρε νωρίς ένα κλειδί (μόνο για συνδεδεμένους). */
export async function prepareHandoff(): Promise<boolean> {
  if (cached && Date.now() - cached.at < 90 * 60_000) return true
  try {
    const r = await fetch('/api/auth/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    if (!r.ok) return false
    const j = await r.json()
    if (!j?.token) return false
    cached = { token: j.token, at: Date.now() }
    return true
  } catch { return false }
}

function storeLink(token?: string): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  return /iphone|ipad|ipod/i.test(ua) ? APP_STORE : /android/i.test(ua) ? playLink(token) : '/landing#app'
}

/** Web: ΜΕΣΑ στο πάτημα. Ανοίγει την εφαρμογή συνδεδεμένη ή πάει στο store με το κλειδί. */
export function goToAppSignedIn() {
  const token = cached?.token
  const store = storeLink(token)
  if (!token) { window.location.href = store; return }
  const h = `https://www.washio.gr/h/${token}`
  try { navigator.clipboard?.writeText(h).catch(() => {}) } catch { /* ignore */ }
  let left = false
  const onHide = () => { if (document.visibilityState === 'hidden') left = true }
  document.addEventListener('visibilitychange', onHide)
  window.location.href = `gr.washio.app://auth-callback?open=${encodeURIComponent(`/h/${token}`)}`
  setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide)
    if (!left && document.visibilityState === 'visible') window.location.href = store
  }, 1600)
}

/** Κλειδί → σύνδεση (verifyOtp). true αν συνδέθηκε. */
export async function redeemHandoff(token: string, via: string): Promise<boolean> {
  const m = TOKEN_RE.exec(token || '')
  if (!m) return false
  try {
    const r = await fetch('/api/auth/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redeem: m[0], via }) })
    if (!r.ok) return false
    const { th } = await r.json()
    if (!th) return false
    const { error } = await createClient().auth.verifyOtp({ token_hash: th, type: 'magiclink' })
    return !error
  } catch { return false }
}

/** Εφαρμογή, 1ο άνοιγμα χωρίς σύνδεση: Android → Install Referrer · iPhone → πρόχειρο. Μία φορά. */
export async function checkInstallHandoff(): Promise<boolean> {
  const { Capacitor, registerPlugin } = await import('@capacitor/core')
  if (!Capacitor.isNativePlatform()) return false
  // Παλιές εκδόσεις χωρίς τα plugins → τίποτα (και ΧΩΡΙΣ σημάδι, να ελεγχθεί μετά την ενημέρωση).
  const plat = Capacitor.getPlatform()
  if (!Capacitor.isPluginAvailable(plat === 'android' ? 'InstallReferrer' : 'Clipboard')) return false
  try {
    if (localStorage.getItem('ws_handoff_checked') === '1') return false
    localStorage.setItem('ws_handoff_checked', '1')
  } catch { return false }
  const { data } = await createClient().auth.getSession()
  if (data.session) return false
  let token = ''
  let via = ''
  try {
    if (Capacitor.getPlatform() === 'android') {
      const IR = registerPlugin<{ get: () => Promise<{ referrer?: string }> }>('InstallReferrer')
      const { referrer } = await IR.get()
      token = /(?:^|&)wl=([A-Za-z0-9_-]{24,64})/.exec(referrer || '')?.[1] || ''
      via = 'referrer'
    } else if (Capacitor.getPlatform() === 'ios') {
      const { Clipboard } = await import('@capacitor/clipboard')
      const { value } = await Clipboard.read()
      token = /washio\.gr\/h\/([A-Za-z0-9_-]{24,64})/.exec(value || '')?.[1] || ''
      via = 'clipboard'
      if (token) { try { await Clipboard.write({ string: '' }) } catch { /* ignore */ } }
    }
  } catch { return false }
  if (!token) return false
  return redeemHandoff(token, via)
}
