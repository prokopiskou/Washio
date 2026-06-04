'use client'

import { useEffect } from 'react'
import { successHaptic } from '@/lib/haptics'

export function CapacitorInit() {
  useEffect(() => {
    successHaptic()

    const init = async () => {
      try {
        // Dynamic import — μόνο όταν τρέχει σε Capacitor
        const cap = (window as any).Capacitor
        if (!cap || !cap.isNativePlatform()) return

        const { SplashScreen } = await import('@capacitor/splash-screen')
        const { StatusBar, Style } = await import('@capacitor/status-bar')

        // Status bar styling
        await StatusBar.setStyle({ style: Style.Light })
        await StatusBar.setBackgroundColor({ color: '#0A0A0A' })

        // Hide splash after content is ready
        setTimeout(async () => {
          await SplashScreen.hide({ fadeOutDuration: 500 })
        }, 1200)
      } catch (e) {
        console.log('Capacitor init skipped:', e)
      }
    }

    init()
  }, [])

  return null
}
