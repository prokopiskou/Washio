// Server-only κομμάτι του referral (στέλνει push → ΔΕΝ πρέπει να μπει σε client bundle).
import { SupabaseClient } from '@supabase/supabase-js'
import { sendPush } from '@/lib/push'
import { REFERRER_REWARD, MAX_REFERRALS } from '@/lib/referral'

// Μόλις ο φίλος κάνει την ΠΡΩΤΗ του κράτηση → +3€ στον referrer (έως MAX_REFERRALS = 2 φίλοι).
export async function grantReferrerRewardIfFirst(
  db: SupabaseClient, referredUserId: string, bookingId: string
): Promise<void> {
  try {
    const { data: ref } = await db.from('referrals')
      .select('id, referrer_id, referrer_reward, status')
      .eq('referred_id', referredUserId).maybeSingle()
    if (!ref || ref.status !== 'pending') return

    // Όριο: επιβράβευση για έως 2 φίλους (μετράμε τις ήδη ολοκληρωμένες παραπομπές του).
    const { count } = await db.from('referrals')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_id', ref.referrer_id).eq('status', 'completed')
    const underCap = (count || 0) < MAX_REFERRALS

    // Κλείδωσε ΑΤΟΜΙΚΑ (μόνο αν είναι ακόμα pending) → καμία διπλή επιβράβευση.
    const { data: claimed } = await db.from('referrals').update({
      status: 'completed', completed_at: new Date().toISOString(), booking_id: bookingId,
    }).eq('id', ref.id).eq('status', 'pending').select('id')
    if (!claimed || claimed.length === 0) return
    if (!underCap) return // πάνω από 2 φίλους: η παραπομπή κλείνει χωρίς επιβράβευση

    const reward = Number(ref.referrer_reward) || REFERRER_REWARD
    await db.rpc('apply_credit', {
      p_user: ref.referrer_id, p_delta: reward,
      p_kind: 'referral_reward', p_booking: bookingId, p_note: 'Επιβράβευση παραπομπής',
    })
    // Ενημέρωση στον referrer.
    try {
      await sendPush(ref.referrer_id, {
        title: `🎁 Κέρδισες −${reward}€!`,
        body: 'Ένας φίλος σου έκλεισε το πρώτο του πλύσιμο. Το κουπόνι μπήκε στον λογαριασμό σου.',
        url: '/profile/rewards',
      })
    } catch { /* best-effort */ }
  } catch { /* best-effort */ }
}

// Η κράτηση του φίλου ακυρώθηκε / no-show → αφαίρεσε το +3€ από τον referrer και
// ξανα-άνοιξε την παραπομπή (θα επιβραβευτεί στην επόμενη πραγματική κράτηση).
export async function revokeReferrerReward(
  db: SupabaseClient, bookingId: string
): Promise<void> {
  try {
    const { data: ref } = await db.from('referrals')
      .select('id, referrer_id, referrer_reward, status')
      .eq('booking_id', bookingId).eq('status', 'completed').maybeSingle()
    if (!ref) return
    // Αφαιρούμε μόνο αν ΟΝΤΩΣ δόθηκε επιβράβευση γι' αυτή την κράτηση (όχι πάνω από το όριο).
    const { data: rewarded } = await db.from('credit_ledger').select('id')
      .eq('user_id', ref.referrer_id).eq('kind', 'referral_reward').eq('booking_id', bookingId).gt('amount', 0).limit(1)
    const { data: reopened } = await db.from('referrals')
      .update({ status: 'pending', completed_at: null, booking_id: null })
      .eq('id', ref.id).eq('status', 'completed').select('id')
    if (!reopened || reopened.length === 0) return
    if (!rewarded || rewarded.length === 0) return
    await db.rpc('apply_credit', {
      p_user: ref.referrer_id, p_delta: -(Number(ref.referrer_reward) || REFERRER_REWARD),
      p_kind: 'referral_reward', p_booking: null, p_note: 'Ακύρωση παραπομπής (η κράτηση του φίλου ακυρώθηκε)',
    })
  } catch { /* best-effort */ }
}
