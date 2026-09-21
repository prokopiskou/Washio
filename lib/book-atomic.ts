// ============================================================
// Ατομική δημιουργία κράτησης μέσω public.book_slot_atomic (Postgres).
// Βλ. supabase/atomic_booking.sql. Κλειδώνει ανά (location, μέρα),
// ξαναμετράει πληρότητα και κάνει insert στην ίδια συναλλαγή.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

export type AtomicBookingResult =
  | { ok: true; id: string }
  | { ok: false; code: 'SLOT_FULL' | 'DUPLICATE' | 'LOCATION_NOT_FOUND' | 'ERROR'; message: string }

export async function insertBookingAtomic(
  admin: SupabaseClient,
  row: Record<string, unknown>,
): Promise<AtomicBookingResult> {
  const { data, error } = await admin.rpc('book_slot_atomic', { p: row })
  if (error) {
    const msg = String(error.message || '')
    const code = (error as { code?: string }).code
    // Η function δεν έχει τρέξει ακόμα στη βάση (supabase/atomic_booking.sql):
    // fallback στο απλό insert ώστε να ΜΗΝ σταματήσουν οι κρατήσεις. (Χωρίς
    // την ατομικότητα — τρέξε το SQL το συντομότερο.)
    if (code === 'PGRST202' || code === '42883' || /could not find the function|does not exist/i.test(msg)) {
      console.warn('book_slot_atomic missing — falling back to plain insert. Run supabase/atomic_booking.sql!')
      const { data: ins, error: insErr } = await admin.from('bookings').insert(row).select('id').single()
      if (insErr) {
        if ((insErr as { code?: string }).code === '23505') return { ok: false, code: 'DUPLICATE', message: insErr.message }
        return { ok: false, code: 'ERROR', message: insErr.message }
      }
      return { ok: true, id: String(ins.id) }
    }
    if (msg.includes('SLOT_FULL')) {
      return { ok: false, code: 'SLOT_FULL', message: 'Η ώρα δεν είναι πλέον διαθέσιμη. Διάλεξε άλλη ώρα.' }
    }
    if (msg.includes('LOCATION_NOT_FOUND')) {
      return { ok: false, code: 'LOCATION_NOT_FOUND', message: 'Άγνωστο πλυντήριο' }
    }
    // 23505 = unique_violation (π.χ. διπλό stripe_payment_intent_id).
    if ((error as { code?: string }).code === '23505' || msg.includes('duplicate key')) {
      return { ok: false, code: 'DUPLICATE', message: msg }
    }
    return { ok: false, code: 'ERROR', message: msg }
  }
  return { ok: true, id: String(data) }
}
