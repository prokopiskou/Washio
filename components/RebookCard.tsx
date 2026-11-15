'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, RotateCw } from 'lucide-react'
import { lightTap } from '@/lib/haptics'
import { funnel } from '@/lib/funnel'

// Κάρτα αρχικής «Κλείσε ξανά»: 7+ μέρες μετά το τελευταίο πλύσιμο, χωρίς επόμενη κράτηση.
// Ένα πάτημα → σελίδα του πλυντηρίου με επιλεγμένη την ίδια υπηρεσία· μέρα και ώρα τις διαλέγει ο πελάτης.
type S = { daysSince: number; location: { name: string }; service: { name: string; price: number }; url: string }
const DKEY = 'washio_rebook_dismissed_v1'

export function RebookCard() {
  const router = useRouter()
  const [s, setS] = useState<S | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/rebook/suggest', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => {
      if (!alive || !j?.show || !j.suggestion) return
      // «×» → κρύβεται για 3 μέρες.
      try { const until = Number(localStorage.getItem(DKEY) || 0); if (until > Date.now()) return } catch { /* ignore */ }
      setS(j.suggestion as S)
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  if (!s) return null
  const close = () => { try { localStorage.setItem(DKEY, String(Date.now() + 3 * 864e5)) } catch { /* ignore */ } setS(null) }
  const eur = s.service.price > 0 ? ` · ${String(s.service.price).replace('.', ',')}€` : ''

  return (
    <div className="relative bg-white rounded-[20px] p-4 border border-washio-border" style={{ boxShadow: '0 2px 10px rgba(16,24,42,0.05)' }}>
      <button onClick={close} aria-label="Κλείσιμο" className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center text-gray-400 active:bg-gray-100"><X size={15} /></button>
      <p className="text-[11px] font-bold tracking-[1.3px] uppercase text-gray-500">Ώρα για πλύσιμο;</p>
      <p className="text-[15px] font-semibold text-washio-navy mt-1 pr-6 truncate">{s.location.name}</p>
      <p className="text-[13px] text-gray-500 mt-0.5 truncate">{s.service.name}{eur}</p>
      <button
        onClick={() => { lightTap(); funnel('book_click', { meta: { src: 'rebook_card', days: s.daysSince } }); router.push(s.url) }}
        className="mt-3 w-full h-12 rounded-xl bg-washio-navy text-white text-[15px] font-semibold flex items-center justify-center gap-2 active:opacity-90">
        <RotateCw size={16} strokeWidth={2.2} />Κλείσε ξανά
      </button>
    </div>
  )
}
