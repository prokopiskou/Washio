'use client'

// iPhone: παράθυρο Apple ATT («Να επιτρέπεται η παρακολούθηση;») — plugin AppTracking (ios/App/App/AppDelegate.swift, από 1.0.6).
// Κανόνας: Meta (server-side CAPI) από iPhone ΜΟΝΟ αν ο χρήστης πει «Ναι» στην Apple ΚΑΙ «Αποδοχή» στα cookies.
// Το cookie ws_native γίνεται 'ios_att' μόνο με «Ναι» της Apple — αλλιώς '1' (καμία αποστολή).
import { getConsent } from '@/lib/consent'

type Cap = { isNativePlatform?: () => boolean; getPlatform?: () => string; isPluginAvailable?: (n: string) => boolean }
type Att = { getStatus(): Promise<{ status: string }>; request(): Promise<{ status: string }> }

function cap(): Cap | null {
  if (typeof window === 'undefined') return null
  return (window as unknown as { Capacitor?: Cap }).Capacitor || null
}

async function plugin(): Promise<Att | null> {
  const c = cap()
  if (!c?.isNativePlatform?.() || c.getPlatform?.() !== 'ios' || !c.isPluginAvailable?.('AppTracking')) return null
  const { registerPlugin } = await import('@capacitor/core')
  return registerPlugin<Att>('AppTracking')
}

function setNativeCookie(authorized: boolean) {
  try { document.cookie = `ws_native=${authorized ? 'ios_att' : '1'}; path=/; max-age=31536000; SameSite=Lax; Secure` } catch { /* ignore */ }
}

/** Σε κάθε εκκίνηση: συγχρονίζει το cookie με την τρέχουσα απάντηση (ο χρήστης μπορεί να την αλλάξει στις Ρυθμίσεις). */
export async function syncAtt(): Promise<string | null> {
  const p = await plugin().catch(() => null)
  if (!p) return null
  try {
    const { status } = await p.getStatus()
    setNativeCookie(status === 'authorized')
    return status
  } catch { return null }
}

/** Ζητά την άδεια της Apple — ΜΟΝΟ αν ο χρήστης έχει ήδη πατήσει «Αποδοχή» (διαφήμιση) και δεν έχει απαντήσει ποτέ. */
export async function requestAttIfConsented(): Promise<void> {
  if (!getConsent()?.marketing) return
  const p = await plugin().catch(() => null)
  if (!p) return
  try {
    const { status } = await p.getStatus()
    if (status !== 'notDetermined') { setNativeCookie(status === 'authorized'); return }
    const r = await p.request()
    setNativeCookie(r.status === 'authorized')
  } catch { /* ignore */ }
}

/** Client: έχει δώσει «Ναι» στην Apple; (διαβάζει το cookie που γράφει το syncAtt) */
export function iosAttAuthorized(): boolean {
  if (typeof document === 'undefined') return false
  return /(?:^|; )ws_native=ios_att(?:;|$)/.test(document.cookie)
}
