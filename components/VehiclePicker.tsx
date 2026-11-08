'use client'
// «Τι όχημα έχεις;» — chip + παράθυρο αναζήτησης μοντέλου (αντικαθιστά το ΙΧ / SUV / Μοτοσικλέτα).
import { forwardRef, useImperativeHandle, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { searchCarModels } from '@/lib/car-models'
import { choiceFromModel, type CarChoice } from '@/lib/car-choice'
import { funnel } from '@/lib/funnel'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { Capacitor } from '@capacitor/core'

// Εφαρμογή (iOS/Android): όσο είναι ανοιχτό το παράθυρο, το πληκτρολόγιο ΔΕΝ μικραίνει την οθόνη
// (resize 'none') → το sheet του πλυντηρίου από κάτω μένει ακίνητο. Στο κλείσιμο ξανά 'native'.
async function keyboardResize(mode: 'none' | 'native') {
  if (!Capacitor.isNativePlatform()) return
  try {
    const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard')
    await Keyboard.setResizeMode({ mode: mode === 'none' ? KeyboardResize.None : KeyboardResize.Native })
  } catch { /* plugin λείπει → τίποτα */ }
}

const T = {
  el: {
    ask: 'Τι όχημα έχεις;', change: 'αλλαγή', moto: 'Μοτοσικλέτα', title: 'Τι όχημα έχεις;',
    sub: 'Για να σου δείξουμε τη σωστή τιμή.', ph: 'π.χ. Toyota Yaris, Qashqai, Honda SH',
    useTyped: 'χρήση αυτού', regular: 'Αυτοκίνητο', big: 'SUV / MPV', tapHint: 'Πάτα για να δεις υπηρεσίες & τιμές',
  },
  en: {
    ask: 'What vehicle do you have?', change: 'change', moto: 'Motorcycle', title: 'What vehicle do you have?',
    sub: 'So we can show you the right price.', ph: 'e.g. Toyota Yaris, Qashqai, Honda SH',
    useTyped: 'use this', regular: 'Car', big: 'SUV / MPV', tapHint: 'Tap to see services & prices',
  },
}

export function VehicleChip({ choice, onClick, locale = 'el', big = false }: { choice: CarChoice | null; onClick: () => void; locale?: 'el' | 'en'; big?: boolean }) {
  const t = T[locale]
  // Χωρίς όχημα: ΜΕΓΑΛΟ κουμπί (το μόνο που πρέπει να κάνει πριν δει υπηρεσίες/τιμές).
  if (!choice && big) return (
    <button type="button" onClick={onClick}
      className="w-full h-[76px] px-4 rounded-2xl bg-washio-cyan text-white text-left flex flex-col justify-center shadow-[0_6px_16px_rgba(25,168,199,0.35)] active:opacity-90">
      <span className="text-[16px] font-bold leading-tight">{t.ask}</span>
      <span className="text-[12px] font-medium text-white/85 mt-0.5">{t.tapHint}</span>
    </button>
  )
  if (!choice) return (
    <button type="button" onClick={onClick}
      className="h-9 px-3.5 rounded-full text-[13px] font-semibold whitespace-nowrap bg-washio-cyan text-white border border-washio-cyan shadow-[0_4px_12px_rgba(25,168,199,0.30)] animate-pulse">
      {t.ask}
    </button>
  )
  const label = choice.kind === 'moto' ? (choice.label || t.moto) : (choice.label || (choice.size === 'SUV' ? t.big : t.regular))
  return (
    <button type="button" onClick={onClick}
      className="h-9 max-w-[230px] px-3.5 rounded-full text-[13px] font-semibold whitespace-nowrap bg-white text-washio-navy border border-washio-border flex items-center gap-1.5">
      <span className="truncate">{label}</span>
      <span className="text-[11px] font-medium text-washio-cyan-dark shrink-0">· {t.change}</span>
    </button>
  )
}

export type VehicleSelectorHandle = { open: () => void }

/**
 * Chip + παράθυρο «Τι όχημα έχεις;». Το παράθυρο είναι ΗΔΗ στη σελίδα (κρυφό) → στο πάτημα
 * εμφανίζεται αμέσως (χωρίς re-render του χάρτη) και το πληκτρολόγιο ανοίγει μαζί του.
 * Σταθερή θέση στο πάνω-μεσαίο μέρος (σε px) → δεν μετακινείται όταν ανοίγει το πληκτρολόγιο.
 */
export const VehicleSelector = forwardRef<VehicleSelectorHandle, {
  choice: CarChoice | null; onPick: (c: CarChoice) => void; onClose?: () => void; locale?: 'el' | 'en'; big?: boolean
}>(function VehicleSelector({ choice, onPick, onClose, locale = 'el', big = false }, ref) {
  const t = T[locale]
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useBodyScrollLock(open)
  // Portal στο body: το chip ζει μέσα σε sheet με transform → αλλιώς το «fixed» δεν καλύπτει την οθόνη.
  const isClient = useSyncExternalStore(() => () => {}, () => true, () => false)

  const show = () => {
    // Συγχρονισμένα μέσα στο πάτημα: εμφάνιση + focus (iOS ανοίγει πληκτρολόγιο μόνο έτσι).
    // Σταθερή θέση σε px (υπολογισμένη ΤΩΡΑ, πριν ανοίξει το πληκτρολόγιο) → δεν «πηδάει» όταν
    // το πληκτρολόγιο μικραίνει την οθόνη (με κεντράρισμα ξανα-κεντραριζόταν και ανέβαινε).
    void keyboardResize('none')
    funnel('car_picker_open', { meta: { had: !!choice } })
    if (panelRef.current) panelRef.current.style.marginTop = `${Math.round(window.innerHeight * 0.16)}px`
    if (wrapRef.current) wrapRef.current.style.display = 'flex'
    inputRef.current?.focus({ preventScroll: true })
    setOpen(true)
  }
  const hide = () => {
    if (wrapRef.current) wrapRef.current.style.display = 'none'
    inputRef.current?.blur()
    setOpen(false); setQ('')
    void keyboardResize('native')
  }
  const close = () => { funnel('car_picker_close', { meta: { q: q.trim().slice(0, 40) } }); hide(); onClose?.() }
  useImperativeHandle(ref, () => ({ open: show }))

  const results = open ? searchCarModels(q, 40) : []
  const pick = (c: CarChoice) => { funnel('car_picked', { meta: { model: c.kind === 'car' ? c.label : (c.label || 'moto'), known: c.kind === 'moto' || c.known } }); onPick(c); hide() }
  const typed = q.trim()
  // Μοντέλο που δεν έχουμε στη λίστα → κρατάμε ό,τι έγραψε (τιμή ΙΧ) και το καταγράφουμε για να το προσθέσουμε.
  const useTyped = () => { funnel('car_model_unknown', { meta: { model: typed.slice(0, 60) } }); pick({ kind: 'car', label: typed.slice(0, 60), size: 'ΙΧ', known: false }) }

  return (
    <>
      <VehicleChip choice={choice} onClick={show} locale={locale} big={big} />
      {isClient && createPortal(<div ref={wrapRef} style={{ display: 'none' }} className="fixed inset-0 z-[80] items-start justify-center bg-black/40 px-4" onClick={close}>
        <div ref={panelRef} className="w-full max-w-md bg-white rounded-[24px] p-5" style={{ marginTop: '16vh' }} onClick={e => e.stopPropagation()}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-[18px] font-bold tracking-tight text-washio-navy">{t.title}</p>
              <p className="text-[13px] text-gray-500 mt-0.5">{t.sub}</p>
            </div>
            <button type="button" onClick={close} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"><X size={16} /></button>
          </div>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder={t.ph} enterKeyHint="search" autoComplete="off"
            className="w-full h-[52px] px-4 rounded-[14px] border border-washio-border text-[16px] text-gray-900 placeholder-gray-300 focus:outline-none focus:border-washio-cyan" />
          <div className="mt-2 max-h-[30vh] overflow-y-auto">
            {results.map(c => (
              <button key={c.label} type="button" onClick={() => { const ch = choiceFromModel(c.label); if (ch) pick(ch) }}
                className="w-full text-left px-3 py-3 rounded-xl text-[15px] text-washio-navy active:bg-gray-50 border-b border-gray-100 last:border-0">
                {c.label}
              </button>
            ))}
            {typed.length >= 3 && results.length === 0 && (
              <button type="button" onClick={useTyped}
                className="w-full text-left px-3 py-3 rounded-xl text-[15px] text-washio-navy active:bg-gray-50">
                «{typed}» <span className="text-[12px] text-gray-400">· {t.useTyped}</span>
              </button>
            )}
          </div>
        </div>
      </div>, document.body)}
    </>
  )
})
