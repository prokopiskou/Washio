import { isInternalDevice } from '@/lib/internal'

// Καταγραφή ανοίγματος χάρτη (μία φορά ανά συσκευή ανά 30') → /api/map-open.
// Στέλνει την πρώτη «φρέσκια» θέση (quick/precise). Αν δεν έρθει σε 10″ ή φύγει ο χρήστης,
// στέλνει την αποθηκευμένη (cache) ή «χωρίς θέση» — μετράμε και πόσοι δεν δίνουν τοποθεσία.

type Src = 'cache' | 'quick' | 'precise'
type Pos = { latitude: number; longitude: number }

const THROTTLE_KEY = 'ws_mo_at'
const DEVICE_KEY = 'ws_did'
const THROTTLE_MS = 30 * 60_000
const WAIT_MS = 10_000

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY)
    if (!id) {
      id = (crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`).slice(0, 40)
      localStorage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch { return '' }
}

function isNative(): boolean {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return !!cap?.isNativePlatform?.()
}

export function startMapOpenLog(): { onPosition: (p: Pos, source: Src) => void; stop: () => void } {
  const noop = { onPosition: () => {}, stop: () => {} }
  if (typeof window === 'undefined') return noop
  if (isInternalDevice()) return noop // ομάδα / δοκιμές
  try {
    const last = Number(localStorage.getItem(THROTTLE_KEY) || 0)
    if (Date.now() - last < THROTTLE_MS) return noop
  } catch { /* ignore */ }

  const startedAt = Date.now()
  let sent = false
  let fallback: { p: Pos; source: Src } | null = null

  const send = (p: Pos | null, source: Src | 'none') => {
    if (sent) return
    sent = true
    cleanup()
    try { localStorage.setItem(THROTTLE_KEY, String(Date.now())) } catch { /* ignore */ }
    try {
      fetch('/api/map-open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: deviceId(), lat: p?.latitude, lng: p?.longitude, source, native: isNative() }),
        keepalive: true,
      }).catch(() => {})
    } catch { /* ignore */ }
  }

  const flush = () => send(fallback?.p ?? null, fallback?.source ?? 'none')
  const onHide = () => { if (document.visibilityState === 'hidden') flush() }
  const timer = window.setTimeout(flush, WAIT_MS)
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', flush)

  function cleanup() {
    window.clearTimeout(timer)
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('pagehide', flush)
  }

  return {
    onPosition: (p, source) => {
      if (sent) return
      if (source === 'cache') { fallback = { p, source }; return }
      send(p, source)
    },
    // Ο χρήστης έφυγε από τον χάρτη (client navigation) → στείλε ό,τι έχουμε.
    // <1,5″ = dev StrictMode remount ή «αναπήδηση» → απλώς καθάρισε, μη μετρήσεις.
    stop: () => {
      if (Date.now() - startedAt < 1500) { sent = true; cleanup(); return }
      flush()
    },
  }
}
