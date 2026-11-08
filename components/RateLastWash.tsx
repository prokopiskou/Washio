'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { athensToday } from '@/lib/time'

// Κάρτα αρχικής: «Βαθμολόγησε το χθεσινό πλύσιμο» — μένει μέχρι να βαθμολογήσει (ή να πατήσει ×).
type Pending = { ref: string; t: string; place: string; date: string }
const DKEY = 'washio_rate_dismissed_v1'

function dismissed(): string[] {
  try { return JSON.parse(localStorage.getItem(DKEY) || '[]') as string[] } catch { return [] }
}

function dayWord(ymd: string): string {
  const today = athensToday()
  if (ymd === today) return 'σημερινό'
  const [y, m, d] = today.split('-').map(Number)
  const yest = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
  return ymd === yest ? 'χθεσινό' : 'τελευταίο'
}

export function RateLastWash() {
  const router = useRouter()
  const [p, setP] = useState<Pending | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/review/pending', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => {
      const x = j?.pending as Pending | null
      if (alive && x && !dismissed().includes(x.ref)) setP(x)
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  if (!p) return null
  const go = (n: number) => router.push(`/review?ref=${encodeURIComponent(p.ref)}&t=${p.t}&rating=${n}`)
  const close = () => {
    try { localStorage.setItem(DKEY, JSON.stringify([...dismissed(), p.ref].slice(-20))) } catch { /* ignore */ }
    setP(null)
  }

  return (
    <div className="relative bg-white rounded-[20px] p-4 border border-washio-border" style={{ boxShadow: '0 2px 10px rgba(16,24,42,0.05)' }}>
      <button onClick={close} aria-label="Κλείσιμο" className="absolute top-2.5 right-2.5 w-8 h-8 flex items-center justify-center text-gray-300">
        <X size={16} />
      </button>
      <p className="text-[11px] font-bold tracking-[1.3px] uppercase text-gray-500">Βαθμολόγησε το {dayWord(p.date)} πλύσιμο</p>
      <p className="text-[15px] font-semibold text-washio-navy mt-1 pr-8 truncate">Πώς ήταν το {p.place};</p>
      <div className="flex items-center gap-1.5 mt-2.5">
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => go(n)} aria-label={`${n} αστέρια`}
            className="leading-none text-[34px] text-gray-200 active:scale-90 transition-transform hover:text-amber-400">★</button>
        ))}
      </div>
    </div>
  )
}
