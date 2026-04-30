'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check } from 'lucide-react'

function ConfirmedContent() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const sendConfirmation = async () => {
      await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: params.get('email') || 'test@example.com',
          bookingRef: 'WS-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
          locationName: 'Avin Γλυφάδα',
          service: params.get('service') || 'Έξω',
          date: params.get('date') || 'Σήμερα',
          time: params.get('time') || '09:00',
        })
      })
    }
    sendConfirmation()
  }, [])

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md flex flex-col items-center justify-center px-5 text-center min-h-screen">
      <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center mb-6">
        <Check size={28} className="text-white" />
      </div>
      <h1 className="text-xl font-semibold text-gray-900 mb-2">Επιβεβαιώθηκε!</h1>
      <p className="text-sm text-gray-400 mb-2">Στείλαμε επιβεβαίωση στο email σου.</p>
      <p className="text-xs text-gray-300 mb-8">Θα λάβεις υπενθύμιση 1 ώρα πριν.</p>
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

export default function ConfirmedPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-xs text-gray-400">Φόρτωση...</p></div>}>
      <ConfirmedContent />
    </Suspense>
  )
}