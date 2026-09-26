// ============================================================
// ΚΕΝΤΡΙΚΟΣ κατάλογος βασικών υπηρεσιών Washio.
// Το Washio ορίζει ΤΙ υπάρχει· κάθε πλυντήριο ενεργοποιεί/απενεργοποιεί
// και βάζει τις δικές του τιμές. Νέο σημείο = όλα ανενεργά.
// Αλλαγή καταλόγου = αλλαγή ΕΔΩ (και deploy) — πουθενά αλλού.
// ============================================================

export type CatalogService = {
  name: string
  duration_minutes: number
  /** Σε ποιους τύπους οχήματος απευθύνεται (για εμφάνιση στο app). */
  vehicles: ('ΙΧ' | 'SUV' | 'Μοτοσικλέτα')[]
  /** Υπηρεσία ΕΥΡΟΥΣ (min–max, μετρητά, εκτίμηση επιτόπου) — π.χ. βιολογικός. */
  is_range?: boolean
}

export const CORE_SERVICES: CatalogService[] = [
  { name: 'Μέσα', duration_minutes: 30, vehicles: ['ΙΧ', 'SUV'] },
  { name: 'Έξω', duration_minutes: 30, vehicles: ['ΙΧ', 'SUV'] },
  { name: 'Μέσα & Έξω', duration_minutes: 30, vehicles: ['ΙΧ', 'SUV'] },
  { name: 'Πλύσιμο Μοτο', duration_minutes: 30, vehicles: ['Μοτοσικλέτα'] },
  { name: 'Βιολογικός καθαρισμός', duration_minutes: 90, vehicles: ['ΙΧ', 'SUV'], is_range: true },
]

export function catalogEntry(name: string): CatalogService | undefined {
  return CORE_SERVICES.find(c => c.name === name)
}

/**
 * Υπηρεσία μοτοσικλέτας; Πιάνει και το παλιό όνομα «Πλύσιμο» (υπάρχοντα rows
 * στη βάση πριν τη μετονομασία) και το νέο «Πλύσιμο Μοτο».
 */
export function isMotoService(name: string): boolean {
  return name === 'Πλύσιμο' || name === 'Πλύσιμο Μοτο'
}
