'use client'

import { useEffect } from 'react'

export function CapacitorInit() {
  useEffect(() => {
    // (Καμία δόνηση στο άνοιγμα — το success haptic ανήκει στην επιβεβαίωση
    // κράτησης, όχι σε κάθε launch του app.)
    const init = async () => {
      try {
        // Dynamic import — μόνο όταν τρέχει σε Capacitor
        const cap = (window as any).Capacitor
        if (!cap || !cap.isNativePlatform()) return

        // Σημάδεψε το native app ώστε το CSS (--safe-top) να κρατά το 47px
        // fallback ΜΟΝΟ εδώ — στο web μένει το καθαρό env(safe-area-inset-top).
        document.documentElement.classList.add('native-app')

        const { SplashScreen } = await import('@capacitor/splash-screen')
        const { StatusBar, Style } = await import('@capacitor/status-bar')

        // Full-screen edge-to-edge: το webview περνάει ΚΑΤΩ από το status bar /
        // Dynamic Island, ώστε να μη μένει μαύρη λωρίδα στην κορυφή. Το περιεχόμενο
        // κρατά απόσταση από το νησί μέσω του pt-14 στα headers + viewport-fit=cover.
        await StatusBar.setOverlaysWebView({ overlay: true })
        // Style.Light = σκούρο κείμενο (ώρα/μπαταρία) για τα ανοιχτόχρωμα φόντα.
        await StatusBar.setStyle({ style: Style.Light })

        // Το περιεχόμενο είναι ήδη ζωγραφισμένο (το effect τρέχει μετά το hydration)
        // → κρύψε το splash ΑΜΕΣΑ. Πριν: σταθερό 1200ms + 500ms fade σε κάθε άνοιγμα.
        SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {})

        // Handle OAuth deep-link callback from the in-app browser.
        const { App } = await import('@capacitor/app')
        App.addListener('appUrlOpen', async ({ url }) => {
          try {
            const { handleAuthDeepLink } = await import('@/lib/native-auth')
            await handleAuthDeepLink(url)
          } catch (e) {
            console.log('deep link handling failed:', e)
          }
        })
      } catch (e) {
        console.log('Capacitor init skipped:', e)
      }
    }

    init()
  }, [])

  return null
}
