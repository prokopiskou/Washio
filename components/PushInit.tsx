'use client'

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { createClient } from '@/lib/supabase/client'
import { registerNativePush } from '@/lib/native-push'

export default function PushInit() {
  useEffect(() => {
    const register = async () => {
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      const userId = data.session?.user?.id
      if (!userId) return

      // NATIVE (iOS/Android): FCM μέσω Capacitor.
      if (Capacitor.isNativePlatform()) {
        await registerNativePush(userId)
        return
      }

      // WEB: web push (service worker + VAPID).
      // ΠΟΤΕ prompt εδώ (χωρίς user gesture, σε κάθε φόρτωση → οι browsers
      // το μπλοκάρουν μόνιμα μετά από λίγες απορρίψεις). Μόνο σιωπηλή
      // επανεγγραφή αν η άδεια έχει ΗΔΗ δοθεί. Το prompt γίνεται από το κουμπί «Ενεργοποίηση».
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') return
      if (Notification.permission !== 'granted') return
      try {
        const registration = await navigator.serviceWorker.register('/sw.js')

        const existing = await registration.pushManager.getSubscription()
        const subscription = existing || await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        })

        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription, userId }),
        })
      } catch (err) {
        console.error('Push registration error:', err)
      }
    }

    register()
  }, [])

  return null
}
