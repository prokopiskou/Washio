'use client'
// Web → εφαρμογή με τον ΙΔΙΟ λογαριασμό (app/api/auth/app-handoff).
// 1) prepareHandoff(): φέρνει νωρίς ένα token (για να γίνει το άνοιγμα ΜΕΣΑ στο πάτημα — Chrome/Safari
//    ανοίγουν εφαρμογή μόνο από άμεσο πάτημα).
// 2) openAppSignedIn(): ανοίγει gr.washio.app://… · αν η εφαρμογή δεν υπάρχει (η σελίδα μένει ορατή) → store.
import { storeLinkForDevice } from '@/lib/app-coupon'

let cached: { th: string; at: number } | null = null

export async function prepareHandoff(): Promise<boolean> {
  if (cached && Date.now() - cached.at < 20 * 60_000) return true
  try {
    const r = await fetch('/api/auth/app-handoff', { method: 'POST' })
    if (!r.ok) return false
    const j = await r.json()
    if (!j?.th) return false
    cached = { th: j.th, at: Date.now() }
    return true
  } catch { return false }
}

export function appSchemeUrl(next = '/map'): string | null {
  if (!cached) return null
  const link = `/auth/link?token_hash=${encodeURIComponent(cached.th)}&next=${encodeURIComponent(next)}`
  return `gr.washio.app://auth-callback?open=${encodeURIComponent(link)}`
}

/** Άνοιξε την εφαρμογή συνδεδεμένο· αν δεν είναι εγκατεστημένη → store. */
export function openAppSignedIn(next = '/map') {
  const url = appSchemeUrl(next)
  const store = storeLinkForDevice()
  if (!url) { window.location.href = store; return }
  let left = false
  const onHide = () => { if (document.visibilityState === 'hidden') left = true }
  document.addEventListener('visibilitychange', onHide)
  window.location.href = url
  setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide)
    if (!left && document.visibilityState === 'visible') window.location.href = store
    else cached = null // χρησιμοποιήθηκε — το επόμενο πάτημα φέρνει νέο
  }, 1600)
}
