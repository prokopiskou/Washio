'use client'
// Chip «🚗 Ποιο αμάξι έχεις;» + sheet επιλογής μοντέλου (αντικαθιστά το ΙΧ / SUV / Μοτοσικλέτα).
import { useState } from 'react'
import { X } from 'lucide-react'
import { searchCarModels } from '@/lib/car-models'
import { choiceFromModel, type CarChoice } from '@/lib/car-choice'
import { funnel } from '@/lib/funnel'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'

const T = {
  el: {
    ask: 'Ποιο όχημα έχεις;', change: 'αλλαγή', moto: 'Μοτοσικλέτα', title: 'Ποιο όχημα έχεις;',
    sub: 'Για να σου δείξουμε τη σωστή τιμή.', ph: 'π.χ. Toyota Yaris, Qashqai, Honda SH',
    useTyped: 'χρήση αυτού', regular: 'Αυτοκίνητο', big: 'SUV / MPV',
  },
  en: {
    ask: 'Which vehicle do you have?', change: 'change', moto: 'Motorcycle', title: 'Which vehicle do you have?',
    sub: 'So we can show you the right price.', ph: 'e.g. Toyota Yaris, Qashqai, Honda SH',
    useTyped: 'use this', regular: 'Car', big: 'SUV / MPV',
  },
}

export function VehicleChip({ choice, onClick, locale = 'el' }: { choice: CarChoice | null; onClick: () => void; locale?: 'el' | 'en' }) {
  const t = T[locale]
  if (!choice) return (
    <button type="button" onClick={onClick}
      className="h-9 px-3.5 rounded-full text-[13px] font-semibold whitespace-nowrap bg-washio-cyan text-white border border-washio-cyan shadow-[0_4px_12px_rgba(25,168,199,0.30)] animate-pulse">
      🚗 {t.ask}
    </button>
  )
  const label = choice.kind === 'moto' ? `🏍️ ${choice.label || t.moto}` : `🚗 ${choice.label || (choice.size === 'SUV' ? t.big : t.regular)}`
  return (
    <button type="button" onClick={onClick}
      className="h-9 max-w-[230px] px-3.5 rounded-full text-[13px] font-semibold whitespace-nowrap bg-white text-washio-navy border border-washio-border flex items-center gap-1.5">
      <span className="truncate">{label}</span>
      <span className="text-[11px] font-medium text-washio-cyan-dark shrink-0">· {t.change}</span>
    </button>
  )
}

export function VehiclePickerSheet({ open, onClose, onPick, locale = 'el' }: {
  open: boolean; onClose: () => void; onPick: (c: CarChoice) => void; locale?: 'el' | 'en'
}) {
  const t = T[locale]
  const [q, setQ] = useState('')
  useBodyScrollLock(open)
  if (!open) return null
  const results = searchCarModels(q, 40)
  const pick = (c: CarChoice) => { onPick(c); setQ(''); onClose() }
  const typed = q.trim()
  // Μοντέλο που δεν έχουμε στη λίστα → κρατάμε ό,τι έγραψε (τιμή ΙΧ) και το καταγράφουμε για να το προσθέσουμε.
  const useTyped = () => { funnel('car_model_unknown', { meta: { model: typed.slice(0, 60) } }); pick({ kind: 'car', label: typed.slice(0, 60), size: 'ΙΧ', known: false }) }
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-t-[24px] p-5 pb-[calc(var(--safe-bottom,0px)+20px)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[18px] font-bold tracking-tight text-washio-navy">{t.title}</p>
            <p className="text-[13px] text-gray-500 mt-0.5">{t.sub}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"><X size={16} /></button>
        </div>

        <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={t.ph}
          className="w-full h-[52px] px-4 rounded-[14px] border border-washio-border text-[16px] text-gray-900 placeholder-gray-300 focus:outline-none focus:border-washio-cyan" />
        <div className="mt-2 min-h-[44px] max-h-[44vh] overflow-y-auto">
          {results.map(c => (
            <button key={c.label} type="button" onClick={() => { const ch = choiceFromModel(c.label); if (ch) pick(ch) }}
              className="w-full text-left px-3 py-3 rounded-xl text-[15px] text-washio-navy active:bg-gray-50 border-b border-gray-100 last:border-0">
              {c.size === 'Μοτοσικλέτα' ? '🏍️' : '🚗'} {c.label}
            </button>
          ))}
          {typed.length >= 3 && results.length === 0 && (
            <button type="button" onClick={useTyped}
              className="w-full text-left px-3 py-3 rounded-xl text-[15px] text-washio-navy active:bg-gray-50">
              «{typed}» <span className="text-[12px] text-gray-400">· {t.useTyped}</span>
            </button>
          )}
        </div>
        <button type="button" onClick={() => pick({ kind: 'moto' })}
          className="mt-3 w-full h-11 rounded-[14px] border border-washio-border text-[14px] font-semibold text-washio-navy">🏍️ {t.moto}</button>
      </div>
    </div>
  )
}
