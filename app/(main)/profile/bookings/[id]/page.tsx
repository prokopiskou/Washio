'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, MapPin, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type BookingDetail = {
  id: string
  booking_ref: string
  slot_date: string
  slot_start_time: string
  status: string
  total_amount: number
  car_plate: string | null
  stripe_payment_intent_id: string | null
  cancellation_reason: string | null
  cancellation_details: string | null
  cancelled_at: string | null
  locations: { name: string; address: string; city: string } | null
  services: { name: string } | null
}

const MONTHS_SHORT = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']

const CANCEL_REASONS = [
  'Δεν μπορώ να πάω',
  'Άλλαξα σχέδια',
  'Βρήκα άλλο πλυντήριο',
  'Λάθος κράτηση',
  'Άλλο',
]

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

function formatSlotDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`
}

function isUpcoming(slotDate: string, slotTime: string) {
  const now = new Date()
  const [h, m] = (slotTime || '00:00').slice(0, 5).split(':').map(Number)
  const slot = new Date(slotDate)
  slot.setHours(h, m, 0, 0)
  return slot.getTime() > now.getTime()
}

export default function BookingDetailPage() {
  const router = useRouter()
  const params = useParams()
  const bookingId = params.id as string

  const [loading, setLoading] = useState(true)
  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelDetails, setCancelDetails] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')

  useEffect(() => {
    const loadBooking = async () => {
      const supabase = createClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData.session?.user

      if (!user) {
        router.push('/login')
        return
      }

      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, booking_ref, slot_date, slot_start_time, status, total_amount,
          car_plate, stripe_payment_intent_id,
          cancellation_reason, cancellation_details, cancelled_at,
          locations(name, address, city),
          services(name)
        `)
        .eq('id', bookingId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (error || !data) {
        router.push('/profile/bookings')
        return
      }

      setBooking(data as unknown as BookingDetail)
      setLoading(false)
    }

    loadBooking()
  }, [bookingId, router])

  const handleCancel = async () => {
    if (!booking || !cancelReason) return
    if (cancelReason === 'Άλλο' && !cancelDetails.trim()) {
      setCancelError('Περιγράψε τον λόγο ακύρωσης.')
      return
    }

    setCancelling(true)
    setCancelError('')

    const res = await fetch('/api/bookings/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: booking.id,
        paymentIntentId: booking.stripe_payment_intent_id,
        cancellationReason: cancelReason,
        cancellationDetails: cancelDetails.trim() || null,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setCancelError(data.error || 'Σφάλμα ακύρωσης')
      setCancelling(false)
      return
    }

    setBooking(prev => prev ? {
      ...prev,
      status: 'cancelled',
      cancellation_reason: cancelReason,
      cancellation_details: cancelDetails.trim() || null,
      cancelled_at: new Date().toISOString(),
    } : null)
    setShowCancelModal(false)
    setCancelling(false)
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-xs text-gray-400">Φόρτωση...</p>
      </main>
    )
  }

  if (!booking) return null

  const canCancel = (booking.status === 'confirmed' || booking.status === 'pending')
    && isUpcoming(booking.slot_date, booking.slot_start_time)

  const mapsUrl = booking.locations
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${booking.locations.address}, ${booking.locations.city}`)}`
    : '#'

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md pb-8">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <button onClick={() => router.push('/profile/bookings')} className="text-gray-400">
            <ArrowLeft size={18} />
          </button>
          <p className="text-sm font-medium text-gray-900">Κράτηση</p>
        </div>

        <div className="px-5 pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-mono text-gray-400">{booking.booking_ref}</p>
            <span className={`text-xs px-2 py-0.5 rounded-lg ${statusClass(booking.status)}`}>
              {statusLabel(booking.status)}
            </span>
          </div>

          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <div>
              <p className="text-xs text-gray-400">Πρατήριο</p>
              <p className="text-sm font-medium text-gray-900 mt-0.5">{booking.locations?.name || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Υπηρεσία</p>
              <p className="text-sm text-gray-900 mt-0.5">{booking.services?.name || '—'}</p>
            </div>
            <div className="flex gap-4">
              <div>
                <p className="text-xs text-gray-400">Ημερομηνία</p>
                <p className="text-sm text-gray-900 mt-0.5">{formatSlotDate(booking.slot_date)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Ώρα</p>
                <p className="text-sm text-gray-900 mt-0.5">{booking.slot_start_time?.slice(0, 5) || '—'}</p>
              </div>
            </div>
            {booking.car_plate && (
              <div>
                <p className="text-xs text-gray-400">Πινακίδα</p>
                <p className="text-sm text-gray-900 mt-0.5">{booking.car_plate}</p>
              </div>
            )}
            <div className="pt-2 border-t border-gray-200">
              <p className="text-xs text-gray-400">Σύνολο</p>
              <p className="text-lg font-semibold text-gray-900 mt-0.5">€{Number(booking.total_amount || 0).toFixed(0)}</p>
            </div>
          </div>

          {booking.locations && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 border border-gray-100 rounded-xl px-4 py-3"
            >
              <MapPin size={14} className="text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900 truncate">{booking.locations.address}</p>
                <p className="text-xs text-gray-400">{booking.locations.city}</p>
              </div>
            </a>
          )}

          {booking.status === 'cancelled' && booking.cancellation_reason && (
            <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <p className="text-xs text-red-600 font-medium">Λόγος ακύρωσης</p>
              <p className="text-sm text-red-700 mt-0.5">{booking.cancellation_reason}</p>
              {booking.cancellation_details && (
                <p className="text-xs text-red-500 mt-1">{booking.cancellation_details}</p>
              )}
              {booking.cancelled_at && (
                <p className="text-xs text-red-400 mt-2">
                  Ακυρώθηκε: {new Date(booking.cancelled_at).toLocaleString('el-GR', { timeZone: 'Europe/Athens', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          )}

          {canCancel && (
            <button
              onClick={() => setShowCancelModal(true)}
              className="w-full border border-red-200 text-red-600 text-sm font-medium py-3.5 rounded-xl"
            >
              Ακύρωση κράτησης
            </button>
          )}
        </div>
      </div>

      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => !cancelling && setShowCancelModal(false)} />
          <div className="relative bg-white rounded-t-3xl px-5 pt-5 pb-10 w-full max-w-md z-10">
            <div className="flex items-center justify-between mb-4">
              <p className="text-base font-semibold text-gray-900">Ακύρωση κράτησης</p>
              <button onClick={() => setShowCancelModal(false)} className="text-gray-400" disabled={cancelling}>
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-gray-500 mb-4">
              Η χρέωση θα επιστραφεί εντός 5–7 εργάσιμων ημερών.
            </p>

            <div className="space-y-2 mb-4">
              {CANCEL_REASONS.map(reason => (
                <button
                  key={reason}
                  onClick={() => setCancelReason(reason)}
                  className={`w-full text-left text-sm px-4 py-3 rounded-xl border transition-all ${
                    cancelReason === reason ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-700'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>

            {cancelReason === 'Άλλο' && (
              <textarea
                value={cancelDetails}
                onChange={e => setCancelDetails(e.target.value)}
                placeholder="Περιγράψε τον λόγο..."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm mb-4 focus:outline-none focus:border-gray-400 min-h-[80px]"
              />
            )}

            {cancelError && <p className="text-xs text-red-500 mb-3">{cancelError}</p>}

            <button
              onClick={handleCancel}
              disabled={!cancelReason || cancelling}
              className="w-full bg-red-600 text-white text-sm font-medium py-3.5 rounded-xl disabled:opacity-40"
            >
              {cancelling ? 'Ακύρωση...' : 'Επιβεβαίωση ακύρωσης'}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
