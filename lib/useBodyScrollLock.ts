'use client'

import { useEffect } from 'react'

/**
 * Κλειδώνει το scroll του body όσο ένα bottom-sheet/modal είναι ανοιχτό.
 *
 * ΓΙΑΤΙ: στο iOS WebView, όταν ανοίγει το πληκτρολόγιο μέσα σε fixed sheet,
 * το iOS σκρολάρει το body από κάτω για να «φέρει» το input πάνω από το
 * keyboard. Το fixed sheet ΦΑΙΝΕΤΑΙ στη θέση του, αλλά τα touch targets
 * μετατοπίζονται κατά το scroll → τα πεδία δείχνουν ορατά και ΔΕΝ πατιούνται
 * (πραγματικό πάγωμα). Με κλειδωμένο body δεν υπάρχει τίποτα να σκρολάρει,
 * οπότε visual και hit-testing μένουν ευθυγραμμισμένα.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    const scrollY = window.scrollY
    const prev = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    }
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.position = prev.position
      document.body.style.top = prev.top
      document.body.style.width = prev.width
      document.body.style.overflow = prev.overflow
      window.scrollTo(0, scrollY)
    }
  }, [active])
}
