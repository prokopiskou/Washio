// Μετρήσεις: σύγκριση «πριν / μετά» για κάθε αλλαγή (supabase/metrics.sql).
// Μετά = [αλλαγή, +7 μέρες ή τώρα] · Πριν = ίδιο παράθυρο ακριβώς 7 μέρες νωρίτερα (ίδιες μέρες/ώρες εβδομάδας).
import type { SupabaseClient } from '@supabase/supabase-js'

export type Win = {
  map_open: number; washer_open: number; picker_open: number; car_picked: number; service_select: number; book_click: number
  booking_page: number; pay_click: number; bookings: number; cancelled: number; no_show: number; scanned: number; card: number
  commission: number; ad_spend: number
}

export const EMPTY_WIN: Win = { map_open: 0, washer_open: 0, picker_open: 0, car_picked: 0, service_select: 0, book_click: 0, booking_page: 0, pay_click: 0, bookings: 0, cancelled: 0, no_show: 0, scanned: 0, card: 0, commission: 0, ad_spend: 0 }

export async function windowStats(db: SupabaseClient, from: Date, to: Date): Promise<Win> {
  const { data, error } = await db.rpc('metrics_window', { p_from: from.toISOString(), p_to: to.toISOString() })
  if (error || !data?.[0]) return EMPTY_WIN
  const r = data[0] as Record<string, unknown>
  const out = { ...EMPTY_WIN }
  for (const k of Object.keys(out) as (keyof Win)[]) out[k] = Number(r[k]) || 0
  return out
}

// Ποσοστά (αριθμητής / παρονομαστής) που συγκρίνουμε
export const RATES: { key: string; label: string; num: keyof Win; den: keyof Win; good: 'up' | 'down' }[] = [
  { key: 'open', label: 'Χάρτης → άνοιξε πλυντήριο', num: 'washer_open', den: 'map_open', good: 'up' },
  { key: 'picked', label: 'Άνοιξε «όχημα» → διάλεξε', num: 'car_picked', den: 'picker_open', good: 'up' },
  { key: 'service', label: 'Πλυντήριο → υπηρεσία', num: 'service_select', den: 'washer_open', good: 'up' },
  { key: 'click', label: 'Υπηρεσία → «Κλείσε»', num: 'book_click', den: 'service_select', good: 'up' },
  { key: 'checkout', label: 'Checkout → κράτηση', num: 'bookings', den: 'booking_page', good: 'up' },
  { key: 'overall', label: 'Χάρτης → κράτηση', num: 'bookings', den: 'map_open', good: 'up' },
  { key: 'card', label: 'Κρατήσεις με κάρτα', num: 'card', den: 'bookings', good: 'up' },
  { key: 'cancel', label: 'Ακυρώσεις', num: 'cancelled', den: 'bookings', good: 'down' },
  { key: 'noshow', label: 'Δεν ήρθαν', num: 'no_show', den: 'bookings', good: 'down' },
]

/** z-test δύο αναλογιών · |z| ≥ 1.96 ≈ 95% σιγουριά */
export function zScore(x1: number, n1: number, x2: number, n2: number): number {
  if (!n1 || !n2) return 0
  const p1 = x1 / n1, p2 = x2 / n2, p = (x1 + x2) / (n1 + n2)
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2))
  return se ? (p2 - p1) / se : 0
}

export function compare(before: Win, after: Win) {
  return RATES.map(r => {
    const b = before[r.den] ? before[r.num] / before[r.den] : null
    const a = after[r.den] ? after[r.num] / after[r.den] : null
    const z = zScore(before[r.num], before[r.den], after[r.num], after[r.den])
    const better = r.good === 'up' ? z > 0 : z < 0
    return { key: r.key, label: r.label, before: b, after: a, nBefore: before[r.den], nAfter: after[r.den], z, sig: Math.abs(z) >= 1.96, better }
  })
}

/** Βασικό μέτρο ανά περιοχή αλλαγής → ετυμηγορία */
export function verdict(area: string | null, rows: ReturnType<typeof compare>, days: number): { text: string; tone: 'good' | 'bad' | 'wait' | 'flat' } {
  const main = area === 'checkout' ? 'checkout' : area === 'χάρτης' ? 'overall' : area === 'κουπόνι' ? 'overall' : 'overall'
  const r = rows.find(x => x.key === main)!
  if (r.sig) return r.better ? { text: 'Κρατάμε ✓', tone: 'good' } : { text: 'Γύρνα πίσω ✗', tone: 'bad' }
  if (days < 7 || (r.nAfter || 0) < 30) return { text: 'Θέλει κι άλλες μέρες', tone: 'wait' }
  return { text: 'Καμία σημαντική διαφορά', tone: 'flat' }
}

export async function logChange(db: SupabaseClient, c: { title: string; area?: string; source?: string; by?: string | null; at?: string }) {
  try { await db.from('change_log').insert({ title: c.title.slice(0, 300), area: c.area || null, source: c.source || 'admin', created_by: c.by || null, ...(c.at ? { at: c.at } : {}) }) } catch { /* πίνακας λείπει → τίποτα */ }
}
