'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type UserBooking = {
  id: string
  booking_ref: string
  slot_date: string
  slot_start_time: string
  total_amount: number
  status: string
  locations?: { name?: string } | null
  services?: { name?: string } | null
}

const MONTHS_SHORT = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

const statusLabel = (status: string) => {
  switch (status) {
    case 'confirmed': return 'Επιβεβαιώθηκε'
    case 'completed': return 'Ολοκληρώθηκε'
    case 'cancelled': return 'Ακυρώθηκε'
    case 'pending': return 'Εκκρεμεί'
    default: return status
  }
}

const statusClass = (status: string) => {
  switch (status) {
    case 'confirmed': return 'bg-blue-50 text-blue-600'
    case 'completed': return 'bg-green-50 text-green-600'
    case 'cancelled': return 'bg-red-50 text-red-500'
    default: return 'bg-gray-50 text-gray-500'
  }
}

export default function ProfileBookingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [bookings, setBookings] = useState<UserBooking[]>([])

  useEffect(() => {
    const loadBookings = async () => {
      const supabase = createClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData.session?.user

      if (!user) {
        router.push('/login')
        return
      }

      const { data } = await supabase
        .from('bookings')
        .select('id, booking_ref, slot_date, slot_start_time, total_amount, status, locations(name), services(name)')
        .eq('user_id', user.id)
        .order('slot_date', { ascending: false })

      setBookings((data as unknown as UserBooking[]) || [])
      setLoading(false)
    }

    loadBookings()
  }, [router])

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md pb-8">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <button onClick={() => router.push('/profile')} className="text-gray-400">
            <ArrowLeft size={18} />
          </button>
          <p className="text-sm font-medium text-gray-900">Όλες οι κρατήσεις</p>
        </div>

        {loading ? (
          <div className="px-5 py-8">
            <p className="text-xs text-gray-400">Φόρτωση...</p>
          </div>
        ) : bookings.length === 0 ? (
          <div className="px-5 py-8">
            <p className="text-sm text-gray-500">Δεν υπάρχουν κρατήσεις ακόμα.</p>
          </div>
        ) : (
          <div className="px-4 pt-4 flex flex-col gap-2">
            {bookings.map(booking => (
              <button
                key={booking.id}
                onClick={() => router.push(`/profile/bookings/${booking.id}`)}
                className="w-full bg-white border border-gray-100 rounded-xl p-4 text-left"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{(booking.locations as any)?.name || 'Πρατήριο'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {(booking.services as any)?.name} · {formatDate(booking.slot_date)} · {booking.slot_start_time?.slice(0, 5)}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-lg ${statusClass(booking.status)}`}>
                    {statusLabel(booking.status)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400 font-mono">{booking.booking_ref}</p>
                  <p className="text-sm font-semibold text-gray-900">€{Number(booking.total_amount || 0).toFixed(0)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}