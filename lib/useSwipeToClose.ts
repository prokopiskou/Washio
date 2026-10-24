'use client'

import { useRef, useCallback } from 'react'

// Swipe προς τα κάτω σε bottom sheet → κλείσιμο (όπως στα native apps).
// • Κλειδώνει άξονα μετά από 8px: οριζόντιο swipe (υπηρεσίες/ώρες) δεν επηρεάζεται.
// • Κλείνει αν τραβηχτεί > 90px ή γρήγορο τίναγμα (> 0.5 px/ms). Αλλιώς επιστρέφει.
// • Ο ίδιος ο sheet ακολουθεί το δάχτυλο (transform) — χωρίς re-render ανά κίνηση.
export function useSwipeToClose<T extends HTMLElement>(onClose: () => void) {
  const ref = useRef<T | null>(null)
  const st = useRef<{ x: number; y: number; t: number; axis: '' | 'x' | 'y'; dy: number } | null>(null)

  const setY = (y: number, animate: boolean) => {
    const el = ref.current
    if (!el) return
    el.style.transition = animate ? 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none'
    el.style.transform = y ? `translateY(${y}px)` : ''
  }

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const tch = e.touches[0]
    // Μέσα σε στοιχείο που κάνει δικό του κάθετο scroll και δεν είναι στην κορυφή → όχι swipe.
    let n = e.target as HTMLElement | null
    while (n && n !== ref.current) {
      if (n.scrollHeight > n.clientHeight + 2 && n.scrollTop > 0 && getComputedStyle(n).overflowY !== 'visible') { st.current = null; return }
      n = n.parentElement
    }
    st.current = { x: tch.clientX, y: tch.clientY, t: Date.now(), axis: '', dy: 0 }
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const s = st.current
    if (!s) return
    const tch = e.touches[0]
    const dx = tch.clientX - s.x
    const dy = tch.clientY - s.y
    if (!s.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      s.axis = Math.abs(dy) > Math.abs(dx) && dy > 0 ? 'y' : 'x'
    }
    if (s.axis !== 'y') return
    s.dy = Math.max(0, dy)
    setY(s.dy, false)
  }, [])

  const onTouchEnd = useCallback(() => {
    const s = st.current
    st.current = null
    if (!s || s.axis !== 'y') return
    const v = s.dy / Math.max(1, Date.now() - s.t)
    if (s.dy > 90 || (v > 0.5 && s.dy > 30)) {
      const h = ref.current?.offsetHeight || 400
      setY(h + 40, true)
      setTimeout(() => { onClose(); setY(0, false) }, 200)
    } else {
      setY(0, true)
    }
  }, [onClose])

  return { ref, handlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd } }
}

// Swipe προς τα πάνω (π.χ. στη λαβή του μαζεμένου sheet) → άνοιγμα. Οριζόντιο scroll ανέγγιχτο.
export function useSwipeToOpen(onOpen: () => void) {
  const st = useRef<{ x: number; y: number; axis: '' | 'x' | 'y'; dy: number } | null>(null)
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const tch = e.touches[0]
    st.current = { x: tch.clientX, y: tch.clientY, axis: '', dy: 0 }
  }, [])
  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const s = st.current
    if (!s) return
    const tch = e.touches[0]
    const dx = tch.clientX - s.x
    const dy = s.y - tch.clientY // θετικό = προς τα πάνω
    if (!s.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      s.axis = Math.abs(dy) > Math.abs(dx) && dy > 0 ? 'y' : 'x'
    }
    if (s.axis === 'y') s.dy = dy
  }, [])
  const onTouchEnd = useCallback(() => {
    const s = st.current
    st.current = null
    if (s && s.axis === 'y' && s.dy > 40) onOpen()
  }, [onOpen])
  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd }
}
