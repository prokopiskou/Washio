// Ρύθμιση checkout από το admin (πίνακας app_settings, key 'checkout'):
//   default_pay: 'card' | 'venue'  → τι είναι προεπιλεγμένο στο checkout
//   card_fee:    boolean           → τέλος υπηρεσίας (SERVICE_FEE_EUR) στις πληρωμές με κάρτα
//   since:       ISO               → πότε άλλαξε τελευταία (για σύγκριση πριν/μετά)
// Αν λείπει ο πίνακας/γραμμή → κάρτα προεπιλογή, χωρίς τέλος (η τρέχουσα δοκιμή).
import type { SupabaseClient } from '@supabase/supabase-js'
import { SERVICE_FEE_EUR } from '@/lib/pricing'

export type CheckoutConfig = { defaultPay: 'card' | 'venue'; cardFee: boolean; fee: number; since: string | null }

export const DEFAULT_CHECKOUT: CheckoutConfig = { defaultPay: 'card', cardFee: false, fee: 0, since: null }

export async function getCheckoutConfig(db: SupabaseClient): Promise<CheckoutConfig> {
  try {
    const { data, error } = await db.from('app_settings').select('value').eq('key', 'checkout').maybeSingle()
    if (error || !data?.value) return DEFAULT_CHECKOUT
    const v = data.value as { default_pay?: string; card_fee?: boolean; since?: string }
    const cardFee = v.card_fee === true
    return { defaultPay: v.default_pay === 'venue' ? 'venue' : 'card', cardFee, fee: cardFee ? SERVICE_FEE_EUR : 0, since: v.since || null }
  } catch { return DEFAULT_CHECKOUT }
}
