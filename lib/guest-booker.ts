// Κράτηση επισκέπτη με email που ΥΠΑΡΧΕΙ ήδη (23/11): χωρίς κωδικό, χωρίς όνομα.
// Η κράτηση γράφεται στον υπάρχοντα λογαριασμό αυτού του email, ΑΛΛΑ ο επισκέπτης ΔΕΝ συνδέεται
// σε αυτόν (δεν βλέπει ιστορικό / κάρτες / στοιχεία). Μόνο «Πληρωμή στο πλυντήριο».
// Ο κάτοχος του email παίρνει κανονικά το email επιβεβαίωσης.
import type { SupabaseClient } from '@supabase/supabase-js'
import { phoneOk } from '@/lib/phone'

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/

export type GuestBooker = { id: string; email: string; phone: string }

/** Βρίσκει τον υπάρχοντα λογαριασμό του email (null αν δεν υπάρχει / άκυρα στοιχεία). */
export async function resolveGuestBooker(admin: SupabaseClient, rawEmail: unknown, rawPhone: unknown): Promise<GuestBooker | null> {
  const email = String(rawEmail || '').trim().toLowerCase().slice(0, 200)
  const phone = String(rawPhone || '').trim().slice(0, 30)
  if (!EMAIL_RE.test(email) || !phoneOk(phone)) return null
  const { data } = await admin.from('profiles').select('id, email').ilike('email', email).limit(1).maybeSingle()
  return data?.id ? { id: data.id as string, email, phone } : null
}
