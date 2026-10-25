import { SupabaseClient } from '@supabase/supabase-js'
import { isCreditEligible } from '@/lib/referral'

// Washio Club — «κάθε 4ο πλύσιμο στο ΙΔΙΟ πλυντήριο −3€».
// Η έκπτωση αφαιρείται από το ποσό που εισπράττει το πλυντήριο (όπως το κουπόνι) — δεν
// πληρώνεται από το υπόλοιπο κουπονιών του πελάτη, ούτε το καταναλώνει.
// Μετράνε οι κρατήσεις πλατφόρμας που ΔΕΝ ακυρώθηκαν / ΔΕΝ ήταν no-show (μαζί με τις επερχόμενες,
// ώστε να μη «διπλοπαίρνει» κανείς με πολλές κρατήσεις μαζί). Ίδιοι κανόνες με το κουπόνι:
// μόνο πλύσιμο ≥12€, όχι υπηρεσία εύρους.
export const LOYALTY_EVERY = 4
export const LOYALTY_EUR = 3

export type LoyaltyStatus = {
  count: number        // κρατήσεις μέχρι τώρα σε αυτό το πλυντήριο
  stamps: number       // σφραγίδες στον τρέχοντα κύκλο (0..3)
  rewardNext: boolean  // η ΕΠΟΜΕΝΗ κράτηση εδώ παίρνει −3€
  every: number
  amount: number
}

export async function loyaltyStatus(db: SupabaseClient, userId: string | null | undefined, locationId: string | null | undefined): Promise<LoyaltyStatus> {
  const base: LoyaltyStatus = { count: 0, stamps: 0, rewardNext: false, every: LOYALTY_EVERY, amount: LOYALTY_EUR }
  if (!userId || !locationId) return base
  try {
    const { count } = await db.from('bookings').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('location_id', locationId)
      .not('status', 'in', '("cancelled","no_show")')
      .or('source.is.null,source.eq.platform')
    const n = count || 0
    return { ...base, count: n, stamps: n % LOYALTY_EVERY, rewardNext: (n + 1) % LOYALTY_EVERY === 0 }
  } catch { return base }
}

/** −3€ αν αυτή η κράτηση είναι η 4η, 8η… στο ίδιο πλυντήριο και το ποσό επιτρέπει έκπτωση. */
export async function loyaltyDiscountFor(db: SupabaseClient, opts: { userId: string; locationId: string; amount: number; isRange?: boolean }): Promise<number> {
  if (opts.isRange || !isCreditEligible(opts.amount)) return 0
  const s = await loyaltyStatus(db, opts.userId, opts.locationId)
  return s.rewardNext ? Math.min(LOYALTY_EUR, opts.amount) : 0
}
