// Καταγραφή βημάτων της διαδρομής κράτησης → /api/funnel (μία φορά ανά βήμα/πλυντήριο ανά συνεδρία).
// Σκοπός: να δούμε σε ποιο βήμα φεύγουν όσοι ανοίγουν τον χάρτη και δεν κλείνουν.
import { isInternalDevice } from '@/lib/internal'

export type FunnelStep =
  | 'map_open' | 'washer_open' | 'washer_page' | 'no_slots' | 'service_select' | 'slot_select'
  | 'book_click' | 'login_wall' | 'booking_page' | 'pay_click' | 'booked'
  // Μετά την κράτηση: ακύρωση vs αλλαγή ώρας.
  | 'cancel_open' | 'cancel_save_click' | 'rescheduled' | 'cancelled'

function storageId(store: 'local' | 'session', key: string): string {
  try {
    const s = store === 'local' ? localStorage : sessionStorage
    let id = s.getItem(key)
    if (!id) {
      id = (crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`).slice(0, 40)
      s.setItem(key, id)
    }
    return id
  } catch { return '' }
}

export function funnel(step: FunnelStep, opts: { locationId?: string | null; meta?: Record<string, unknown>; once?: boolean } = {}): void {
  if (typeof window === 'undefined') return
  if (isInternalDevice()) return
  const loc = opts.locationId || ''
  if (opts.once !== false) {
    try {
      const k = `fx_${step}_${loc}`
      if (sessionStorage.getItem(k)) return
      sessionStorage.setItem(k, '1')
    } catch { /* ignore */ }
  }
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  try {
    fetch('/api/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step,
        sessionId: storageId('session', 'ws_sid'),
        deviceId: storageId('local', 'ws_did'),
        locationId: loc || null,
        meta: opts.meta || null,
        native: !!cap?.isNativePlatform?.(),
      }),
      keepalive: true,
    }).catch(() => {})
  } catch { /* ignore */ }
}
