// Προωθήσεις πλυντηρίων: έκπτωση σε μία υπηρεσία, για συγκεκριμένες ημέρες ραντεβού (από–έως).
// Η τελική τιμή υπολογίζεται ΠΑΝΤΑ server-side (create-cash / create-intent) — ο client μόνο τη δείχνει.
// Πίνακας: public.promotions (supabase/promotions.sql). Αν λείπει ο πίνακας → καμία προώθηση (ασφαλές).
import type { SupabaseClient } from '@supabase/supabase-js'

export type Promotion = {
  id: string
  location_id: string
  service_id: string
  discount_type: 'percent' | 'amount'
  discount_value: number
  starts_on: string   // YYYY-MM-DD (ημέρα ραντεβού)
  ends_on: string     // YYYY-MM-DD (συμπεριλαμβάνεται)
  is_active: boolean
}

export const round2 = (n: number) => Math.round(n * 100) / 100

/** Τελική τιμή μετά την έκπτωση (ποτέ κάτω από 0). */
export function applyPromo(price: number, p: Pick<Promotion, 'discount_type' | 'discount_value'>): number {
  const v = Number(p.discount_value) || 0
  const out = p.discount_type === 'percent' ? price * (1 - Math.min(Math.max(v, 0), 90) / 100) : price - Math.max(v, 0)
  return Math.max(0, round2(out))
}

/** Ισχύει για ραντεβού της ημέρας `ymd`; */
export const promoCovers = (p: Pick<Promotion, 'starts_on' | 'ends_on' | 'is_active'>, ymd: string) =>
  p.is_active && p.starts_on <= ymd && ymd <= p.ends_on

/** Ενεργή προώθηση για υπηρεσία + ημέρα ραντεβού (server). Μεγαλύτερη έκπτωση αν υπάρχουν πολλές. */
export async function activePromotionFor(admin: SupabaseClient, serviceId: string, slotDate: string, basePrice: number): Promise<Promotion | null> {
  try {
    const { data, error } = await admin.from('promotions')
      .select('id, location_id, service_id, discount_type, discount_value, starts_on, ends_on, is_active')
      .eq('service_id', serviceId).eq('is_active', true)
      .lte('starts_on', slotDate).gte('ends_on', slotDate)
    if (error || !data?.length) return null
    return (data as Promotion[]).sort((a, b) => applyPromo(basePrice, a) - applyPromo(basePrice, b))[0]
  } catch { return null }
}
