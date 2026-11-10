'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale } from '@/lib/i18n'

type Loc = { id: string; name: string; slug: string; drops: number; need: number; rewardNext: boolean; amount: number }

const T = {
  el: {
    title: 'Washio Club', sub: (n: number, a: number) => `Κάθε ${n + 1}ο πλύσιμο στο ίδιο πλυντήριο: −${a}€`,
    empty: (n: number, a: number) => `Μάζεψε ${n} σταγόνες σε ένα πλυντήριο και το επόμενο πλύσιμο εκεί έχει −${a}€.`,
    ready: (a: number) => `−${a}€ στο επόμενο πλύσιμο εδώ`, left: (k: number) => k === 1 ? 'Ακόμα 1 για το δώρο' : `Ακόμα ${k} για το δώρο`,
    book: 'Κλείσε',
  },
  en: {
    title: 'Washio Club', sub: (n: number, a: number) => `Every ${n + 1}th wash at the same car wash: −€${a}`,
    empty: (n: number, a: number) => `Collect ${n} drops at one car wash and your next wash there is −€${a}.`,
    ready: (a: number) => `−€${a} on your next wash here`, left: (k: number) => `${k} more for your reward`,
    book: 'Book',
  },
}

function Drop({ on }: { on: boolean }) {
  return (
    <svg width="16" height="20" viewBox="0 0 16 20" aria-hidden>
      <path d="M8 1C8 1 1.5 8.6 1.5 12.6A6.5 6.5 0 0 0 14.5 12.6C14.5 8.6 8 1 8 1Z"
        fill={on ? '#19A8C7' : 'none'} stroke={on ? '#19A8C7' : '#C9D3DC'} strokeWidth="1.5" />
    </svg>
  )
}

export function WashioClubCard() {
  const { locale } = useLocale()
  const t = T[(locale as 'el' | 'en')] || T.el
  const router = useRouter()
  const [data, setData] = useState<{ need: number; amount: number; locations: Loc[] } | null>(null)

  useEffect(() => {
    fetch('/api/loyalty').then(r => r.json()).then(setData).catch(() => {})
  }, [])

  if (!data) return null
  const need = data.need || 4
  const amount = data.amount || 3
  const locs = (data.locations || []).filter(l => l.name)

  return (
    <div className="bg-white rounded-[20px] border border-washio-border overflow-hidden" style={{ boxShadow: '0 4px 18px rgba(16,24,42,0.05)' }}>
      <div className="px-[18px] pt-4 pb-2.5">
        <p className="text-[11px] font-bold tracking-[1.4px] uppercase text-washio-navy/70">💧 {t.title}</p>
        <p className="text-[12px] text-gray-500 mt-1">{locs.length ? t.sub(need, amount) : t.empty(need, amount)}</p>
      </div>
      {locs.length > 0 && (
        <div className="px-2 pb-2">
          {locs.map((l, i) => (
            <div key={l.id} className={`flex items-center gap-3 px-2.5 py-3 ${i < locs.length - 1 ? 'border-b border-washio-border' : ''}`}>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-gray-900 truncate">{l.name}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  {Array.from({ length: need }).map((_, k) => <Drop key={k} on={l.rewardNext || k < l.drops} />)}
                  <span className={`ml-1 text-[12px] ${l.rewardNext ? 'font-semibold text-washio-cyan-dark' : 'text-gray-500'}`}>
                    {l.rewardNext ? t.ready(amount) : t.left(need - l.drops)}
                  </span>
                </div>
              </div>
              {l.slug && (
                <button onClick={() => router.push(`/locations/${l.slug}`)}
                  className={`shrink-0 text-[12px] font-semibold px-3 py-1.5 rounded-full ${l.rewardNext ? 'bg-washio-cyan text-white' : 'border border-washio-border text-washio-navy'}`}>
                  {t.book}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
