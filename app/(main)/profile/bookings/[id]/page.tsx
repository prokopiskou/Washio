'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronLeft, MapPin, Calendar, Clock, Car, CreditCard, AlertTriangle, X, ChevronRight, ExternalLink, CalendarClock, Droplet } from 'lucide-react'
import { useT, useLocale } from '@/lib/i18n'

const T = {
  el: {
    confirmed: 'Επερχόμενη', completed: 'Ολοκληρώθηκε', cancelled: 'Ακυρώθηκε', pending: 'Εκκρεμεί',
    loading: 'Φόρτωση...',
    notFound: 'Η κράτηση δεν βρέθηκε.', back: 'Επιστροφή',
    booking: 'Κράτηση', bookingRef: 'Κωδικός κράτησης', map: 'Χάρτης',
    date: 'Ημερομηνία', time: 'Ώρα', service: 'Υπηρεσία', plate: 'Πινακίδα', total: 'Σύνολο',
    changeDate: 'Αλλαγή ημερομηνίας', cancelBooking: 'Ακύρωση κράτησης',
    reason1: 'Άλλαξαν τα σχέδιά μου',
    reason2: 'Βρήκα φθηνότερη επιλογή',
    reason3: 'Δεν είμαι σίγουρος για την ώρα',
    reason4: 'Λάθος κράτηση',
    reason5: 'Άλλος λόγος',
    cancelNotPossible: 'Δεν είναι δυνατή η ακύρωση',
    cancelNotPossibleSub1: 'Δεν επιτρέπεται ακύρωση για κρατήσεις που ξεκινούν τις επόμενες ',
    hours2: '2 ώρες',
    cancelNotPossibleSub2: '.',
    supportNote1: 'Για οποιοδήποτε άλλο θέμα, επικοινώνησε με το support στο ',
    understood: 'Κατάλαβα',
    changeNotPossible: 'Δεν είναι δυνατή η αλλαγή',
    changeNotPossibleSub1: 'Δεν επιτρέπεται αλλαγή ημερομηνίας για κρατήσεις που ξεκινούν τις επόμενες ',
    reschedulePick: 'Επίλεξε νέα ημερομηνία και ώρα.',
    availableTimes: 'Διαθέσιμες ώρες',
    noSlots: 'Δεν υπάρχουν διαθέσιμες ώρες αυτή τη μέρα.',
    cancelBtn: 'Άκυρο', change: 'Αλλαγή', changing: 'Αλλαγή...',
    whyCancel: 'Γιατί ακυρώνεις;', whyCancelSub: 'Η απάντησή σου μας βοηθάει να βελτιωθούμε.',
    comments: 'Σχόλια (προαιρετικό)', tellMore: 'Πες μας περισσότερα...',
    backBtn: 'Πίσω', continue: 'Συνέχεια',
    sure: 'Είσαι σίγουρος;',
    importantLabel: 'Σημαντικό:',
    trackNote: ' Παρακολουθούμε τη συμπεριφορά ακυρώσεων. Συχνές ακυρώσεις μπορεί να οδηγήσουν σε:',
    consequence1: 'Περιορισμό κρατήσεων στο σημείο',
    consequence2: 'Προσωρινή αναστολή λογαριασμού',
    consequence3: 'Μη επιστροφή χρημάτων σε επόμενες ακυρώσεις',
    acknowledge: 'Κατανοώ ότι οι συχνές ακυρώσεις μπορούν να επηρεάσουν τον λογαριασμό μου και αποδέχομαι τους όρους ακύρωσης.',
    finalConfirm: 'Τελική επιβεβαίωση',
    finalConfirmSub1: 'Πάτα ', finalConfirmSub2: ' για να ολοκληρωθεί η ακύρωση.',
    refundNote1: '• Η επιστροφή χρημάτων θα γίνει εντός ', refundDays: '5-7 εργάσιμων ημερών',
    refundNote2: '• Θα λάβεις email επιβεβαίωσης',
    refundNote3: '• Η ενέργεια είναι μη αναστρέψιμη',
    keepIt: 'Όχι, κράτα την', yesCancel: 'Ναι, ακύρωσε', cancelling: 'Ακύρωση...',
  },
  en: {
    confirmed: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled', pending: 'Pending',
    loading: 'Loading...',
    notFound: 'Booking not found.', back: 'Back',
    booking: 'Booking', bookingRef: 'Booking reference', map: 'Map',
    date: 'Date', time: 'Time', service: 'Service', plate: 'Plate', total: 'Total',
    changeDate: 'Change date', cancelBooking: 'Cancel booking',
    reason1: 'My plans changed',
    reason2: 'I found a cheaper option',
    reason3: "I'm not sure about the time",
    reason4: 'Wrong booking',
    reason5: 'Other reason',
    cancelNotPossible: 'Cancellation not possible',
    cancelNotPossibleSub1: 'Cancellation is not allowed for bookings starting within the next ',
    hours2: '2 hours',
    cancelNotPossibleSub2: '.',
    supportNote1: 'For any other issue, contact support at ',
    understood: 'Got it',
    changeNotPossible: 'Change not possible',
    changeNotPossibleSub1: 'Date changes are not allowed for bookings starting within the next ',
    reschedulePick: 'Pick a new date and time.',
    availableTimes: 'Available times',
    noSlots: 'No available times on this day.',
    cancelBtn: 'Cancel', change: 'Change', changing: 'Changing...',
    whyCancel: 'Why are you cancelling?', whyCancelSub: 'Your answer helps us improve.',
    comments: 'Comments (optional)', tellMore: 'Tell us more...',
    backBtn: 'Back', continue: 'Continue',
    sure: 'Are you sure?',
    importantLabel: 'Important:',
    trackNote: ' We monitor cancellation behavior. Frequent cancellations may lead to:',
    consequence1: 'Booking restrictions at this location',
    consequence2: 'Temporary account suspension',
    consequence3: 'No refunds on future cancellations',
    acknowledge: 'I understand that frequent cancellations can affect my account and I accept the cancellation terms.',
    finalConfirm: 'Final confirmation',
    finalConfirmSub1: 'Press ', finalConfirmSub2: ' to complete the cancellation.',
    refundNote1: '• The refund will be issued within ', refundDays: '5-7 business days',
    refundNote2: '• You will receive a confirmation email',
    refundNote3: '• This action is irreversible',
    keepIt: 'No, keep it', yesCancel: 'Yes, cancel', cancelling: 'Cancelling...',
  },
}

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

function StatusPill({ status }: { status: string }) {
  const t = useT(T)
  const config = {
    confirmed: { bg: '#EAF2FD', fg: '#1A6FD4', label: t.confirmed },
    completed: { bg: '#E7F6EF', fg: '#0F7A5C', label: t.completed },
    cancelled: { bg: '#FCEAEA', fg: '#B43C3C', label: t.cancelled },
    pending: { bg: '#F7F7F7', fg: '#666666', label: t.pending },
  }[status] || { bg: '#F7F7F7', fg: '#666666', label: status }

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold tracking-tight"
      style={{ background: config.bg, color: config.fg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: config.fg }} />
      {config.label}
    </span>
  )
}

function InfoRow({
  icon,
  label,
  value,
  mono,
  isLast,
}: {
  icon: React.ReactNode
  label: string
  value: string
  mono?: boolean
  isLast?: boolean
}) {
  return (
    <div className={`flex items-center gap-3.5 py-4 ${isLast ? '' : 'border-b border-gray-100'}`}>
      <div className="w-6 flex items-center text-gray-500">{icon}</div>
      <p className="flex-1 text-[13px] text-gray-500">{label}</p>
      <p
        className="text-[14px] font-semibold text-gray-900"
        style={{
          fontFamily: mono ? 'ui-monospace, "SF Mono", monospace' : undefined,
          letterSpacing: mono ? '0.6px' : '-0.1px',
        }}
      >
        {value}
      </p>
    </div>
  )
}

export default function BookingDetailPage() {
  const router = useRouter()
  const params = useParams()
  const bookingId = params.id as string
  const t = useT(T)
  const { locale } = useLocale()
  const CANCELLATION_REASONS = [t.reason1, t.reason2, t.reason3, t.reason4, t.reason5]

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
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const yyyy = tomorrow.getFullYear()
      const mm = String(tomorrow.getMonth() + 1).padStart(2, '0')
      const dd = String(tomorrow.getDate()).padStart(2, '0')
      setNewDate(`${yyyy}-${mm}-${dd}`)
    }
  }

  useEffect(() => {
    if (!showReschedule || !newDate || !booking) return

    const loadSlots = async () => {
      setSlotsLoading(true)
      const supabase = createClient()
      const dateObj = new Date(newDate)
      const dayOfWeek = jsDayToSupabase(dateObj.getDay())

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

      const { data: bookedData } = await supabase
        .from('bookings')
        .select('slot_start_time')
        .eq('location_id', booking.location_id)
        .eq('slot_date', newDate)
        .not('status', 'in', '("cancelled")')
        .neq('id', booking.id)

      const booked = new Set((bookedData || []).map((b: any) => b.slot_start_time?.slice(0, 5)))

      const now = new Date()
      const todayLocalStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const isToday = newDate === todayLocalStr

      const available = allTimes.filter(t => {
        if (booked.has(t)) return false
        if (isToday) {
          const [h, m] = t.split(':').map(Number)
          const slotMinutes = h * 60 + m
          const nowMinutes = now.getHours() * 60 + now.getMinutes()
          if (slotMinutes < nowMinutes + 120) return false
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
        <p className="text-xs text-gray-400">{t.loading}</p>
      </main>
    )
  }

  if (!booking) {
    return (
      <main className="min-h-screen bg-white flex flex-col items-center justify-center px-5">
        <p className="text-sm text-gray-500">{t.notFound}</p>
        <button onClick={() => router.push('/profile/bookings')} className="mt-4 text-sm text-blue-500">
          {t.back}
        </button>
      </main>
    )
  }

  const date = new Date(booking.slot_date)
  const formattedDate = date.toLocaleDateString(locale === 'en' ? 'en-GB' : 'el-GR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Athens',
  })

  const mapsUrl = booking.locations
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${booking.locations.address}, ${booking.locations.city}`)}`
    : '#'

  const isActiveBooking = booking.status !== 'cancelled' && booking.status !== 'completed'

  const today = new Date()
  const minDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md pb-24">

        {/* Header */}
        <div className="px-5 pt-14 pb-5 flex items-center gap-3.5">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-900"
          >
            <ChevronLeft size={18} />
          </button>
          <p className="flex-1 text-center text-[17px] font-semibold tracking-tight text-gray-900 -ml-10">
            {t.booking}
          </p>
        </div>

        <div className="px-5">

          {/* Booking ref + status */}
          <div className="text-center pt-3 pb-7">
            <p className="text-[11px] font-semibold tracking-[1.8px] uppercase text-gray-400">
              {t.bookingRef}
            </p>
            <p
              className="text-[28px] font-bold text-gray-900 mt-2"
              style={{
                fontFamily: 'ui-monospace, "SF Mono", monospace',
                letterSpacing: '1.2px',
              }}
            >
              {booking.booking_ref}
            </p>
            <div className="flex justify-center mt-2.5">
              <StatusPill status={booking.status} />
            </div>
          </div>

          {/* Location card — tappable */}
          {booking.locations && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3.5 mb-3.5"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
            >
              <div className="w-11 h-11 rounded-xl bg-gray-50 flex items-center justify-center text-gray-900 shrink-0">
                <MapPin size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold tracking-tight text-gray-900 truncate">
                  {booking.locations.name}
                </p>
                <p className="text-[12px] text-gray-500 mt-0.5 truncate">
                  {booking.locations.address}, {booking.locations.city}
                </p>
              </div>
              <div
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold shrink-0"
                style={{ background: '#EAF2FD', color: '#1A6FD4' }}
              >
                {t.map}
                <ExternalLink size={11} strokeWidth={1.8} />
              </div>
            </a>
          )}

          {/* Details card */}
          <div
            className="bg-white rounded-2xl border border-gray-100 px-[18px] mb-6"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
          >
            <InfoRow
              icon={<Calendar size={18} strokeWidth={1.75} />}
              label={t.date}
              value={formattedDate}
            />
            <InfoRow
              icon={<Clock size={18} strokeWidth={1.75} />}
              label={t.time}
              value={booking.slot_start_time?.slice(0, 5) || '—'}
            />
            {booking.services && (
              <InfoRow
                icon={<Droplet size={18} strokeWidth={1.75} />}
                label={t.service}
                value={booking.services.name}
              />
            )}
            {booking.car_plate && (
              <InfoRow
                icon={<Car size={18} strokeWidth={1.75} />}
                label={t.plate}
                value={booking.car_plate}
                mono
              />
            )}
            <InfoRow
              icon={<CreditCard size={18} strokeWidth={1.75} />}
              label={t.total}
              value={`€${Number(booking.total_amount || 0).toFixed(2)}`}
              isLast
            />
          </div>

          {/* Actions */}
          {isActiveBooking && (
            <>
              <button
                onClick={handleRescheduleClick}
                className="w-full h-13 rounded-xl bg-white border border-gray-900 text-gray-900 text-[15px] font-semibold tracking-tight flex items-center justify-center gap-2"
                style={{ height: 52 }}
              >
                <CalendarClock size={18} strokeWidth={1.6} />
                {t.changeDate}
              </button>

              <div className="flex justify-center pt-4 pb-10">
                <button
                  onClick={handleCancelClick}
                  className="text-[12px] font-medium text-gray-400 underline underline-offset-[3px]"
                >
                  {t.cancelBooking}
                </button>
              </div>
            </>
          )}
        </div>
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
                {t.cancelNotPossible}
              </p>
              <p className="text-sm text-gray-500 leading-relaxed">
                {t.cancelNotPossibleSub1}<strong>{t.hours2}</strong>{t.cancelNotPossibleSub2}
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-5">
              <p className="text-xs text-gray-500 leading-relaxed text-center">
                {t.supportNote1}
                <a href="mailto:support@washio.gr" className="text-gray-900 font-medium">support@washio.gr</a>
              </p>
            </div>

            <button
              onClick={() => setShowCancelLate(false)}
              className="w-full bg-gray-900 text-white text-sm font-medium py-3.5 rounded-xl"
            >
              {t.understood}
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
                {t.changeNotPossible}
              </p>
              <p className="text-sm text-gray-500 leading-relaxed">
                {t.changeNotPossibleSub1}<strong>{t.hours2}</strong>{t.cancelNotPossibleSub2}
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-5">
              <p className="text-xs text-gray-500 leading-relaxed text-center">
                {t.supportNote1}
                <a href="mailto:support@washio.gr" className="text-gray-900 font-medium">support@washio.gr</a>
              </p>
            </div>

            <button
              onClick={() => setShowRescheduleLate(false)}
              className="w-full bg-gray-900 text-white text-sm font-medium py-3.5 rounded-xl"
            >
              {t.understood}
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

            <p className="text-base font-semibold text-gray-900 mb-1">{t.changeDate}</p>
            <p className="text-xs text-gray-400 mb-5">{t.reschedulePick}</p>

            <div className="mb-4">
              <p className="text-xs text-gray-400 mb-1.5">{t.date}</p>
              <input
                type="date"
                value={newDate}
                min={minDateStr}
                onChange={e => { setNewDate(e.target.value); setNewTime('') }}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none"
              />
            </div>

            <div className="mb-5">
              <p className="text-xs text-gray-400 mb-1.5">{t.availableTimes}</p>
              {slotsLoading ? (
                <p className="text-xs text-gray-400 py-4">{t.loading}</p>
              ) : availableSlots.length === 0 ? (
                <p className="text-xs text-gray-400 py-4">{t.noSlots}</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {availableSlots.map(slot => (
                    <button
                      key={slot}
                      onClick={() => setNewTime(slot)}
                      className={`py-2.5 rounded-lg text-xs font-medium border transition-all ${
                        newTime === slot
                          ? 'border-gray-900 bg-gray-900 text-white'
                          : 'border-gray-200 text-gray-700'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowReschedule(false)}
                disabled={rescheduling}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-3 rounded-xl"
              >
                {t.cancelBtn}
              </button>
              <button
                onClick={handleConfirmReschedule}
                disabled={!newDate || !newTime || rescheduling}
                className="flex-1 bg-gray-900 text-white text-sm font-medium py-3 rounded-xl disabled:opacity-40"
              >
                {rescheduling ? t.changing : t.change}
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

            {step === 1 && (
              <>
                <p className="text-base font-semibold text-gray-900 mb-1">{t.whyCancel}</p>
                <p className="text-xs text-gray-400 mb-5">{t.whyCancelSub}</p>

                <div className="divide-y divide-gray-100 mb-5">
                  {CANCELLATION_REASONS.map(r => (
                    <button
                      key={r}
                      onClick={() => setReason(r)}
                      className="w-full flex items-center justify-between py-3 text-left"
                    >
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
                  <p className="text-xs text-gray-400 mb-1.5">{t.comments}</p>
                  <textarea
                    value={details}
                    onChange={e => setDetails(e.target.value)}
                    placeholder={t.tellMore}
                    rows={3}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-gray-400"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCancelFlow(false)}
                    className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-3 rounded-xl"
                  >
                    {t.backBtn}
                  </button>
                  <button
                    onClick={() => setStep(2)}
                    disabled={!reason}
                    className="flex-1 bg-gray-900 text-white text-sm font-medium py-3 rounded-xl disabled:opacity-40"
                  >
                    {t.continue}
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="text-center mb-5">
                  <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <AlertTriangle size={20} className="text-amber-500" />
                  </div>
                  <p className="text-base font-semibold text-gray-900 mb-2">
                    {t.sure}
                  </p>
                </div>

                <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-5">
                  <p className="text-xs text-amber-800 leading-relaxed">
                    <strong>{t.importantLabel}</strong>{t.trackNote}
                  </p>
                  <ul className="text-xs text-amber-800 mt-2 space-y-1 list-disc pl-4">
                    <li>{t.consequence1}</li>
                    <li>{t.consequence2}</li>
                    <li>{t.consequence3}</li>
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
                    {t.acknowledge}
                  </span>
                </label>

                <div className="flex gap-2">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-3 rounded-xl"
                  >
                    {t.backBtn}
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={!acknowledged}
                    className="flex-1 bg-red-500 text-white text-sm font-medium py-3 rounded-xl disabled:opacity-40"
                  >
                    {t.continue}
                  </button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <div className="text-center mb-5">
                  <p className="text-base font-semibold text-gray-900 mb-2">
                    {t.finalConfirm}
                  </p>
                  <p className="text-sm text-gray-500 leading-relaxed">
                    {t.finalConfirmSub1}<strong>{t.yesCancel}</strong>{t.finalConfirmSub2}
                  </p>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 mb-5 text-xs text-gray-600 leading-relaxed">
                  <p>{t.refundNote1}<strong>{t.refundDays}</strong></p>
                  <p className="mt-1">{t.refundNote2}</p>
                  <p className="mt-1">{t.refundNote3}</p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setStep(2)}
                    disabled={cancelling}
                    className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-3 rounded-xl"
                  >
                    {t.keepIt}
                  </button>
                  <button
                    onClick={handleConfirmCancel}
                    disabled={cancelling}
                    className="flex-1 bg-red-500 text-white text-sm font-medium py-3 rounded-xl disabled:opacity-40"
                  >
                    {cancelling ? t.cancelling : t.yesCancel}
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