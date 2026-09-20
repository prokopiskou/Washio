'use client'

import { Capacitor } from '@capacitor/core'

// Native push εγγραφή (iOS/Android) μέσω Firebase Cloud Messaging.
// ΣΩΣΤΟ token = FCM token από @capacitor-firebase/messaging (ΟΧΙ το APNs
// token του @capacitor/push-notifications — ο server στέλνει μέσω FCM).
// Στο web κάνει no-op — εκεί δουλεύει το web push (PushInit).

export type RegisterResult = { ok: boolean; reason?: string }

export async function registerNativePush(userId: string): Promise<RegisterResult> {
  if (!Capacitor.isNativePlatform()) return { ok: false, reason: 'not-native' }
  try {
    // Δυναμικό import — το native plugin υπάρχει μόνο στο app bundle (build 5+).
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging')

    let perm = await FirebaseMessaging.checkPermissions()
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await FirebaseMessaging.requestPermissions()
    }
    if (perm.receive !== 'granted') {
      return { ok: false, reason: 'permission-' + perm.receive }
    }

    const { token } = await FirebaseMessaging.getToken()
    if (!token) return { ok: false, reason: 'no-fcm-token' }

    const res = await fetch('/api/push/register-native', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: Capacitor.getPlatform() }),
    })
    if (!res.ok) return { ok: false, reason: 'server-' + res.status }

    return { ok: true }
  } catch (e) {
    // π.χ. «not implemented on ios» = τρέχει ΠΑΛΙΟ build χωρίς το plugin.
    return { ok: false, reason: e instanceof Error ? e.message : String(e) }
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
