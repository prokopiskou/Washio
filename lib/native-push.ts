'use client'

import { Capacitor } from '@capacitor/core'

// Native push εγγραφή (iOS/Android) μέσω FCM.
// Στο web κάνει no-op — εκεί δουλεύει το web push (PushInit).

export async function registerNativePush(userId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  try {
    // Δυναμικό import — τα plugins υπάρχουν μόνο στο native bundle.
    const { PushNotifications } = await import('@capacitor/push-notifications')

    const perm = await PushNotifications.checkPermissions()
    let status = perm.receive
    if (status === 'prompt' || status === 'prompt-with-rationale') {
      status = (await PushNotifications.requestPermissions()).receive
    }
    if (status !== 'granted') return

    // Παίρνει το APNs/FCM token μέσω του listener και το στέλνει στον server.
    await PushNotifications.addListener('registration', async (token) => {
      try {
        await fetch('/api/push/register-native', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: token.value, platform: Capacitor.getPlatform() }),
        })
      } catch { /* best-effort */ }
    })

    await PushNotifications.addListener('registrationError', (err) => {
      console.error('Native push registration error:', err)
    })

    await PushNotifications.register()
  } catch (e) {
    console.error('registerNativePush failed:', e)
  }
}

/** true αν η άδεια native push είναι ήδη granted. */
export async function nativePushGranted(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications')
    const perm = await PushNotifications.checkPermissions()
    return perm.receive === 'granted'
  } catch {
    return false
  }
}
