'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function ConfirmedContent() {
  const router = useRouter()
  const params = useSearchParams()
  const [bookingRef, setBookingRef] = useState('')

  useEffect(() => {
    const fetchAndNotify = async () => {
      const intentId = params.get('payment_intent')
      let ref = 'WS-' + Math.random().toString(36).substring(2, 8).toUpperCase()

      if (intentId) {
        const supabase = createClient()
        const { data } = await supabase
          .from('bookings')
          .select('booking_ref')
          .eq('stripe_payment_intent_id', intentId)
          .single()

        if (data?.booking_ref) {
          ref = data.booking_ref
          setBookingRef(data.booking_ref)
        }
      }

      const email = params.get('email') || ''
      if (!email) return

      await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'confirmation',
          to: email,
          bookingRef: ref,
          locationName: 'Avin Γλυφάδα',
          service: params.get('service') || '',
          date: params.get('date') || '',
          time: params.get('time') || '',
          plate: params.get('plate') || '',
          total: params.get('total') || '',
        })
      })
    }

    fetchAndNotify()
  }, [])

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md flex flex-col items-center justify-center px-5 text-center min-h-screen">
        <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center mb-6">
          <Check size={28} className="text-white" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Επιβεβαιώθηκε!</h1>
        {bookingRef && (
          <p className="text-sm font-medium text-gray-900 mb-1">{bookingRef}</p>
        )}
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