'use client'

import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'

export default function ConfirmedPage() {
  const router = useRouter()

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md flex flex-col items-center justify-center px-5 text-center min-h-screen">
      <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center mb-6">
        <Check size={28} className="text-white" />
      </div>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">Η κράτησή σου επιβεβαιώθηκε!</h1>
      <p className="text-sm text-gray-400 mb-8">Θα λάβεις επιβεβαίωση στο email σου.</p>
      <button
        onClick={() => router.push('/')}
        className="w-full bg-gray-900 text-white text-sm font-medium py-3.5 rounded-xl"
      >
        Πίσω στην αρχική
      </button>
      </div>
    </main>
  )
}