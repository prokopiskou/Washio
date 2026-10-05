'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

// Φορτώνει το Google Maps JS στο παρασκήνιο (όταν ο browser είναι αδρανής) σε όλες τις
// σελίδες πελάτη — ώστε όταν ανοίξει ο χάρτης να είναι ΗΔΗ έτοιμος (χωρίς 1-2″ αναμονή).
// Ίδιο script/attribute με τη σελίδα χάρτη → φορτώνεται μία φορά. Δεν κοστίζει map load
// (η χρέωση γίνεται μόνο όταν δημιουργηθεί χάρτης).
export default function MapsPreloader() {
  const pathname = usePathname() || '/'
  useEffect(() => {
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) return
    const w = window as unknown as { google?: { maps?: unknown }; initMap?: () => void; requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
    if (w.google?.maps || document.querySelector('script[data-washio-gmaps]')) return
    const load = () => {
      if (w.google?.maps || document.querySelector('script[data-washio-gmaps]')) return
      if (!w.initMap) w.initMap = () => {}   // η σελίδα χάρτη το αντικαθιστά όταν ανοίξει
      const s = document.createElement('script')
      s.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&callback=initMap&libraries=places&loading=async`
      s.async = true
      s.setAttribute('data-washio-gmaps', '1')
      document.head.appendChild(s)
    }
    if (w.requestIdleCallback) w.requestIdleCallback(load, { timeout: 2500 })
    else setTimeout(load, 1200)
  }, [pathname])
  return null
}
