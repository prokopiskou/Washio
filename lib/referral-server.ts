// Server-only κομμάτι του referral (στέλνει push → ΔΕΝ πρέπει να μπει σε client bundle).
import { SupabaseClient } from '@supabase/supabase-js'
import { sendPush } from '@/lib/push'
import { REFERRER_REWARD, MAX_REFERRALS } from '@/lib/referral'
import { NO_SHOW_UNTIL_MIN } from '@/lib/no-show'

// Instant (epoch ms) μιας ώρας Ελλάδας (χειρίζεται θερινή/χειμερινή ώρα).
function athensEpoch(dateStr: string, timeStr: string): number {
  const naive = new Date(`${dateStr}T${String(timeStr || '00:00').slice(0, 5)}:00Z`).getTime()
  const local = new Date(naive)
  const asAthens = new Date(local.toLocaleString('en-US', { timeZone: 'Europe/Athens' }))
  const asUtc = new Date(local.toLocaleString('en-US', { timeZone: 'UTC' }))
  return naive + (asUtc.getTime() - asAthens.getTime())
}

// Cron (κάθε 15'): ο referrer παίρνει το +3€ ΟΤΑΝ ΟΛΟΚΛΗΡΩΘΕΙ το πρώτο πλύσιμο του φίλου —
// δηλαδή όταν κλείσει το παράθυρο «Δεν εμφανίστηκε» (ώρα ραντεβού + NO_SHOW_UNTIL_MIN) χωρίς
// ακύρωση/no-show. ΟΧΙ πια τη στιγμή της κράτησης.
export async function processReferralRewards(db: SupabaseClient): Promise<number> {
  let granted = 0
  try {
    const { data: pending } = await db.from('referrals').select('referred_id').eq('status', 'pending').limit(500)
    const ids = [...new Set((pending || []).map(p => p.referred_id as string).filter(Boolean))]
    if (!ids.length) return 0
    const { data: bks } = await db.from('bookings')
      .select('id, user_id, slot_date, slot_start_time, status')
      .in('user_id', ids).in('status', ['confirmed', 'completed', 'pending'])
    const cutoff = Date.now() - NO_SHOW_UNTIL_MIN * 60_000
    const done = new Map<string, { id: string; at: number }>()
    for (const b of bks || []) {
      if (b.status === 'pending') continue // απλήρωτη/μη επιβεβαιωμένη → όχι
      const at = athensEpoch(String(b.slot_date), String(b.slot_start_time || '00:00'))
      if (!(at <= cutoff)) continue
      const cur = done.get(b.user_id as string)
      if (!cur || at < cur.at) done.set(b.user_id as string, { id: b.id as string, at })
    }
    for (const [uid, b] of done) {
      const before = granted
      await grantReferrerRewardIfFirst(db, uid, b.id)
      // Μετράμε αν πράγματι έκλεισε η παραπομπή.
      const { data: r } = await db.from('referrals').select('status').eq('referred_id', uid).maybeSingle()
      if (r?.status === 'completed') granted = before + 1
    }
  } catch { /* best-effort */ }
  return granted
}

// Το πρώτο πλύσιμο του φίλου ΟΛΟΚΛΗΡΩΘΗΚΕ → +3€ στον referrer (έως MAX_REFERRALS = 2 φίλοι).
// Καλείται ΜΟΝΟ από processReferralRewards (cron).
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
        body: 'Ο φίλος σου ολοκλήρωσε το πρώτο του πλύσιμο. Το κουπόνι μπήκε στον λογαριασμό σου.',
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
