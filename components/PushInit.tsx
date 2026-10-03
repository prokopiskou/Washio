'use client'

import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { createClient } from '@/lib/supabase/client'
import { registerNativePush } from '@/lib/native-push'

type Foreground = { title: string; body: string; url?: string }

export default function PushInit() {
  // Ειδοποίηση που ήρθε ΕΝΩ η εφαρμογή είναι ανοιχτή. Στο Android το FCM ΔΕΝ τη δείχνει
  // στη γραμμή ειδοποιήσεων όταν το app είναι στο προσκήνιο → τη δείχνουμε εμείς (banner + ήχος).
  const [fg, setFg] = useState<Foreground | null>(null)

  useEffect(() => {
    let removeListener: (() => void) | null = null

    const register = async () => {
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      const userId = data.session?.user?.id
      if (!userId) return

      // NATIVE (iOS/Android): FCM μέσω Capacitor.
      if (Capacitor.isNativePlatform()) {
        await registerNativePush(userId)
        try {
          const { FirebaseMessaging } = await import('@capacitor-firebase/messaging')
          const h = await FirebaseMessaging.addListener('notificationReceived', ({ notification }) => {
            const d = (notification.data || {}) as { url?: string }
            setFg({ title: notification.title || 'Washio', body: notification.body || '', url: d.url })
            try {
              // Σύντομος ήχος + δόνηση για να μη χαθεί.
              const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
              const o = ctx.createOscillator(); const g = ctx.createGain()
              o.connect(g); g.connect(ctx.destination); o.frequency.value = 880
              g.gain.setValueAtTime(0.25, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
              o.start(); o.stop(ctx.currentTime + 0.6)
            } catch { /* ignore */ }
            try { navigator.vibrate?.([200, 100, 200]) } catch { /* ignore */ }
          })
          removeListener = () => { h.remove() }
        } catch { /* παλιό build χωρίς plugin */ }
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
    return () => { removeListener?.() }
  }, [])

  // Αυτόματο κλείσιμο μετά από 8''.
  useEffect(() => {
    if (!fg) return
    const tm = setTimeout(() => setFg(null), 8000)
    return () => clearTimeout(tm)
  }, [fg])

  if (!fg) return null
  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-24px)] max-w-md"
      style={{ top: 'calc(env(safe-area-inset-top) + 10px)' }}
    >
      <button
        type="button"
        onClick={() => { const u = fg.url; setFg(null); if (u && u.startsWith('/')) window.location.href = u }}
        className="w-full text-left bg-[#10182A] text-white rounded-2xl px-4 py-3 shadow-2xl flex items-start gap-3"
      >
        <span className="text-[20px] leading-none mt-0.5">🔔</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">{fg.title}</span>
          {fg.body && <span className="block text-[12px] text-white/75 mt-0.5 leading-snug">{fg.body}</span>}
        </span>
        <span onClick={(e) => { e.stopPropagation(); setFg(null) }} className="text-white/50 text-[18px] leading-none px-1">×</span>
      </button>
    </div>
  )
}
