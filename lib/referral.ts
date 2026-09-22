import { SupabaseClient } from '@supabase/supabase-js'

// Referral + wallet — server-side, best-effort (ποτέ δεν μπλοκάρει booking/auth).
//   • Νέος από link: −3€ welcome (πίστωση στο wallet).
//   • Referrer: +3€ μόλις ο φίλος ΟΛΟΚΛΗΡΩΣΕΙ κράτηση — έως 2 φορές.
//   • Πίστωση εξαργυρώνεται ΜΟΝΟ σε κράτηση, αφήνοντας ≥0.50€ πραγματική χρέωση
//     (Stripe minimum + να μη βγαίνει τζάμπα).

export const WELCOME_DISCOUNT = 3
export const REFERRER_REWARD = 3
export const MAX_REFERRALS = 2
const MIN_CHARGE = 0.5

// Πόσο από το wallet εφαρμόζεται σε μια κράτηση αξίας baseAmount.
export function computeRedeemable(balance: number, baseAmount: number): number {
  const cap = Math.max(0, baseAmount - MIN_CHARGE)
  return Math.max(0, Math.min(Number(balance) || 0, cap))
}

// Σύνδεση νέου χρήστη με τον κωδικό του referrer. Δίνει και το welcome credit.
export async function linkReferral(
  db: SupabaseClient, newUserId: string, rawCode: string | null | undefined
): Promise<void> {
  try {
    const code = (rawCode || '').trim().toUpperCase()
    if (!code) return

    // Ο νέος δεν πρέπει να έχει ήδη referrer.
    const { data: me } = await db.from('profiles').select('referred_by, referral_code').eq('id', newUserId).maybeSingle()
    if (!me || me.referred_by) return
    if (me.referral_code && me.referral_code === code) return // όχι ο δικός του κωδικός

    const { data: referrer } = await db.from('profiles').select('id').eq('referral_code', code).maybeSingle()
    if (!referrer || referrer.id === newUserId) return // άκυρος / self-referral

    // Καταγραφή σύνδεσης + welcome credit (idempotent μέσω unique(referred_id)).
    const { error: refErr } = await db.from('referrals').insert({
      referrer_id: referrer.id, referred_id: newUserId, status: 'pending',
    })
    if (refErr) return // ήδη υπάρχει → μη διπλο-πιστώσεις

    await db.from('profiles').update({ referred_by: referrer.id }).eq('id', newUserId)
    await db.rpc('apply_credit', {
      p_user: newUserId, p_delta: WELCOME_DISCOUNT, p_kind: 'welcome', p_note: 'Καλωσόρισμα',
    })
  } catch { /* best-effort */ }
}

// Εξαργύρωση πίστωσης σε κράτηση (αφαιρεί από το wallet + ledger).
export async function redeemCredit(
  db: SupabaseClient, userId: string, amount: number, bookingId?: string | null
): Promise<void> {
  if (!(amount > 0)) return
  try {
    await db.rpc('apply_credit', {
      p_user: userId, p_delta: -Math.abs(amount), p_kind: 'redeem',
      p_booking: bookingId || null, p_note: 'Εξαργύρωση σε κράτηση',
    })
  } catch { /* best-effort */ }
}

// Επιστροφή πίστωσης (π.χ. αν το booking απέτυχε/ακυρώθηκε πριν πληρωθεί).
export async function refundCredit(
  db: SupabaseClient, userId: string, amount: number
): Promise<void> {
  if (!(amount > 0)) return
  try {
    await db.rpc('apply_credit', { p_user: userId, p_delta: Math.abs(amount), p_kind: 'redeem', p_note: 'Επιστροφή' })
  } catch { /* best-effort */ }
}

// Μόλις ο referred ολοκληρώσει την ΠΡΩΤΗ του κράτηση → reward στον referrer (έως 2).
export async function grantReferrerRewardIfFirst(
  db: SupabaseClient, referredUserId: string, bookingId: string
): Promise<void> {
  try {
    const { data: ref } = await db.from('referrals')
      .select('id, referrer_id, referrer_reward, status')
      .eq('referred_id', referredUserId).maybeSingle()
    if (!ref || ref.status !== 'pending') return

    // Όριο: ο referrer κερδίζει reward για έως MAX_REFERRALS ολοκληρωμένες παραπομπές.
    const { count } = await db.from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_id', ref.referrer_id).eq('status', 'completed')

    // Κλείδωσε το referral ως completed ΠΑΝΤΑ (ώστε να μη ξαναμπεί).
    await db.from('referrals').update({
      status: 'completed', completed_at: new Date().toISOString(), booking_id: bookingId,
    }).eq('id', ref.id)

    // Δώσε reward μόνο αν δεν ξεπεράστηκε το όριο.
    if ((count || 0) < MAX_REFERRALS) {
      await db.rpc('apply_credit', {
        p_user: ref.referrer_id, p_delta: Number(ref.referrer_reward) || REFERRER_REWARD,
        p_kind: 'referral_reward', p_booking: bookingId, p_note: 'Επιβράβευση παραπομπής',
      })
    }
  } catch { /* best-effort */ }
}
