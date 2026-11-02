// Συγκατάθεση cookies (ν. 3471/2006 · οδηγίες ΑΠΔΠΧ).
// Cookie `ws_consent` = "v1.a<0|1>.m<0|1>"  (a = στατιστικά/GA4, m = διαφήμιση/Meta).
// Το διαβάζει και ο server (CAPI μόνο με m=1 και όχι μέσα στην εφαρμογή).
// Native app: cookie `ws_native=1` (το βάζει το CapacitorInit) → καμία διαφημιστική παρακολούθηση (Apple ATT).

export const CONSENT_COOKIE = 'ws_consent'
export const NATIVE_COOKIE = 'ws_native'
export const CONSENT_EVENT = 'ws-consent'
export const CONSENT_OPEN_EVENT = 'ws-consent-open'

export type Consent = { analytics: boolean; marketing: boolean }

export function parseConsent(v?: string | null): Consent | null {
  if (!v) return null
  const m = /^v1\.a([01])\.m([01])$/.exec(decodeURIComponent(v))
  return m ? { analytics: m[1] === '1', marketing: m[2] === '1' } : null
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return m ? m[1] : null
}

export function getConsent(): Consent | null {
  return parseConsent(readCookie(CONSENT_COOKIE))
}

export function isNativeClient(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform())
}

/** Διαφήμιση (Meta Pixel / CAPI): μόνο με συγκατάθεση ΚΑΙ εκτός εφαρμογής. */
export function marketingAllowed(): boolean {
  return !!getConsent()?.marketing && !isNativeClient()
}

export function setConsent(c: Consent) {
  const v = `v1.a${c.analytics ? 1 : 0}.m${c.marketing ? 1 : 0}`
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${CONSENT_COOKIE}=${v}; path=/; max-age=${60 * 60 * 24 * 180}; SameSite=Lax${secure}`
  // Ανάκληση → σβήσε ό,τι έχουν ήδη γράψει Meta/Google.
  const host = location.hostname.replace(/^www\./, '')
  for (const name of document.cookie.split('; ').map(x => x.split('=')[0])) {
    const isMeta = name === '_fbp' || name === '_fbc'
    const isGa = name.startsWith('_ga') || name === '_gid' || name === '_gat'
    const kill = (!c.marketing && isMeta) || (!c.analytics && isGa)
    if (!kill) continue
    for (const d of ['', `; domain=${host}`, `; domain=.${host}`]) document.cookie = `${name}=; path=/; max-age=0${d}`
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: c }))
}

/** Άνοιγμα ρυθμίσεων cookies (π.χ. από footer / προφίλ). */
export function openConsentSettings() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))
}
