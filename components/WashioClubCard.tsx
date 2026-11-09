'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from '@/lib/i18n'

// Washio Club — ΚΟΙΝΗ πρόοδος σε όλα τα πλυντήρια (μόνο μέσω Washio · κανένα πλυντήριο δεν την αντιγράφει).
type Club = { drops: number; need: number; rewardNext: boolean; amount: number }

const T = {
  el: {
    title: 'Washio Club',
    sub: (n: number, a: number) => `Κάθε ${n + 1}ο πλύσιμο μέσω Washio: −${a}€ — σε όποιο πλυντήριο θες`,
    ready: (a: number) => `−${a}€ στο επόμενο πλύσιμό σου`,
    left: (k: number, a: number) => k === 1 ? `Ακόμα 1 πλύσιμο για −${a}€` : `Ακόμα ${k} πλυσίματα για −${a}€`,
    note: 'Οι σταγόνες μετράνε μόνο όταν κλείνεις από την εφαρμογή.',
    book: 'Κλείσε',
  },
  en: {
    title: 'Washio Club',
    sub: (n: number, a: number) => `Every ${n + 1}th wash via Washio: −€${a} — at any car wash`,
    ready: (a: number) => `−€${a} on your next wash`,
    left: (k: number, a: number) => k === 1 ? `1 more wash for −€${a}` : `${k} more washes for −€${a}`,
    note: 'Drops only count when you book through the app.',
    book: 'Book',
  },
}

function Drop({ on }: { on: boolean }) {
  return (
    <svg width="18" height="22" viewBox="0 0 16 20" aria-hidden>
      <path d="M8 1C8 1 1.5 8.6 1.5 12.6A6.5 6.5 0 0 0 14.5 12.6C14.5 8.6 8 1 8 1Z"
        fill={on ? '#19A8C7' : 'none'} stroke={on ? '#19A8C7' : '#C9D3DC'} strokeWidth="1.5" />
    </svg>
  )
}

export function WashioClubCard() {
  const { locale } = useLocale()
  const t = T[(locale as 'el' | 'en')] || T.el
  const router = useRouter()
  const [data, setData] = useState<Club | null>(null)

  useEffect(() => {
    fetch('/api/loyalty').then(r => r.json()).then(j => { if (typeof j?.drops === 'number') setData(j) }).catch(() => {})
  }, [])

  if (!data) return null
  const need = data.need || 4
  const amount = data.amount || 3

  return (
    <div className="bg-white rounded-[20px] border border-washio-border overflow-hidden" style={{ boxShadow: '0 4px 18px rgba(16,24,42,0.05)' }}>
      <div className="px-[18px] pt-4 pb-4">
        <p className="text-[11px] font-bold tracking-[1.4px] uppercase text-washio-navy/70">💧 {t.title}</p>
        <p className="text-[12px] text-gray-500 mt-1">{t.sub(need, amount)}</p>
        <div className="flex items-center gap-3 mt-3">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: need }).map((_, k) => <Drop key={k} on={data.rewardNext || k < data.drops} />)}
          </div>
          <span className={`flex-1 text-[13px] ${data.rewardNext ? 'font-semibold text-washio-cyan-dark' : 'text-gray-600'}`}>
            {data.rewardNext ? t.ready(amount) : t.left(need - data.drops, amount)}
          </span>
          <button onClick={() => router.push('/map')}
            className={`shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-full ${data.rewardNext ? 'bg-washio-cyan text-white' : 'border border-washio-border text-washio-navy'}`}>
            {t.book}
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mt-2.5">{t.note}</p>
      </div>
    </div>
  )
}
