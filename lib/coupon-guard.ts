import { SupabaseClient } from '@supabase/supabase-js'
import { greekMobile } from '@/lib/phone'
import { phoneKey } from '@/lib/referral'

// «Ένα −3€ πρώτου πλυσίματος ανά άνθρωπο» — χωρίς καμία τριβή στον πελάτη.
// Ισχύει ΜΟΝΟ στην πρώτη κράτηση ενός λογαριασμού (τότε το υπόλοιπό του = το welcome).
// Μετά την πρώτη, τα κουπόνια του (π.χ. από φίλους) είναι δικά του και δεν ελέγχονται.
//
// Μπλοκάρει αν, σε ΑΛΛΟ λογαριασμό, κράτηση ΜΕ κουπόνι (όχι ακυρωμένη) έχει:
//   • το ίδιο κινητό (οποιαδήποτε μορφή)       → 'phone'
//   • την ίδια συσκευή (cookie ws_dev)          → 'device'
//   • την ίδια πινακίδα (ΑΒΓ = ABG, κενά κλπ)    → 'plate'
// και αν το κινητό δεν είναι ελληνικό κινητό    → 'phone_invalid'
// Οι στήλες device_id / client_ip / card_fingerprint μπαίνουν με supabase/coupon_guard.sql.
// Αν δεν υπάρχουν ακόμα, ο έλεγχος συσκευής απλώς παραλείπεται (ποτέ δεν σπάει κράτηση).

export type BlockReason = 'phone' | 'device' | 'plate' | 'phone_invalid'

// Ελληνικά γράμματα πινακίδας ↔ λατινικά (ίδια μορφή): ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ.
const GR2LAT: Record<string, string> = {
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K',
  'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X',
}
export function plateKey(raw: string | null | undefined): string | null {
  const s = String(raw || '').toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split('').map(ch => GR2LAT[ch] || ch).join('')
    .replace(/[^A-Z0-9Α-Ω]/g, '')
  return s.length >= 4 ? s : null
}

type CouponRow = { user_id: string | null; car_plate: string | null; device_id?: string | null }

async function couponRowsOfOthers(db: SupabaseClient, userId: string): Promise<CouponRow[]> {
  const base = () => db.from('bookings').select('user_id, car_plate, device_id')
    .gt('coupon_amount', 0).neq('status', 'cancelled').neq('user_id', userId).limit(20000)
  const r = await base()
  if (!r.error) return (r.data || []) as CouponRow[]
  // Χωρίς στήλη device_id (πριν το SQL) → μόνο πινακίδα.
  const r2 = await db.from('bookings').select('user_id, car_plate')
    .gt('coupon_amount', 0).neq('status', 'cancelled').neq('user_id', userId).limit(20000)
  return (r2.data || []) as CouponRow[]
}

export async function couponBlockReason(
  db: SupabaseClient,
  // requirePhone: στην κράτηση (true) χωρίς έγκυρο κινητό → χωρίς κουπόνι. Στον ζωντανό
  // έλεγχο (false) όσο δεν έχει γραφτεί κινητό, ελέγχονται μόνο συσκευή/πινακίδα.
  opts: { userId: string | null; deviceId?: string | null; plate?: string | null; phone?: string | null; requirePhone?: boolean },
): Promise<BlockReason | null> {
  try {
    const { userId } = opts
    // Συνδεδεμένος με δικές του κρατήσεις → όχι πρώτο πλύσιμο → κανένας έλεγχος.
    let phone = opts.phone ?? null
    if (userId) {
      const { count } = await db.from('bookings').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).neq('status', 'cancelled')
      if ((count || 0) > 0) return null
      if (phone == null) {
        const { data: me } = await db.from('profiles').select('phone').eq('id', userId).maybeSingle()
        phone = (me?.phone as string | null) || null
      }
    }

    // 1) Συσκευή / πινακίδα σε άλλο λογαριασμό με κουπόνι.
    const rows = await couponRowsOfOthers(db, userId || '00000000-0000-0000-0000-000000000000')
    if (opts.deviceId && rows.some(r => r.device_id && r.device_id === opts.deviceId)) return 'device'
    const pk = plateKey(opts.plate)
    if (pk && rows.some(r => plateKey(r.car_plate) === pk)) return 'plate'

    // 2) Κινητό: ελληνικό κινητό απαραίτητο για την έκπτωση.
    const hasPhone = String(phone || '').replace(/\D/g, '').length > 0
    if (!hasPhone && !opts.requirePhone) return null
    if (!greekMobile(phone)) return 'phone_invalid'

    // 3) Ίδιο κινητό σε άλλο λογαριασμό με κουπόνι.
    const key = phoneKey(phone)
    if (key) {
      let q = db.from('profiles').select('id, phone').not('phone', 'is', null).limit(10000)
      if (userId) q = q.neq('id', userId)
      const { data: profs } = await q
      const ids = (profs || []).filter(p => phoneKey(p.phone as string) === key).map(p => p.id as string)
      if (ids.length) {
        const { count: used } = await db.from('bookings').select('id', { count: 'exact', head: true })
          .in('user_id', ids).gt('coupon_amount', 0).neq('status', 'cancelled')
        if ((used || 0) > 0) return 'phone'
      }
    }
    return null
  } catch { return null }
}
