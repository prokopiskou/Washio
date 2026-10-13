'use client'

import { useCallback } from 'react'
import { useLocale } from '@/lib/i18n'

// Μετάφραση ονομάτων υπηρεσιών / πρόσθετων (έρχονται από τη βάση στα ελληνικά).
// Ο κατάλογος είναι κοινός για όλα τα πλυντήρια (supabase/service_catalog.sql), άρα αρκεί
// ένας πίνακας. Άγνωστο όνομα (π.χ. custom υπηρεσία πλυντηρίου) → μένει όπως είναι.

const EN: Record<string, string> = {
  // Υπηρεσίες
  'μέσα': 'Interior',
  'έξω': 'Exterior',
  'μέσα & έξω': 'Interior & Exterior',
  'μέσα - έξω': 'Interior & Exterior',
  'μέσα-έξω': 'Interior & Exterior',
  'μέσα και έξω': 'Interior & Exterior',
  'πλύσιμο': 'Wash',
  'βιολογικός καθαρισμός': 'Deep interior cleaning',
  'βιολογικός παιδικού καθίσματος': 'Child seat deep cleaning',
  'πλύσιμο κινητήρα': 'Engine wash',
  'πλύσιμο σασί': 'Underbody wash',
  'γυάλισμα': 'Polishing',
  'κέρωμα': 'Waxing',
  'νανοκεραμική επίστρωση': 'Ceramic coating',
  // Πρόσθετα
  'βάση κινητού': 'Phone holder',
  'ψυκτικά υγρά': 'Coolant',
  'δερμάτινο κάλυμμα τιμονιού': 'Leather steering wheel cover',
  'τάσια': 'Hubcaps',
  'αρωματικό εσωτερικού': 'Car air freshener',
  'αλλαγή λαδιών': 'Oil change',
  'χιονοκουβέρτες': 'Snow socks',
  'πατάκια': 'Floor mats',
  'αλλαγή υαλοκαθαριστήρων': 'Wiper replacement',
  'κάλυμμα καθίσματος για κατοικιδίου': 'Pet seat cover',
  'γυάλισμα φανάρια': 'Headlight polishing',
  'γυάλισμα φαναριών': 'Headlight polishing',
  'καλώδια μπαταρίας': 'Jumper cables',
  'ηλιοπροστασία': 'Sunshade',
  'γυαλιστικό του ταμπλό': 'Dashboard polish',
  'γυαλιστικό ταμπλό': 'Dashboard polish',
  'κιτ φαρμακείου': 'First aid kit',
  'γυάλισμα ελαστικών': 'Tyre shine',
}

export const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()

/** Όνομα υπηρεσίας/πρόσθετου στη γλώσσα του χρήστη (fallback: το αρχικό). */
export function translateCatalogName(name: string | null | undefined, locale: string): string {
  const n = String(name || '')
  if (locale !== 'en' || !n) return n
  return EN[norm(n)] || n
}

/** Hook: const tn = useCatalogName(); tn(service.name) */
export function useCatalogName() {
  const { locale } = useLocale()
  return useCallback((name: string | null | undefined) => translateCatalogName(name, locale), [locale])
}
