import { SupabaseClient } from '@supabase/supabase-js'
import { isCreditEligible } from '@/lib/referral'
import { NO_SHOW_UNTIL_MIN } from '@/lib/no-show'
import { athensEpoch } from '@/lib/time'

// Washio Club — «Μάζεψε σταγόνες».
//  • Κάθε ΟΛΟΚΛΗΡΩΜΕΝΟ πλύσιμο σε ένα πλυντήριο = 1 σταγόνα σε αυτό το πλυντήριο.
//    Ολοκληρωμένο = όχι ακυρωμένο / no-show ΚΑΙ έκλεισε το παράθυρο «Δεν εμφανίστηκε» (ώρα + 5h).
//  • 3 σταγόνες στο ίδιο πλυντήριο → το επόμενο πλύσιμο εκεί −3€ (δηλ. κάθε 4ο).
//  • Το πλύσιμο με το δώρο δεν δίνει σταγόνα (ο κύκλος ξαναρχίζει).
// Η έκπτωση αφαιρείται από το ποσό που εισπράττει το πλυντήριο (όπως το κουπόνι) και ΔΕΝ
// ξοδεύει το υπόλοιπο κουπονιών του πελάτη. Μόνο πλύσιμο ≥12€, όχι υπηρεσία εύρους.
export const DROPS_FOR_REWARD = 3
export const LOYALTY_EUR = 3

export type LoyaltyStatus = {
  drops: number        // σταγόνες στον τρέχοντα κύκλο (0..2)
  need: number         // πόσες χρειάζονται (3)
  rewardNext: boolean  // η ΕΠΟΜΕΝΗ κράτηση εδώ παίρνει −3€
  amount: number
}

type Row = { status: string; slot_date: string | null; slot_start_time: string | null; loyalty_discount?: number | null }

export function loyaltyFromRows(rows: Row[], now = Date.now()): LoyaltyStatus {
  let completed = 0, rewardsUsed = 0
  for (const r of rows) {
    if (r.status === 'cancelled' || r.status === 'no_show') continue
    if ((Number(r.loyalty_discount) || 0) > 0) { rewardsUsed++; continue }
    if (!r.slot_date || !r.slot_start_time) continue
    if (now >= athensEpoch(r.slot_date, r.slot_start_time) + NO_SHOW_UNTIL_MIN * 60_000) completed++
  }
  const earned = Math.floor(completed / DROPS_FOR_REWARD)
  const available = earned - rewardsUsed
  return {
    drops: available > 0 ? DROPS_FOR_REWARD : completed % DROPS_FOR_REWARD,
    need: DROPS_FOR_REWARD,
    rewardNext: available > 0,
    amount: LOYALTY_EUR,
  }
}

export async function loyaltyStatus(db: SupabaseClient, userId: string | null | undefined, locationId: string | null | undefined): Promise<LoyaltyStatus> {
  const base: LoyaltyStatus = { drops: 0, need: DROPS_FOR_REWARD, rewardNext: false, amount: LOYALTY_EUR }
  if (!userId || !locationId) return base
  try {
    const q = (cols: string) => db.from('bookings').select(cols)
      .eq('user_id', userId).eq('location_id', locationId).or('source.is.null,source.eq.platform').limit(1000)
    let res = await q('status, slot_date, slot_start_time, loyalty_discount')
    if (res.error) res = await q('status, slot_date, slot_start_time') // πριν το supabase/loyalty.sql
    return loyaltyFromRows((res.data || []) as unknown as Row[])
  } catch { return base }
}

/** −3€ αν ο πελάτης έχει μαζέψει 3 σταγόνες σε αυτό το πλυντήριο και το ποσό επιτρέπει έκπτωση. */
export async function loyaltyDiscountFor(db: SupabaseClient, opts: { userId: string; locationId: string; amount: number; isRange?: boolean }): Promise<number> {
  if (opts.isRange || !isCreditEligible(opts.amount)) return 0
  const s = await loyaltyStatus(db, opts.userId, opts.locationId)
  return s.rewardNext ? Math.min(LOYALTY_EUR, opts.amount) : 0
}
