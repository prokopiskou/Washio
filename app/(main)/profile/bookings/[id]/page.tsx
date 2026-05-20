'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, MapPin, Calendar, Clock, Car, CreditCard, AlertTriangle, X, ChevronRight, ExternalLink, CalendarClock } from 'lucide-react'

type Booking = {
  id: string
  booking_ref: string
  slot_date: string
  slot_start_time: string
  status: string
  total_amount: number
  car_plate: string | null
  stripe_payment_intent_id: string | null
  created_at: string
  location_id: string
  service_id: string
  locations: {
    id: string
    name: string
    address: string
    city: string
  } | null
  services: {
    name: string
  } | null
}

const MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']

const CANCELLATION_REASONS = [
  'Άλλαξαν τα σχέδιά μου',
  'Βρήκα φθηνότερη επιλογή',
  'Δεν είμαι σίγουρος για την ώρα',
  'Λάθος κράτηση',
  'Άλλος λόγος',
]

function generateSlots(openTime: string, closeTime: string): string[] {
  const slots: string[] = []
  const [openH, openM] = openTime.split(':').map(Number)
  const [closeH, closeM] = closeTime.split(':').map(Number)
  let current = openH * 60 + openM
  const end = closeH * 60 + closeM
  while (current < end) {
    const h = Math.floor(current / 60).toString().padStart(2, '0')
    const m = (current % 60).toString().padStart(2, '0')
    slots.push(`${h}:${m}`)
    current += 30
  }
  return slots
}

function jsDayToSupabase(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay
}

export default function BookingDetailPage() {
  const router = useRouter()
  const params = useParams()
  const bookingId = params.id as string

  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)

  // Cancel state
  const [showCancelLate, setShowCancelLate] = useState(false)
  const [showCancelFlow, setShowCancelFlow] = useState(false)
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  // Reschedule state
  const [showRescheduleLate, setShowRescheduleLate] = useState(false)
  const [showReschedule, setShowReschedule] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')
  const [availableSlots, setAvailableSlots] = useState<string[]>([])
  const [rescheduling, setRescheduling] = useState(false)
  const [slotsLoading, setSlotsLoading] = useState(false)

  useEffect(() => {
    const loadBooking = async () => {
      const supabase = createClient()
      const { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session?.user) {
        router.push('/login')
        return
      }

      const { data } = await supabase
        .from('bookings')
        .select('id, booking_ref, slot_date, slot_start_time, status, total_amount, car_plate, stripe_payment_intent_id, created_at, location_id, service_id, locations(id, name, address, city), services(name)')
        .eq('id', bookingId)
        .single()

      setBooking(data as unknown as Booking)
      setLoading(false)
    }
    loadBooking()
  }, [bookingId, router])

  const getHoursUntilSlot = () => {
    if (!booking) return 0
    const slotDateTime = new Date(`${booking.slot_date}T${booking.slot_start_time}`)
    const now = new Date()
    return (slotDateTime.getTime() - now.getTime()) / (1000 * 60 * 60)
  }

  // === CANCEL ===
  const handleCancelClick = () => {
    if (!booking) return
    if (booking.status === 'cancelled' || booking.status === 'completed') return

    const hoursLeft = getHoursUntilSlot()
    if (hoursLeft < 2) {
      setShowCancelLate(true)
    } else {
      setShowCancelFlow(true)
      setStep(1)
    }
  }

  const handleConfirmCancel = async () => {
    if (!booking || !reason || !acknowledged) return
    setCancelling(true)

    const supabase = createClient()

    await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancellation_reason: reason,
        cancellation_details: details || null,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', booking.id)

    try {
      await fetch('/api/bookings/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: booking.id,
          reason,
          details,
        }),
      })
    } catch (e) {
      console.error('Cancel API error:', e)
    }

    setCancelling(false)
    setShowCancelFlow(false)
    setBooking({ ...booking, status: 'cancelled' })
  }

  // === RESCHEDULE ===
  const handleRescheduleClick = () => {
    if (!booking) return
    if (booking.status === 'cancelled' || booking.status === 'completed') return

    const hoursLeft = getHoursUntilSlot()
    if (hoursLeft < 2) {
      setShowRescheduleLate(true)
    } else {
      setShowReschedule(true)
      // Default σε αύριο
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const yyyy = tomorrow.getFullYear()
      const mm = String(tomorrow.getMonth() + 1).padStart(2, '0')
      const dd = String(tomorrow.getDate()).padStart(2, '0')
      setNewDate(`${yyyy}-${mm}-${dd}`)
    }
  }

  // Load available slots for newDate
  useEffect(() => {
    if (!showReschedule || !newDate || !booking) return

    const loadSlots = async () => {
      setSlotsLoading(true)
      const supabase = createClient()
      const dateObj = new Date(newDate)
      const dayOfWeek = jsDayToSupabase(dateObj.getDay())

      // Check exception
      const { data: exceptionData } = await supabase
        .from('location_hours_exceptions')
        .select('periods, is_closed')
        .eq('location_id', booking.location_id)
        .eq('exception_date', newDate)
        .maybeSingle()

      let allTimes: string[] = []

      if (exceptionData) {
        if (exceptionData.is_closed) {
          setAvailableSlots([])
          setSlotsLoading(false)
          return
        }
        for (const period of exceptionData.periods) {
          allTimes = [...allTimes, ...generateSlots(period.open, period.close)]
        }
      } else {
        const { data: hoursData } = await supabase
          .from('location_hours')
          .select('open_time, close_time, is_closed')
          .eq('location_id', booking.location_id)
          .eq('day_of_week', dayOfWeek)
          .single()

        if (!hoursData || hoursData.is_closed) {
          setAvailableSlots([])
          setSlotsLoading(false)
          return
        }
        allTimes = generateSlots(hoursData.open_time, hoursData.close_time)
      }

      // Booked slots
      const { data: bookedData } = await supabase
        .from('bookings')
        .select('slot_start_time')
        .eq('location_id', booking.location_id)
        .eq('slot_date', newDate)
        .not('status', 'in', '("cancelled")')
        .neq('id', booking.id)

      const booked = new Set((bookedData || []).map((b: any) => b.slot_start_time?.slice(0, 5)))

      // Filter past slots if today
      const now = new Date()
      const todayLocalStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const isToday = newDate === todayLocalStr

      const available = allTimes.filter(t => {
        if (booked.has(t)) return false
        if (isToday) {
          const [h, m] = t.split(':').map(Number)
          const slotMinutes = h * 60 + m
          const nowMinutes = now.getHours() * 60 + now.getMinutes()
          if (slotMinutes < nowMinutes + 120) return false // 2h buffer
        }
        return true
      })

      setAvailableSlots(available)
      setSlotsLoading(false)
    }

    loadSlots()
  }, [newDate, showReschedule, booking])

  const handleConfirmReschedule = async () => {
    if (!booking || !newDate || !newTime) return
    setRescheduling(true)

    const supabase = createClient()
    await supabase
      .from('bookings')
      .update({
        slot_date: newDate,
        slot_start_time: newTime + ':00',
      })
      .eq('id', booking.id)

    setRescheduling(false)
    setShowReschedule(false)
    setBooking({ ...booking, slot_date: newDate, slot_start_time: newTime + ':00' })
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-xs text-gray-400">Φόρτωση...</p>
      </main>
    )
  }

  if (!booking) {
    return (
      <main className="min-h-screen bg-white flex flex-col items-center justify-center px-5">
        <p className="text-sm text-gray-500">Η κράτηση δεν βρέθηκε.</p>
        <button onClick={() => router.push('/profile/bookings')} className="mt-4 text-sm text-blue-500">
          Επιστροφή
        </button>
      </main>
    )
  }

  const date = new Date(booking.slot_date)
  const formattedDate = date.toLocaleDateString('el-GR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Athens',
  })

  const mapsUrl = booking.locations
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${booking.locations.address}, ${booking.locations.city}`)}`
    : '#'

  const isActiveBooking = booking.status !== 'cancelled' && booking.status !== 'completed'

  // Min date = today
  const today = new Date()
  const minDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md pb-24">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <button onClick={() => router.back()} className="text-gray-400 p-2 -ml-2">
            <ArrowLeft size={18} />
          </button>
          <p className="text-sm font-medium text-gray-900">Κράτηση</p>
        </div>

        {/* Status banner */}
        {booking.status === 'cancelled' && (
          <div className="bg-red-50 px-5 py-3 flex items-center gap-2">
            <X size={14} className="text-red-500" />
            <p className="text-xs text-red-600 font-medium">Η κράτηση έχει ακυρωθεί</p>
          </div>
        )}
        {booking.status === 'completed' && (
          <div className="bg-green-50 px-5 py-3 flex items-center gap-2">
            <p className="text-xs text-green-600 font-medium">✓ Ολοκληρώθηκε</p>
          </div>
        )}

        {/* Booking ref */}
        <div className="px-5 py-6 text-center border-b border-gray-100">
          <p className="text-xs text-gray-400 mb-1">Κωδικός κράτησης</p>
          <p className="text-lg font-mono font-semibold text-gray-900">{booking.booking_ref}</p>
        </div>

        {/* Location with tappable badge */}
        {booking.locations && (
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
            className="block px-5 py-4 border-b border-gray-100 active:bg-gray-50 transition-colors">
            <div className="flex items-start gap-3">
              <MapPin size={16} className="text-gray-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{booking.locations.name}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <p className="text-xs text-gray-400">
                    {booking.locations.address}, {booking.locations.city}
                  </p>
                  <span className="inline-flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md font-medium">
                    <ExternalLink size={9} />
                    Χάρτης
                  </span>
                </div>
              </div>
              <ChevronRight size={14} className="text-gray-300 shrink-0 mt-1" />
            </div>
          </a>
        )}

        {/* Details */}
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-3">
            <Calendar size={16} className="text-gray-400" />
            <div>
              <p className="text-xs text-gray-400">Ημερομηνία</p>
              <p className="text-sm text-gray-900">{formattedDate}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Clock size={16} className="text-gray-400" />
            <div>
              <p className="text-xs text-gray-400">Ώρα</p>
              <p className="text-sm text-gray-900">{booking.slot_start_time?.slice(0, 5)}</p>
            </div>
          </div>

          {booking.services && (
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center text-xs">🚿</div>
              <div>
                <p className="text-xs text-gray-400">Υπηρεσία</p>
                <p className="text-sm text-gray-900">{booking.services.name}</p>
              </div>
            </div>
          )}

          {booking.car_plate && (
            <div className="flex items-center gap-3">
              <Car size={16} className="text-gray-400" />
              <div>
                <p className="text-xs text-gray-400">Πινακίδα</p>
                <p className="text-sm text-gray-900">{booking.car_plate}</p>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <CreditCard size={16} className="text-gray-400" />
            <div>
              <p className="text-xs text-gray-400">Σύνολο</p>
              <p className="text-sm font-semibold text-gray-900">€{Number(booking.total_amount || 0).toFixed(0)}</p>
            </div>
          </div>
        </div>

        {/* Actions for active bookings */}
        {isActiveBooking && (
          <>
            {/* Reschedule — prominent */}
            <div className="px-5 pt-6">
              <button onClick={handleRescheduleClick}
                className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-700 text-sm font-medium py-3 rounded-xl">
                <CalendarClock size={14} />
                Αλλαγή ημερομηνίας
              </button>
            </div>

            {/* Cancel — discreet */}
            <div className="px-5 pt-6 pb-4 text-center">
              <button onClick={handleCancelClick}
                className="text-xs text-gray-400 underline">
                Ακύρωση κράτησης
              </button>
            </div>
          </>
        )}
      </div>

      {/* ============ MODALS ============ */}

      {/* Cancel too late */}
      {showCancelLate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCancelLate(false)} />
          <div className="relative bg-white rounded-t-3xl px-5 pt-6 pb-10 w-full max-w-md z-10">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertTriangle size={20} className="text-amber-500" />
              </div>
              <p className="text-base font-semibold text-gray-900 mb-2">
                Δεν είναι δυνατή η ακύρωση
              </p>
              <p className="text-sm text-gray-500 leading-relaxed">
                Δεν επιτρέπεται ακύρωση για κρατήσεις που ξεκινούν τις επόμενες <strong>2 ώρες</strong>.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-5">
              <p className="text-xs text-gray-500 leading-relaxed text-center">
                Για οποιοδήποτε άλλο θέμα, επικοινώνησε με το support στο{' '}
                <a href="mailto:support@washio.gr" className="text-gray-900 font-medium">support@washio.gr</a>
              </p>
            </div>

            <button onClick={() => setShowCancelLate(false)}
              className="w-full bg-gray-900 text-white text-sm font-medium py-3.5 rounded-xl">
              Κατάλαβα
            </button>
          </div>
        </div>
      )}

      {/* Reschedule too late */}
      {showRescheduleLate && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowRescheduleLate(false)} />
          <div className="relative bg-white rounded-t-3xl px-5 pt-6 pb-10 w-full max-w-md z-10">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

            <div className="text-center mb-5">
              <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertTriangle size={20} className="text-amber-500" />
              </div>
              <p className="text-base font-semibold text-gray-900 mb-2">
                Δεν είναι δυνατή η αλλαγή
              </p>
              <p className="text-sm text-gray-500 leading-relaxed">
                Δεν επιτρέπεται αλλαγή ημερομηνίας για κρατήσεις που ξεκινούν τις επόμενες <strong>2 ώρες</strong>.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-5">
              <p className="text-xs text-gray-500 leading-relaxed text-center">
                Για οποιοδήποτε άλλο θέμα, επικοινώνησε με το support στο{' '}
                <a href="mailto:support@washio.gr" className="text-gray-900 font-medium">support@washio.gr</a>
              </p>
            </div>

            <button onClick={() => setShowRescheduleLate(false)}
              className="w-full bg-gray-900 text-white text-sm font-medium py-3.5 rounded-xl">
              Κατάλαβα
            </button>
          </div>
        </div>
      )}

      {/* Reschedule modal */}
      {showReschedule && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !rescheduling && setShowReschedule(false)} />
          <div className="relative bg-white rounded-t-3xl px-5 pt-6 pb-10 w-full max-w-md z-10 max-h-[85vh] overflow-y-auto">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

            <p className="text-base font-semibold text-gray-900 mb-1">Αλλαγή ημερομηνίας</p>
            <p className="text-xs text-gray-400 mb-5">Επίλεξε νέα ημερομηνία και ώρα.</p>

            <div className="mb-4">
              <p className="text-xs text-gray-400 mb-1.5">Ημερομηνία</p>
              <input type="date"
                value={newDate}
                min={minDateStr}
                onChange={e => { setNewDate(e.target.value); setNewTime('') }}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none" />
            </div>

            <div className="mb-5">
              <p className="text-xs text-gray-400 mb-1.5">Διαθέσιμες ώρες</p>
              {slotsLoading ? (
                <p className="text-xs text-gray-400 py-4">Φόρτωση...</p>
              ) : availableSlots.length === 0 ? (
                <p className="text-xs text-gray-400 py-4">Δεν υπάρχουν διαθέσιμες ώρες αυτή τη μέρα.</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {availableSlots.map(slot => (
                    <button key={slot} onClick={() => setNewTime(slot)}
                      className={`py-2.5 rounded-lg text-xs font-medium border transition-all ${
                        newTime === slot
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-200 text-gray-700'
                      }`}>
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowReschedule(false)} disabled={rescheduling}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-3 rounded-xl">
                Άκυρο
              </button>
              <button onClick={handleConfirmReschedule}
                disabled={!newDate || !newTime || rescheduling}
                className="flex-1 bg-gray-900 text-white text-sm font-medium py-3 rounded-xl disabled:opacity-40">
                {rescheduling ? 'Αλλαγή...' : 'Αλλαγή'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel flow */}
      {showCancelFlow && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !cancelling && setShowCancelFlow(false)} />
          <div className="relative bg-white rounded-t-3xl px-5 pt-6 pb-10 w-full max-w-md z-10 max-h-[85vh] overflow-y-auto">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

            {/* Step 1: Reason */}
            {step === 1 && (
              <>
                <p className="text-base font-semibold text-gray-900 mb-1">Γιατί ακυρώνεις;</p>
                <p className="text-xs text-gray-400 mb-5">Η απάντησή σου μας βοηθάει να βελτιωθούμε.</p>

                <div className="divide-y divide-gray-100 mb-5">
                  {CANCELLATION_REASONS.map(r => (
                    <button key={r} onClick={() => setReason(r)}
                      className="w-full flex items-center justify-between py-3 text-left">
                      <span className={`text-sm transition-colors ${reason === r ? 'text-gray-900 font-medium' : 'text-gray-600'}`}>
                        {r}
                      </span>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                        reason === r ? 'bg-gray-900' : 'border border-gray-300'
                      }`}>
                        {reason === r && <div className="w-2 h-2 bg-white rounded-full" />}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="mb-5">
                  <p className="text-xs text-gray-400 mb-1.5">Σχόλια (προαιρετικό)</p>
                  <textarea
                    value={details}
                    onChange={e => setDetails(e.target.value)}
                    placeholder="Πες μας περισσότερα..."
                    rows={3}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-gray-400"
                  />
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setShowCancelFlow(false)}
                    className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-3 rounded-xl">
                    Πίσω
                  </button>
                  <button onClick={() => setStep(2)} disabled={!reason}
                    className="flex-1 bg-gray-900 text-white text-sm font-medium py-3 rounded-xl disabled:opacity-40">
                    Συνέχεια
                  </button>
                </div>
              </>
            )}

            {/* Step 2: Warning */}
            {step === 2 && (
              <>
                <div className="text-center mb-5">
                  <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <AlertTriangle size={20} className="text-amber-500" />
                  </div>
                  <p className="text-base font-semibold text-gray-900 mb-2">
                    Είσαι σίγουρος;
                  </p>
                </div>

                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-5">
                  <p className="text-xs text-amber-800 leading-relaxed">
                    <strong>Σημαντικό:</strong> Παρακολουθούμε τη συμπεριφορά ακυρώσεων. Συχνές ακυρώσεις μπορεί να οδηγήσουν σε:
                  </p>
                  <ul className="text-xs text-amber-800 mt-2 space-y-1 list-disc pl-4">
                    <li>Περιορισμό κρατήσεων στο σημείο</li>
                    <li>Προσωρινή αναστολή λογαριασμού</li>
                    <li>Μη επιστροφή χρημάτων σε επόμενες ακυρώσεις</li>
                  </ul>
                </div>

                <label className="flex items-start gap-3 mb-5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={e => setAcknowledged(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-gray-900"
                  />
                  <span className="text-xs text-gray-600 leading-relaxed">
                    Κατανοώ ότι οι συχνές ακυρώσεις μπορούν να επηρεάσουν τον λογαριασμό μου και αποδέχομαι τους όρους ακύρωσης.
                  </span>
                </label>

                <div className="flex gap-2">
                  <button onClick={() => setStep(1)}
                    className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-3 rounded-xl">
                    Πίσω
                  </button>
                  <button onClick={() => setStep(3)} disabled={!acknowledged}
                    className="flex-1 bg-red-500 text-white text-sm font-medium py-3 rounded-xl disabled:opacity-40">
                    Συνέχεια
                  </button>
                </div>
              </>
            )}

            {/* Step 3: Final */}
            {step === 3 && (
              <>
                <div className="text-center mb-5">
                  <p className="text-base font-semibold text-gray-900 mb-2">
                    Τελική επιβεβαίωση
                  </p>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    Πάτα <strong>Ναι, ακύρωσε</strong> για να ολοκληρωθεί η ακύρωση.
                  </p>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 mb-5 text-xs text-gray-600 leading-relaxed">
                  <p>• Η επιστροφή χρημάτων θα γίνει εντός <strong>5-7 εργάσιμων ημερών</strong></p>
                  <p className="mt-1">• Θα λάβεις email επιβεβαίωσης</p>
                  <p className="mt-1">• Η ενέργεια είναι μη αναστρέψιμη</p>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setStep(2)} disabled={cancelling}
                    className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-3 rounded-xl">
                    Όχι, κράτα την
                  </button>
                  <button onClick={handleConfirmCancel} disabled={cancelling}
                    className="flex-1 bg-red-500 text-white text-sm font-medium py-3 rounded-xl disabled:opacity-40">
                    {cancelling ? 'Ακύρωση...' : 'Ναι, ακύρωσε'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  )
}