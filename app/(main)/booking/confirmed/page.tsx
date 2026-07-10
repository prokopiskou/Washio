'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Check, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { successHaptic } from '@/lib/haptics'
import { track } from '@vercel/analytics'
import { track as trackEvent } from '@/lib/analytics'
import { useT } from '@/lib/i18n'

const T = {
  el: {
    confirmedTitle1: 'Η κράτησή σου', confirmedTitle2: 'επιβεβαιώθηκε',
    cashSub: 'Πληρωμή με μετρητά στο κατάστημα', emailSub: 'Στείλαμε email επιβεβαίωσης',
    passCaption: 'Επιβεβαίωση Κράτησης', refLabel: 'Κωδικός',
    washroom: 'Πλυντήριο', dateLabel: 'Ημ/νία', timeLabel: 'Ώρα',
    serviceLabel: 'Υπηρεσία', plateLabel: 'Πινακίδα',
    cashTotal: 'Μετρητά', total: 'Σύνολο',
    viewBookings: 'Δες τις κρατήσεις μου', backHome: 'Πίσω στην αρχική',
    bookAnother: 'Κάνε κράτηση για άλλη μέρα', loading: 'Φόρτωση...',
    showOnMap: 'Εμφάνιση στο χάρτη',
  },
  en: {
    confirmedTitle1: 'Your booking is', confirmedTitle2: 'confirmed',
    cashSub: 'Pay with cash at the store', emailSub: 'We sent a confirmation email',
    passCaption: 'Booking Confirmation', refLabel: 'Code',
    washroom: 'Car wash', dateLabel: 'Date', timeLabel: 'Time',
    serviceLabel: 'Service', plateLabel: 'Plate',
    cashTotal: 'Cash', total: 'Total',
    viewBookings: 'View my bookings', backHome: 'Back to home',
    bookAnother: 'Book for another day', loading: 'Loading...',
    showOnMap: 'Show on map',
  },
}

function QRPlaceholder({ size = 80 }: { size?: number }) {
  const cells = [
    1, 1, 1, 0, 1, 1, 1,
    1, 0, 1, 1, 0, 0, 1,
    1, 0, 1, 0, 1, 0, 1,
    0, 1, 0, 1, 1, 1, 0,
    1, 0, 1, 1, 0, 1, 1,
    1, 0, 0, 1, 1, 0, 1,
    1, 1, 1, 0, 1, 1, 1,
  ]
  return (
    <div
      className="bg-white rounded-[10px]"
      style={{
        width: size,
        height: size,
        padding: 6,
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: 2,
      }}
    >
      {cells.map((c, i) => (
        <div
          key={i}
          style={{
            background: c ? '#0A0A0A' : 'transparent',
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  )
}

function PassRow({ caption, value, mono }: { caption: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-[1.4px] text-white/45">
        {caption}
      </p>
      <p
        className="mt-0.5 text-[15px] font-semibold text-white"
        style={{
          fontFamily: mono ? 'ui-monospace, "SF Mono", monospace' : undefined,
          letterSpacing: mono ? '0.8px' : '-0.2px',
        }}
      >
        {value}
      </p>
    </div>
  )
}

function ConfirmedContent() {
  const router = useRouter()
  const t = useT(T)
  const params = useSearchParams()
  const [bookingRef, setBookingRef] = useState('')
  const [locationName, setLocationName] = useState('Washio')
  const [locationAddress, setLocationAddress] = useState('')
  const [locationCity, setLocationCity] = useState('')
  const [show, setShow] = useState(false)

  // Pull all booking details from query params
  const service = params.get('service') || ''
  const date = params.get('date') || ''
  const time = params.get('time') || ''
  const plate = params.get('plate') || ''
  const total = params.get('total') || ''
  const refParam = params.get('ref') || ''
  const isCash = params.get('method') === 'cash'

  useEffect(() => {
    setShow(true)
    successHaptic()
    track('booking_paid')

    const fetchAndNotify = async () => {
      const intentId = params.get('payment_intent')
      let ref = refParam || ('WS-' + Math.random().toString(36).substring(2, 8).toUpperCase())

      const applyLocation = (loc: any) => {
        if (!loc) return
        if (loc.name) setLocationName(loc.name)
        if (loc.address) setLocationAddress(loc.address)
        if (loc.city) setLocationCity(loc.city)
      }

      if (refParam) {
        setBookingRef(refParam)
        const supabase = createClient()
        const { data } = await supabase
          .from('bookings')
          .select('booking_ref, locations(name, address, city)')
          .eq('booking_ref', refParam)
          .single()

        if (data) applyLocation(data.locations as any)
      } else if (intentId) {
        const supabase = createClient()
        const { data } = await supabase
          .from('bookings')
          .select('booking_ref, locations(name, address, city)')
          .eq('stripe_payment_intent_id', intentId)
          .single()

        if (data?.booking_ref) {
          ref = data.booking_ref
          setBookingRef(data.booking_ref)
        }
        if (data) applyLocation(data.locations as any)
      }

      if (!bookingRef) setBookingRef(ref)
      // Purchase — client-side. eventId = booking_ref ώστε να γίνει dedup με το CAPI (webhook).
      trackEvent('Purchase', { value: parseFloat(total || '0'), currency: 'EUR' }, { eventId: ref })
      // Email is sent automatically by Stripe webhook
    }

    fetchAndNotify()
  }, [])

  const totalFormatted = total ? `€${parseFloat(total).toFixed(2)}` : '—'

  const mapsUrl = locationAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${locationAddress}, ${locationCity}`
      )}`
    : ''

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md min-h-screen flex flex-col pb-10">

        {/* Scrollable body */}
        <div className="flex-1 px-5 pt-20 pb-10">

          {/* Check badge */}
          <div className="flex justify-center mb-5">
            <div
              className="w-16 h-16 rounded-full bg-gray-900 flex items-center justify-center"
              style={{
                boxShadow: '0 8px 24px rgba(0,0,0,0.16)',
                transform: show ? 'scale(1)' : 'scale(0.4)',
                opacity: show ? 1 : 0,
                transition: 'transform 380ms cubic-bezier(.2,.9,.3,1.15), opacity 380ms ease',
              }}
            >
              <Check size={28} color="white" strokeWidth={2.6} />
            </div>
          </div>

          <h1 className="text-[24px] font-bold tracking-tight text-center text-gray-900 leading-[1.2]">
            {t.confirmedTitle1}<br />{t.confirmedTitle2}
          </h1>
          <p className="text-[14px] text-gray-500 text-center mt-2">
            {isCash ? t.cashSub : t.emailSub}
          </p>

          {/* Apple Wallet–style pass */}
          <div
            className="mt-8 bg-gray-900 text-white rounded-[20px] p-5 relative overflow-hidden"
            style={{
              boxShadow: '0 20px 40px rgba(0,0,0,0.18), 0 2px 4px rgba(0,0,0,0.08)',
            }}
          >
            {/* perforation notches */}
            <div className="absolute -left-2 top-1/2 w-4 h-4 rounded-full bg-white" />
            <div className="absolute -right-2 top-1/2 w-4 h-4 rounded-full bg-white" />

            {/* Top: brand + caption */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-[26px] h-[26px] rounded-lg bg-white flex items-center justify-center">
                  <div
                    className="w-2 h-2 bg-gray-900"
                    style={{
                      borderRadius: '50% 50% 50% 0',
                      transform: 'rotate(-45deg)',
                    }}
                  />
                </div>
                <span className="text-[14px] font-semibold tracking-tight text-white">Washio</span>
              </div>
              <p className="text-[10px] font-medium tracking-[1.4px] uppercase text-white/55">
                {t.passCaption}
              </p>
            </div>

            {/* Booking ref */}
            <p className="text-[11px] font-medium tracking-[1.4px] uppercase text-white/45 mt-6">
              {t.refLabel}
            </p>
            <p
              className="text-[28px] font-semibold mt-1 text-white"
              style={{
                fontFamily: 'ui-monospace, "SF Mono", monospace',
                letterSpacing: '1px',
              }}
            >
              {bookingRef || 'WS-—————'}
            </p>

            {/* Body — info rows + QR */}
            <div className="flex gap-[18px] items-start mt-6">
              <div className="flex-1 flex flex-col gap-3.5">
                <PassRow caption={t.washroom} value={locationName} />
                <div className="flex gap-6">
                  <PassRow caption={t.dateLabel} value={date || '—'} />
                  <PassRow caption={t.timeLabel} value={time || '—'} />
                </div>
                <PassRow caption={t.serviceLabel} value={service || '—'} />
                {plate && <PassRow caption={t.plateLabel} value={plate} mono />}
              </div>
              <QRPlaceholder />
            </div>

            {/* Dotted separator + total */}
            <div
              className="mt-6 pt-4 flex justify-between items-baseline"
              style={{ borderTop: '1.5px dashed rgba(255,255,255,0.18)' }}
            >
              <p className="text-[11px] font-medium tracking-[1.4px] uppercase text-white/55">
                {isCash ? t.cashTotal : t.total}
              </p>
              <p className="text-[24px] font-bold tracking-tight text-white">
                {totalFormatted}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2.5 mt-6">
            <button
              onClick={() => router.push('/profile/bookings')}
              className="w-full h-13 rounded-xl bg-gray-900 text-white text-[15px] font-semibold tracking-tight flex items-center justify-center"
              style={{ height: 52 }}
            >
              {t.viewBookings}
            </button>
            {mapsUrl && (
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full rounded-xl bg-white border border-gray-200 text-gray-900 text-[15px] font-semibold tracking-tight flex items-center justify-center gap-2"
                style={{ height: 52 }}
              >
                <MapPin size={18} />
                {t.showOnMap}
              </a>
            )}
            <button
              onClick={() => router.push('/')}
              className="w-full h-13 rounded-xl bg-white border border-gray-200 text-gray-900 text-[15px] font-semibold tracking-tight flex items-center justify-center"
              style={{ height: 52 }}
            >
              {t.backHome}
            </button>
            <button
              onClick={() => router.push('/map')}
              className="text-[13px] font-medium text-blue-600 mt-2"
            >
              {t.bookAnother}
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function ConfirmedPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-white flex items-center justify-center">
          <p className="text-xs text-gray-400">Φόρτωση...</p>
        </main>
      }
    >
      <ConfirmedContent />
    </Suspense>
  )
}