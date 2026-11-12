// Προωθήσεις πλυντηρίων: έκπτωση (ή σταθερή τιμή «fixed») σε μία υπηρεσία, για συγκεκριμένες ημέρες ραντεβού (από–έως).
// Η τελική τιμή υπολογίζεται ΠΑΝΤΑ server-side (create-cash / create-intent) — ο client μόνο τη δείχνει.
// Πίνακας: public.promotions (supabase/promotions.sql). Αν λείπει ο πίνακας → καμία προώθηση (ασφαλές).
import type { SupabaseClient } from '@supabase/supabase-js'

export type Promotion = {
  id: string
  location_id: string
  service_id: string | null
  addon_id?: string | null   // προσφορά σε ΠΡΟΣΘΕΤΟ (π.χ. υαλοκαθαριστήρες −15%) αντί για υπηρεσία
  discount_type: 'percent' | 'amount' | 'fixed'   // fixed = τελική τιμή (π.χ. βιολογικός «μόνο 120€»)
  discount_value: number
  starts_on: string   // YYYY-MM-DD (ημέρα ραντεβού)
  ends_on: string     // YYYY-MM-DD (συμπεριλαμβάνεται)
  is_active: boolean
  by_booking_date?: boolean  // true → ισχύει για ΚΡΑΤΗΣΕΙΣ που γίνονται από–έως (το ραντεβού μπορεί να είναι οποτεδήποτε)
}

export const round2 = (n: number) => Math.round(n * 100) / 100

/** Τελική τιμή μετά την έκπτωση (ποτέ κάτω από 0). */
export function applyPromo(price: number, p: Pick<Promotion, 'discount_type' | 'discount_value'>): number {
  const v = Number(p.discount_value) || 0
  if (p.discount_type === 'fixed') return Math.max(0, round2(v))
  const out = p.discount_type === 'percent' ? price * (1 - Math.min(Math.max(v, 0), 90) / 100) : price - Math.max(v, 0)
  return Math.max(0, round2(out))
}

/** Ισχύει για ραντεβού της ημέρας `ymd`; */
export const promoCovers = (p: Pick<Promotion, 'starts_on' | 'ends_on' | 'is_active'>, ymd: string) =>
  p.is_active && p.starts_on <= ymd && ymd <= p.ends_on

const athensToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(new Date())

/** Ισχύει η προώθηση; κατά ημέρα ΚΡΑΤΗΣΗΣ (σήμερα) αν by_booking_date, αλλιώς κατά ημέρα ραντεβού. */
export function promoAppliesTo(p: { starts_on: string; ends_on: string; by_booking_date?: boolean | null }, slotYmd: string, todayYmd: string): boolean {
  const d = p.by_booking_date ? todayYmd : slotYmd
  return p.starts_on <= d && d <= p.ends_on
}

/** Ενεργή προώθηση για υπηρεσία + ημέρα ραντεβού (server). Μεγαλύτερη έκπτωση αν υπάρχουν πολλές. */
export async function activePromotionFor(admin: SupabaseClient, serviceId: string, slotDate: string, basePrice: number): Promise<Promotion | null> {
  try {
    const today = athensToday()
    // select * → περιλαμβάνει και το by_booking_date όταν υπάρχει η στήλη (supabase/promotions_fixed.sql)
    const res = await admin.from('promotions').select('*').eq('service_id', serviceId).eq('is_active', true).gte('ends_on', today < slotDate ? today : slotDate)
    const list = ((res.data || []) as unknown as Promotion[]).filter(p => promoAppliesTo(p, slotDate, today))
    if (!list.length) return null
    return list.sort((a, b) => applyPromo(basePrice, a) - applyPromo(basePrice, b))[0]
  } catch { return null }
}

/** Ενεργές προσφορές σε ΠΡΟΣΘΕΤΑ ενός πλυντηρίου (server): addon_id → προσφορά (η μεγαλύτερη έκπτωση). */
export async function activeAddonPromotions(admin: SupabaseClient, locationId: string, slotDate: string): Promise<Map<string, Promotion>> {
  const out = new Map<string, Promotion>()
  try {
    const today = athensToday()
    const res = await admin.from('promotions').select('*').eq('location_id', locationId).not('addon_id', 'is', null)
      .eq('is_active', true).gte('ends_on', today < slotDate ? today : slotDate)
    for (const p of (res.data || []) as unknown as Promotion[]) {
      if (!p.addon_id || !promoAppliesTo(p, slotDate, today)) continue
      const cur = out.get(p.addon_id)
      if (!cur || applyPromo(100, p) < applyPromo(100, cur)) out.set(p.addon_id, p)
    }
  } catch { /* χωρίς στήλη addon_id → καμία */ }
  return out
}

/** Σταθερή τιμή σε υπηρεσία εύρους (βιολογικός): το εύρος «σβήνει», χρεώνεται/δείχνεται μόνο αυτή. */
export const isFixedPromo = (p: { discount_type?: string } | null | undefined) => p?.discount_type === 'fixed'
