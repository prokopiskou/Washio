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

// ── Υπεύθυνος πλυντηρίου ────────────────────────────────────────────────────────────────────────
// Ο υπεύθυνος γίνεται ο ΚΥΡΙΟΣ λογαριασμός του πλυντηρίου (owner_id): παίρνει τις ειδοποιήσεις,
// σκανάρει, αλλάζει ωράριο/τιμές. Ο προηγούμενος κύριος λογαριασμός (ο ιδιοκτήτης της αλυσίδας)
// μένει ΜΕΛΟΣ (role 'group') → συνεχίζει να βλέπει το πλυντήριο στο dashboard του.
//
// Αν ο υπεύθυνος δεν έχει ακόμα λογαριασμό, η ανάθεση μένει «σε αναμονή»
// (app_settings 'pending_managers') και ολοκληρώνεται μόνη της την πρώτη φορά που θα συνδεθεί
// με αυτό το email (/api/dashboard/claim).
export type PendingManager = { locationId: string; email: string; name?: string; phone?: string }

export async function assignManager(db: SupabaseClient, o: { locationId: string; managerUserId: string; name?: string; phone?: string }): Promise<{ ok: boolean; error?: string; previousOwner?: string | null }> {
  const { data: loc, error } = await db.from('locations').select('id, owner_id').eq('id', o.locationId).maybeSingle()
  if (error || !loc) return { ok: false, error: 'Το πλυντήριο δεν βρέθηκε' }
  const prev = (loc as { owner_id?: string | null }).owner_id || null
  if (prev !== o.managerUserId) {
    // Πρώτα ο προηγούμενος γίνεται μέλος (να μη χάσει ούτε στιγμή την πρόσβαση), μετά αλλάζει ο κύριος λογαριασμός.
    if (prev) {
      const { error: mErr } = await db.from('location_members').upsert({ location_id: o.locationId, user_id: prev, role: 'group' }, { onConflict: 'location_id,user_id' })
      if (mErr) return { ok: false, error: 'location_members: ' + mErr.message }
    }
    const { error: uErr } = await db.from('locations').update({ owner_id: o.managerUserId }).eq('id', o.locationId)
    if (uErr) return { ok: false, error: uErr.message }
    // Αν ο υπεύθυνος ήταν ήδη μέλος, δεν χρειάζεται πια.
    await db.from('location_members').delete().eq('location_id', o.locationId).eq('user_id', o.managerUserId).then(() => null, () => null)
  }
  // Όνομα / κινητό στο προφίλ του, μόνο αν λείπουν.
  if (o.name || o.phone) {
    try {
      const { data: p } = await db.from('profiles').select('full_name, phone').eq('id', o.managerUserId).maybeSingle()
      const patch: Record<string, string> = {}
      if (o.name && !(p?.full_name as string | null)) patch.full_name = o.name
      if (o.phone && !(p?.phone as string | null)) patch.phone = o.phone
      if (Object.keys(patch).length) await db.from('profiles').update(patch).eq('id', o.managerUserId)
    } catch { /* best-effort */ }
  }
  return { ok: true, previousOwner: prev }
}

export async function readPendingManagers(db: SupabaseClient): Promise<PendingManager[]> {
  try {
    const { data } = await db.from('app_settings').select('value').eq('key', 'pending_managers').maybeSingle()
    const items = (data?.value as { items?: PendingManager[] } | null)?.items
    return Array.isArray(items) ? items.filter(i => i && i.locationId && i.email) : []
  } catch { return [] }
}
export async function writePendingManagers(db: SupabaseClient, items: PendingManager[]) {
  await db.from('app_settings').upsert({ key: 'pending_managers', value: { items }, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}

/** Πρώτη σύνδεση υπευθύνου: ολοκληρώνει όσες αναθέσεις περιμένουν το email του. Γυρίζει τα πλυντήρια που πήρε. */
export async function claimPendingManager(db: SupabaseClient, userId: string, email: string): Promise<string[]> {
  const me = email.trim().toLowerCase()
  if (!me) return []
  const all = await readPendingManagers(db)
  const mine = all.filter(i => i.email.trim().toLowerCase() === me)
  if (!mine.length) return []
  const got: string[] = []
  for (const i of mine) {
    const r = await assignManager(db, { locationId: i.locationId, managerUserId: userId, name: i.name, phone: i.phone })
    if (r.ok) got.push(i.locationId)
  }
  if (got.length) await writePendingManagers(db, all.filter(i => !(i.email.trim().toLowerCase() === me && got.includes(i.locationId))))
  return got
}
