import type { SupabaseClient } from '@supabase/supabase-js'

// Ποιος διαχειρίζεται ένα πλυντήριο:
//  • ο κύριος λογαριασμός (locations.owner_id) = ο υπεύθυνος του καταστήματος
//  • τα μέλη του (location_members) = π.χ. ο ιδιοκτήτης αλυσίδας που βλέπει όλα τα πλυντήριά του
// (supabase/location_members.sql). Αν ο πίνακας δεν υπάρχει ακόμα → μόνο ο κύριος λογαριασμός.

/** Είναι ο χρήστης μέλος του πλυντηρίου; (service-role client) */
export async function isLocationMember(db: SupabaseClient, userId: string | null | undefined, locationId: string | null | undefined): Promise<boolean> {
  if (!userId || !locationId) return false
  try {
    const { data, error } = await db.from('location_members').select('user_id').eq('location_id', locationId).eq('user_id', userId).maybeSingle()
    return !error && !!data
  } catch { return false }
}

/** Κύριος λογαριασμός Ή μέλος. */
export async function canManageLocation(db: SupabaseClient, userId: string | null | undefined, locationId: string | null | undefined, ownerId?: string | null): Promise<boolean> {
  if (!userId) return false
  if (ownerId && ownerId === userId) return true
  return isLocationMember(db, userId, locationId)
}

/** Τα πλυντήρια στα οποία είναι ΜΕΛΟΣ (όχι κύριος λογαριασμός). */
export async function memberLocationIds(db: SupabaseClient, userId: string): Promise<string[]> {
  try {
    const { data, error } = await db.from('location_members').select('location_id').eq('user_id', userId)
    return error ? [] : (data || []).map(r => r.location_id as string)
  } catch { return [] }
}
