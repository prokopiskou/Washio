// «Κλείσε ξανά»: το τελευταίο ολοκληρωμένο πλύσιμο του πελάτη → ίδιο πλυντήριο, ίδια υπηρεσία (χωρίς πρόσθετα).
// Ανοίγει η σελίδα του πλυντηρίου με την υπηρεσία επιλεγμένη — ΜΕΡΑ ΚΑΙ ΩΡΑ τις διαλέγει ο πελάτης.
// Χρησιμοποιείται από: κάρτα αρχικής (components/RebookCard), /rebook (push «Ώρα για φρεσκάρισμα;»).
import type { SupabaseClient } from '@supabase/supabase-js'
import { athensEpoch } from '@/lib/time'

/** Από πόσες μέρες μετά το τελευταίο πλύσιμο εμφανίζεται η κάρτα «Κλείσε ξανά». */
export const REBOOK_AFTER_DAYS = 7

export type RebookSuggestion = {
  daysSince: number
  location: { id: string; name: string; slug: string }
  service: { id: string; name: string; price: number }
  url: string // σελίδα πλυντηρίου με επιλεγμένη την υπηρεσία → ο πελάτης διαλέγει μέρα & ώρα
}

type Row = {
  id: string; location_id: string; service_id: string | null; slot_date: string; slot_start_time: string; duration_minutes: number | null
  car_model: string | null; checked_in_at: string | null; status: string
  services: { id: string; name: string; price: number | null; price_suv: number | null; price_moto: number | null; duration_minutes: number | null; is_active: boolean | null; is_range: boolean | null } | null
  locations: { id: string; name: string; slug: string; capacity: number | null; is_active: boolean | null } | null
}

export async function suggestRebook(db: SupabaseClient, userId: string): Promise<RebookSuggestion | null> {
  const { data } = await db.from('bookings')
    .select('id, location_id, service_id, slot_date, slot_start_time, duration_minutes, car_model, checked_in_at, status, services(id, name, price, price_suv, price_moto, duration_minutes, is_active, is_range), locations(id, name, slug, capacity, is_active)')
    .eq('user_id', userId).not('status', 'in', '(cancelled,no_show)')
    .order('slot_date', { ascending: false }).order('slot_start_time', { ascending: false }).limit(15)
  const rows = (data || []) as unknown as Row[]
  const now = Date.now()
  // Έχει ήδη επόμενη κράτηση → δεν προτείνουμε τίποτα.
  if (rows.some(b => athensEpoch(b.slot_date, b.slot_start_time) > now && !b.checked_in_at)) return null
  // Τελευταίο ΑΠΛΟ πλύσιμο (όχι βιολογικός/εύρος τιμής — αυτά δεν επαναλαμβάνονται κάθε 2 εβδομάδες).
  const last = rows.find(b => b.services && !b.services.is_range && b.services.is_active !== false && b.locations?.is_active !== false && b.locations?.slug)
  if (!last || !last.services || !last.locations) return null
  const daysSince = Math.floor((now - athensEpoch(last.slot_date, last.slot_start_time)) / 864e5)
  const loc = last.locations, svc = last.services
  // Μέρα και ώρα τις διαλέγει ο ΠΕΛΑΤΗΣ: ανοίγουμε τη σελίδα του πλυντηρίου με επιλεγμένη την υπηρεσία.
  const url = `/locations/${loc.slug}?service=${svc.id}&utm_source=rebook`
  return {
    daysSince,
    location: { id: loc.id, name: loc.name, slug: loc.slug },
    service: { id: svc.id, name: svc.name, price: Number(svc.price) || 0 },
    url,
  }
}
