// Πακέτα πλυσιμάτων (τούνελ, χωρίς ραντεβού) — server-only. Πίνακες: supabase/tunnel_packs.sql
// Αγορά: PaymentIntent με metadata.kind='pack' → fulfillPackIntent (webhook + αυτο-ίαση από τη σελίδα).
// Χρήση: redeemPackWash → κράτηση για ΤΩΡΑ με κανονικό QR (stripe_payment_status='pack').
import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'
import { athensToday } from '@/lib/time'
import { checkinCode } from '@/lib/checkin'

export type PackRow = {
  id: string; location_id: string; service_id: string; name: string
  washes: number; price: number; valid_days: number; is_active: boolean; sort_order: number
}

export function athensHHMM(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}

/** Δημιουργεί την αγορά από επιτυχημένο intent. Idempotent (unique payment_intent_id). */
export async function fulfillPackIntent(admin: SupabaseClient, intent: Stripe.PaymentIntent): Promise<{ ok: boolean; purchaseId?: string; error?: string }> {
  const m = intent.metadata || {}
  if (m.kind !== 'pack') return { ok: false, error: 'not a pack' }
  if (intent.status !== 'succeeded') return { ok: false, error: 'not paid' }
  const { data: existing } = await admin.from('pack_purchases').select('id').eq('payment_intent_id', intent.id).maybeSingle()
  if (existing) return { ok: true, purchaseId: existing.id as string }

  const { data: pack } = await admin.from('wash_packs').select('*').eq('id', m.packId).maybeSingle()
  if (!pack) return { ok: false, error: 'pack missing' }
  const p = pack as PackRow
  const price = Number(m.price) || Number(p.price)
  const { data: loc } = await admin.from('locations').select('commission_rate').eq('id', p.location_id).maybeSingle()
  const rate = Number(loc?.commission_rate ?? 10)
  const expires = new Date(Date.now() + (Number(p.valid_days) || 180) * 864e5).toISOString()

  const { data: ins, error } = await admin.from('pack_purchases').insert({
    user_id: m.userId, pack_id: p.id, location_id: p.location_id, service_id: p.service_id,
    name: p.name, washes_total: p.washes, washes_left: p.washes, price,
    platform_fee: +(price * rate / 100).toFixed(2), expires_at: expires,
    payment_intent_id: intent.id, status: 'active',
  }).select('id').single()
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      const { data: again } = await admin.from('pack_purchases').select('id').eq('payment_intent_id', intent.id).maybeSingle()
      return { ok: true, purchaseId: again?.id as string }
    }
    return { ok: false, error: error.message }
  }
  return { ok: true, purchaseId: ins.id as string }
}

type Redeemed = { ok: true; bookingId: string; ref: string; checkin: string; left: number; reused: boolean } | { ok: false; error: string; status: number }

/** 1 πλύσιμο από πακέτο → κράτηση για σήμερα/τώρα. Αν υπάρχει ήδη ανοιχτή (μη σκαναρισμένη) σημερινή → την ξαναδίνει. */
export async function redeemPackWash(admin: SupabaseClient, userId: string, purchaseId: string, carPlate?: string): Promise<Redeemed> {
  const { data: pu } = await admin.from('pack_purchases').select('*').eq('id', purchaseId).eq('user_id', userId).maybeSingle()
  if (!pu) return { ok: false, error: 'Το πακέτο δεν βρέθηκε', status: 404 }
  if (pu.status !== 'active') return { ok: false, error: 'Το πακέτο δεν είναι ενεργό', status: 409 }
  if (Date.parse(pu.expires_at) < Date.now()) return { ok: false, error: 'Το πακέτο έληξε', status: 409 }

  const today = athensToday()
  // Ήδη πάτησε «Χρησιμοποίησε» σήμερα και δεν σκαναρίστηκε ακόμα → ίδιο QR, χωρίς νέα χρέωση πλυσίματος.
  const { data: reds } = await admin.from('pack_redemptions').select('booking_id').eq('purchase_id', purchaseId).order('created_at', { ascending: false }).limit(3)
  const ids = (reds || []).map(r => r.booking_id).filter(Boolean)
  if (ids.length) {
    const { data: open } = await admin.from('bookings').select('id, booking_ref, checked_in_at, status, slot_date')
      .in('id', ids).eq('slot_date', today).is('checked_in_at', null).neq('status', 'cancelled').limit(1)
    const o = open?.[0]
    if (o) return { ok: true, bookingId: o.id, ref: o.booking_ref, checkin: checkinCode(o.booking_ref), left: pu.washes_left, reused: true }
  }

  if (pu.washes_left <= 0) return { ok: false, error: 'Δεν έχουν μείνει πλυσίματα στο πακέτο', status: 409 }
  // ΔΕΝ αφαιρείται πλύσιμο εδώ — μόνο όταν το πλυντήριο σκανάρει το QR (consumePackWash στο check-in).

  const perWash = +(Number(pu.price) / Number(pu.washes_total)).toFixed(2)
  const bookingRef = 'WS-' + Math.random().toString(16).slice(2, 10).toUpperCase()
  const { data: b, error } = await admin.from('bookings').insert({
    booking_ref: bookingRef, user_id: userId, location_id: pu.location_id, service_id: pu.service_id,
    slot_id: null, slot_date: today, slot_start_time: athensHHMM(), duration_minutes: 15,
    source: 'platform', car_plate: (carPlate || '').toUpperCase().replace(/[^A-ZΑ-Ω0-9 \-]/g, '').slice(0, 12) || null,
    total_amount: perWash, service_price: perWash, addons: [], coupon_amount: 0,
    platform_fee: 0, // η προμήθεια χρεώθηκε στην αγορά του πακέτου
    stripe_payment_intent_id: null, stripe_payment_status: 'pack', paid_at: new Date().toISOString(), status: 'confirmed',
  }).select('id').single()
  if (error || !b) {
    return { ok: false, error: error?.message || 'Σφάλμα', status: 500 }
  }
  await admin.from('pack_redemptions').insert({ purchase_id: purchaseId, booking_id: b.id })
  return { ok: true, bookingId: b.id, ref: bookingRef, checkin: checkinCode(bookingRef), left: pu.washes_left, reused: false }
}

/** Check-in κράτησης πακέτου → αφαιρεί 1 πλύσιμο (μία φορά). */
export async function consumePackWash(admin: SupabaseClient, bookingId: string): Promise<number | null> {
  const { data: r } = await admin.from('pack_redemptions').select('id, purchase_id, consumed_at').eq('booking_id', bookingId).maybeSingle()
  if (!r || r.consumed_at) return null
  const { data: mark } = await admin.from('pack_redemptions').update({ consumed_at: new Date().toISOString() }).eq('id', r.id).is('consumed_at', null).select('id')
  if (!mark || mark.length === 0) return null
  for (let i = 0; i < 3; i++) {
    const { data: pu } = await admin.from('pack_purchases').select('washes_left').eq('id', r.purchase_id).maybeSingle()
    if (!pu) return null
    const next = Math.max(0, Number(pu.washes_left) - 1)
    const { data: ok } = await admin.from('pack_purchases').update({ washes_left: next }).eq('id', r.purchase_id).eq('washes_left', pu.washes_left).select('id')
    if (ok && ok.length) return next
  }
  return null
}

/** Ακύρωση πλυσίματος πακέτου: αν είχε σκαναριστεί, το πλύσιμο επιστρέφει στο πακέτο. */
export async function restorePackWash(admin: SupabaseClient, bookingId: string): Promise<void> {
  const { data: r } = await admin.from('pack_redemptions').select('purchase_id, consumed_at').eq('booking_id', bookingId).maybeSingle()
  if (!r) return
  if (r.consumed_at) {
    const { data: pu } = await admin.from('pack_purchases').select('washes_left, washes_total').eq('id', r.purchase_id).maybeSingle()
    if (pu) await admin.from('pack_purchases').update({ washes_left: Math.min(pu.washes_total, pu.washes_left + 1) }).eq('id', r.purchase_id)
  }
  await admin.from('pack_redemptions').delete().eq('booking_id', bookingId)
}
