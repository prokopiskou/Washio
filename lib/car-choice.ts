'use client'
// «Ποιο αμάξι έχεις;» — η επιλογή οχήματος του πελάτη (χάρτης / σελίδα πλυντηρίου / checkout).
// Αποθηκεύεται τοπικά (localStorage) και, για συνδεδεμένους, γεμίζει από το αποθηκευμένο όχημα.
// Τιμές ΔΕΝ φαίνονται πριν διαλέξει → δεν «ανεβαίνει» ποτέ η τιμή που είδε.
import { useEffect, useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sizeOfModel, type SizeClass } from '@/lib/car-models'

export type CarChoice =
  | { kind: 'car'; label: string; size: SizeClass; known: boolean } // known=false → δήλωσε μόνος του κατηγορία
  | { kind: 'moto'; label?: string }

const KEY = 'washio_car_choice_v1'
const EVT = 'washio-car-choice'
let cache: { raw: string | null; val: CarChoice | null } = { raw: null, val: null }

function read(): CarChoice | null {
  if (typeof window === 'undefined') return null
  let raw: string | null = null
  try { raw = localStorage.getItem(KEY) } catch { return null }
  if (raw === cache.raw) return cache.val
  let val: CarChoice | null = null
  try { val = raw ? JSON.parse(raw) as CarChoice : null } catch { val = null }
  cache = { raw, val }
  return val
}

export function setCarChoice(c: CarChoice | null) {
  try { if (c) localStorage.setItem(KEY, JSON.stringify(c)); else localStorage.removeItem(KEY) } catch { /* private mode */ }
  window.dispatchEvent(new Event(EVT))
}

/** Μοντέλο από λίστα → επιλογή με σωστή κατηγορία. */
export function choiceFromModel(label: string): CarChoice | null {
  const size = sizeOfModel(label)
  if (!size) return null
  return size === 'Μοτοσικλέτα' ? { kind: 'moto', label } : { kind: 'car', label, size, known: true }
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVT, cb); window.addEventListener('storage', cb)
  return () => { window.removeEventListener(EVT, cb); window.removeEventListener('storage', cb) }
}

let triedSaved = false
export function useCarChoice(): [CarChoice | null, (c: CarChoice | null) => void] {
  const choice = useSyncExternalStore(subscribe, read, () => null)
  // Συνδεδεμένος χωρίς τοπική επιλογή → πάρε το αποθηκευμένο του όχημα (μία φορά).
  useEffect(() => {
    if (choice || triedSaved) return
    triedSaved = true
    ;(async () => {
      const sb = createClient()
      const { data: { session } } = await sb.auth.getSession()
      if (!session?.user) return
      const { data, error } = await sb.from('vehicles').select('type, car_model, is_primary').eq('user_id', session.user.id)
        .order('is_primary', { ascending: false }).order('created_at', { ascending: false }).limit(1)
      if (error || !data?.length || read()) return
      const v = data[0] as { type?: string; car_model?: string | null }
      if (v.type === 'Μοτοσικλέτα') return setCarChoice(v.car_model ? { kind: 'moto', label: v.car_model } : { kind: 'moto' })
      const fromModel = v.car_model ? choiceFromModel(v.car_model) : null
      if (fromModel) setCarChoice(fromModel)
    })().catch(() => {})
  }, [choice])
  return [choice, setCarChoice]
}

/** Τύπος οχήματος για τις τιμές/κράτηση (ΙΧ / SUV / Μοτοσικλέτα). */
export const vehicleTypeOf = (c: CarChoice | null): 'ΙΧ' | 'SUV' | 'Μοτοσικλέτα' =>
  !c ? 'ΙΧ' : c.kind === 'moto' ? 'Μοτοσικλέτα' : c.size

type SvcLite = { id: string; name: string; price?: number | null; price_moto?: number | null; price_suv?: number | null; is_range?: boolean | null; price_min?: number | null; price_max?: number | null; price_min_suv?: number | null; price_max_suv?: number | null; is_active?: boolean | null }
/** Αν για τον τύπο οχήματος υπάρχει ΜΟΝΟ μία υπηρεσία (π.χ. μηχανή) → αυτή (επιλέγεται αυτόματα). */
export function soleServiceId(services: SvcLite[], vt: 'ΙΧ' | 'SUV' | 'Μοτοσικλέτα', isMoto: (name: string) => boolean): string | null {
  const ok = services.filter(s => {
    if (s.is_active === false) return false
    if (vt === 'Μοτοσικλέτα') return !s.is_range && isMoto(s.name) && Number(s.price_moto || s.price) > 0
    if (isMoto(s.name)) return false
    if (s.is_range) return Number(vt === 'SUV' ? s.price_min_suv : s.price_min) > 0 && Number(vt === 'SUV' ? s.price_max_suv : s.price_max) > 0
    return Number(vt === 'SUV' && s.price_suv ? s.price_suv : s.price) > 0
  })
  return ok.length === 1 ? ok[0].id : null
}
