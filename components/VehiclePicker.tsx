'use client'
// Chip «🚗 Ποιο αμάξι έχεις;» + sheet επιλογής μοντέλου (αντικαθιστά το ΙΧ / SUV / Μοτοσικλέτα).
import { useState } from 'react'
import { X } from 'lucide-react'
import { searchCarModels } from '@/lib/car-models'
import { choiceFromModel, type CarChoice } from '@/lib/car-choice'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'

const T = {
  el: {
    ask: 'Ποιο αμάξι έχεις;', change: 'αλλαγή', moto: 'Μοτοσικλέτα', title: 'Ποιο αμάξι έχεις;',
    sub: 'Για να σου δείξουμε τη σωστή τιμή.', ph: 'π.χ. Toyota Yaris, Nissan Qashqai',
    notFound: 'Δεν βρίσκω το μοντέλο μου', regular: 'Κανονικό αυτοκίνητο', regularSub: 'hatchback, sedan, station wagon',
    big: 'SUV / MPV / 7θέσιο', bigSub: 'crossover, πολυμορφικό, βαν', myCar: 'Το αμάξι μου',
  },
  en: {
    ask: 'Which car do you have?', change: 'change', moto: 'Motorcycle', title: 'Which car do you have?',
    sub: 'So we can show you the right price.', ph: 'e.g. Toyota Yaris, Nissan Qashqai',
    notFound: "I can't find my model", regular: 'Regular car', regularSub: 'hatchback, sedan, estate',
    big: 'SUV / MPV / 7-seater', bigSub: 'crossover, people carrier, van', myCar: 'My car',
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
  const label = choice.kind === 'moto' ? `🏍️ ${t.moto}` : `🚗 ${choice.known ? choice.label : choice.size === 'SUV' ? t.big : t.regular}`
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
  const [manual, setManual] = useState(false)
  useBodyScrollLock(open)
  if (!open) return null
  const results = searchCarModels(q, 7)
  const pick = (c: CarChoice) => { onPick(c); setQ(''); setManual(false); onClose() }
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

        {!manual ? (
          <>
            <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={t.ph}
              className="w-full h-[52px] px-4 rounded-[14px] border border-washio-border text-[16px] text-gray-900 placeholder-gray-300 focus:outline-none focus:border-washio-cyan" />
            <div className="mt-2 min-h-[44px] max-h-[44vh] overflow-y-auto">
              {results.map(c => (
                <button key={c.label} type="button" onClick={() => { const ch = choiceFromModel(c.label); if (ch) pick(ch) }}
                  className="w-full text-left px-3 py-3 rounded-xl text-[15px] text-washio-navy active:bg-gray-50 border-b border-gray-100 last:border-0">
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => pick({ kind: 'moto' })}
                className="flex-1 h-11 rounded-[14px] border border-washio-border text-[14px] font-semibold text-washio-navy">🏍️ {t.moto}</button>
              <button type="button" onClick={() => setManual(true)}
                className="flex-1 h-11 rounded-[14px] border border-washio-border text-[13px] font-medium text-gray-500">{t.notFound}</button>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            {([['ΙΧ', t.regular, t.regularSub], ['SUV', t.big, t.bigSub]] as const).map(([size, title, sub]) => (
              <button key={size} type="button" onClick={() => pick({ kind: 'car', label: title, size, known: false })}
                className="w-full text-left px-4 py-3.5 rounded-[14px] border border-washio-border active:bg-gray-50">
                <p className="text-[15px] font-semibold text-washio-navy">{title}</p>
                <p className="text-[12px] text-gray-500">{sub}</p>
              </button>
            ))}
            <button type="button" onClick={() => setManual(false)} className="mt-1 text-[13px] text-gray-500 underline self-start">←</button>
          </div>
        )}
      </div>
    </div>
  )
}
