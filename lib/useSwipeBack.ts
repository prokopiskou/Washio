'use client'

import { useEffect } from 'react'

// Swipe από την αριστερή άκρη προς τα δεξιά → πίσω (όπως στο iPhone).
// Ξεκινά μόνο από τα πρώτα 32px, χρειάζεται ≥70px οριζόντια και κυρίως οριζόντια κίνηση.
export function useSwipeBack(onBack: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    let x0 = -1, y0 = 0, t0 = 0
    const start = (e: TouchEvent) => {
      const t = e.touches[0]
      if (e.touches.length !== 1 || t.clientX > 32) { x0 = -1; return }
      x0 = t.clientX; y0 = t.clientY; t0 = Date.now()
    }
    const end = (e: TouchEvent) => {
      if (x0 < 0) return
      const t = e.changedTouches[0]
      const dx = t.clientX - x0, dy = Math.abs(t.clientY - y0)
      x0 = -1
      if (dx >= 70 && dy < dx * 0.6 && Date.now() - t0 < 800) onBack()
    }
    window.addEventListener('touchstart', start, { passive: true })
    window.addEventListener('touchend', end, { passive: true })
    return () => { window.removeEventListener('touchstart', start); window.removeEventListener('touchend', end) }
  }, [onBack, enabled])
}
