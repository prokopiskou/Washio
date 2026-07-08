'use client'

import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { useT } from '@/lib/i18n'

const T = {
  el: {
    confirmed: 'Η κράτησή σου επιβεβαιώθηκε!',
    emailNote: 'Θα λάβεις επιβεβαίωση στο email σου.',
    backHome: 'Πίσω στην αρχική',
  },
  en: {
    confirmed: 'Your booking is confirmed!',
    emailNote: 'You will receive a confirmation in your email.',
    backHome: 'Back to home',
  },
}

export default function ConfirmedPage() {
  const router = useRouter()
  const t = useT(T)

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md flex flex-col items-center justify-center px-5 text-center min-h-screen">
      <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center mb-6">
        <Check size={28} className="text-white" />
      </div>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">{t.confirmed}</h1>
      <p className="text-sm text-gray-400 mb-8">{t.emailNote}</p>
      <button
        onClick={() => router.push('/')}
        className="w-full bg-gray-900 text-white text-sm font-medium py-3.5 rounded-xl"
      >
        {t.backHome}
      </button>
      </div>
    </main>
  )
}