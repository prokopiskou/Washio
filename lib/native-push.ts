'use client'

import { Capacitor } from '@capacitor/core'

// Native push εγγραφή (iOS/Android) μέσω Firebase Cloud Messaging.
// ΣΩΣΤΟ token = FCM token από @capacitor-firebase/messaging (ΟΧΙ το APNs
// token του @capacitor/push-notifications — ο server στέλνει μέσω FCM).
// Στο web κάνει no-op — εκεί δουλεύει το web push (PushInit).

export type RegisterResult = { ok: boolean; reason?: string }

// Διαγνωστικό: γιατί απέτυχε η εγγραφή push (άρνηση χρήστη vs τεχνικό σφάλμα).
// Best-effort, φαίνεται στα logs του Vercel ([push-diag]).
function reportPushDiag(reason: string, stage: string) {
  try {
    fetch('/api/push/diag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, stage, platform: Capacitor.getPlatform() }),
      keepalive: true,
    }).catch(() => {})
  } catch { /* ignore */ }
}

/**
 * @param opts.ask true = εμφάνισε το παράθυρο άδειας του συστήματος αν δεν έχει απαντήσει.
 *   false = εγγραφή ΜΟΝΟ αν έχει ήδη δώσει άδεια (π.χ. σε κάθε άνοιγμα της εφαρμογής).
 *   Στο iPhone το παράθυρο εμφανίζεται ΜΙΑ φορά — το ζητάμε μόνο μετά από «Ναι» σε δική μας οθόνη.
 */
export async function registerNativePush(userId: string, opts: { ask?: boolean } = {}): Promise<RegisterResult> {
  if (!Capacitor.isNativePlatform()) return { ok: false, reason: 'not-native' }
  const ask = opts.ask !== false
  try {
    // Δυναμικό import — το native plugin υπάρχει μόνο στο app bundle (build 5+).
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging')

    let perm = await FirebaseMessaging.checkPermissions()
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      if (!ask) return { ok: false, reason: 'not-asked-yet' }
      perm = await FirebaseMessaging.requestPermissions()
    }
    if (perm.receive !== 'granted') {
      if (ask) reportPushDiag('permission-' + perm.receive, 'permission')
      return { ok: false, reason: 'permission-' + perm.receive }
    }

    const { token } = await FirebaseMessaging.getToken()
    if (!token) { reportPushDiag('no-fcm-token', 'token'); return { ok: false, reason: 'no-fcm-token' } }

    const res = await fetch('/api/push/register-native', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: Capacitor.getPlatform() }),
    })
    if (!res.ok) { reportPushDiag('server-' + res.status, 'register'); return { ok: false, reason: 'server-' + res.status } }

    return { ok: true }
  } catch (e) {
    // π.χ. «not implemented on ios» = τρέχει ΠΑΛΙΟ build χωρίς το plugin.
    const reason = e instanceof Error ? e.message : String(e)
    reportPushDiag(reason.slice(0, 200), 'exception')
    return { ok: false, reason }
  }
}

/** Κατάσταση άδειας native push: 'granted' | 'denied' | 'prompt' | 'unsupported'. */
export async function nativePushPermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  if (!Capacitor.isNativePlatform()) return 'unsupported'
  try {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging')
    const perm = await FirebaseMessaging.checkPermissions()
    if (perm.receive === 'granted') return 'granted'
    if (perm.receive === 'denied') return 'denied'
    return 'prompt'
  } catch {
    return 'unsupported'
  }
}

/** true αν η άδεια native push είναι ήδη granted. */
export async function nativePushGranted(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging')
    const perm = await FirebaseMessaging.checkPermissions()
    return perm.receive === 'granted'
  } catch {
    return false
  }
}
