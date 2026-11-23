'use client'

import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { createClient } from '@/lib/supabase/client'
import { ensureDeviceId } from '@/lib/device'

// Μέσα στην εφαρμογή: καταγραφή ανοίγματος (μία φορά ανά εκκίνηση) + όταν συνδεθεί ο χρήστης.
export function AppOpenTracker() {
  useEffect(() => {
    let native = false
    try { native = Capacitor.isNativePlatform() } catch { /* web */ }
    if (!native) return
    const platform = Capacitor.getPlatform()
    const send = () => {
      const device = ensureDeviceId()
      if (!device) return
      fetch('/api/app-open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device, platform }), keepalive: true }).catch(() => {})
    }
    try { if (!sessionStorage.getItem('ws_app_open')) { sessionStorage.setItem('ws_app_open', '1'); send() } } catch { send() }
    const { data: sub } = createClient().auth.onAuthStateChange((evt) => { if (evt === 'SIGNED_IN') send() })
    return () => sub.subscription.unsubscribe()
  }, [])
  return null
}
