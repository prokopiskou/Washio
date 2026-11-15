'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { WashioLoader } from '@/components/WashioLoader'

// Σύνδεσμος από push «Ώρα για φρεσκάρισμα;» → σελίδα του τελευταίου πλυντηρίου με επιλεγμένη την υπηρεσία (μέρα/ώρα διαλέγει ο πελάτης).
// Χωρίς πρόταση (π.χ. όχι συνδεδεμένος) → χάρτης.
export default function RebookPage() {
  const router = useRouter()
  useEffect(() => {
    fetch('/api/rebook/suggest', { cache: 'no-store' }).then(r => r.json())
      .then(j => router.replace(j?.suggestion?.url || '/map'))
      .catch(() => router.replace('/map'))
  }, [router])
  return <main className="min-h-screen bg-gray-50 flex items-center justify-center"><WashioLoader /></main>
}
