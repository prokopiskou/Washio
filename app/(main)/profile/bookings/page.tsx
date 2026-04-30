'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type UserBooking = {
  id: string
  slot_date: string
  slot_time: string
  total_amount: number
  status: string
  locations?: { name?: string } | null
  services?: { name?: string } | null
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
        .select('id, slot_date, slot_time, total_amount, status, locations(name), services(name)')
        .or(`user_id.eq.${user.id},profile_id.eq.${user.id}`)
        .order('slot_date', { ascending: false })

      setBookings((data as UserBooking[]) || [])
      setLoading(false)
    }

    loadBookings()
  }, [router])

  const statusClass = (status?: string) => {
    if (status === 'pending') return 'bg-amber-50 text-amber-600'
    if (status === 'confirmed') return 'bg-blue-50 text-blue-600'
    if (status === 'completed') return 'bg-green-50 text-green-600'
    if (status === 'cancelled') return 'bg-red-50 text-red-500'
    return 'bg-gray-50 text-gray-500'
  }

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
            <p className="text-sm text-gray-500">Δεν υπάρχουν κρατήσεις.</p>
          </div>
        ) : (
          <div className="px-4 pt-4 flex flex-col gap-2">
            {bookings.map(booking => (
              <div key={booking.id} className="bg-white border border-gray-100 rounded-xl p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-gray-900">{booking.locations?.name || 'Πρατήριο'} · {booking.services?.name || 'Υπηρεσία'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{booking.slot_date} · {booking.slot_time}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-md ${statusClass(booking.status)}`}>{booking.status}</span>
                </div>
                <p className="text-sm font-medium text-gray-900 mt-2">€{Number(booking.total_amount || 0).toFixed(0)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
