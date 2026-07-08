'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Inbox } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useT, useLocale, Locale } from '@/lib/i18n'

const T = {
  el: {
    confirmed: 'Επερχόμενη', completed: 'Ολοκληρώθηκε', cancelled: 'Ακυρώθηκε', pending: 'Εκκρεμεί',
    station: 'Πρατήριο',
    myBookings: 'Οι κρατήσεις μου',
    all: 'Όλες', upcoming: 'Επερχόμενες', completedTab: 'Ολοκληρωμένες', cancelledTab: 'Ακυρωμένες',
    loading: 'Φόρτωση...',
    emptyAll: 'Δεν υπάρχουν κρατήσεις',
    emptyUpcoming: 'Δεν υπάρχουν επερχόμενες',
    emptyCompleted: 'Δεν υπάρχουν ολοκληρωμένες',
    emptyCancelled: 'Δεν υπάρχουν ακυρωμένες',
    emptyAllSub: 'Όταν κάνεις την πρώτη σου κράτηση, θα εμφανιστεί εδώ.',
    emptyOtherSub: 'Δεν υπάρχουν κρατήσεις σε αυτή τη κατηγορία.',
    findWash: 'Βρες πλυντήριο',
  },
  en: {
    confirmed: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled', pending: 'Pending',
    station: 'Station',
    myBookings: 'My bookings',
    all: 'All', upcoming: 'Upcoming', completedTab: 'Completed', cancelledTab: 'Cancelled',
    loading: 'Loading...',
    emptyAll: 'No bookings',
    emptyUpcoming: 'No upcoming bookings',
    emptyCompleted: 'No completed bookings',
    emptyCancelled: 'No cancelled bookings',
    emptyAllSub: 'When you make your first booking, it will appear here.',
    emptyOtherSub: 'There are no bookings in this category.',
    findWash: 'Find a car wash',
  },
}

const MONTHS_SHORT: Record<Locale, string[]> = {
  el: ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}

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

type FilterKey = 'all' | 'upcoming' | 'completed' | 'cancelled'

const formatDate = (dateStr: string, locale: Locale) => {
  const d = new Date(dateStr)
  return `${d.getDate()} ${MONTHS_SHORT[locale][d.getMonth()]}`
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
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold tracking-tight shrink-0"
      style={{ background: config.bg, color: config.fg }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: config.fg }} />
      {config.label}
    </span>
  )
}

function FilterChip({
  children,
  active,
  count,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  count: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3.5 py-2 rounded-full border whitespace-nowrap text-[13px] font-semibold tracking-tight inline-flex items-center gap-1.5 transition-colors ${
        active
          ? 'bg-gray-900 text-white border-gray-900'
          : 'bg-white text-gray-500 border-gray-200'
      }`}
    >
      {children}
      <span
        className={`px-1.5 rounded-full text-[11px] font-semibold ${
          active ? 'bg-white/20 text-white' : 'bg-gray-50 text-gray-500'
        }`}
      >
        {count}
      </span>
    </button>
  )
}

function BookingCard({
  booking,
  onClick,
}: {
  booking: UserBooking
  onClick: () => void
}) {
  const t = useT(T)
  const { locale } = useLocale()
  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-2xl border border-gray-100 p-4 text-left flex flex-col gap-2.5"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
    >
      <div className="flex justify-between items-start gap-2.5">
        <p className="text-[15px] font-semibold tracking-tight text-gray-900 truncate flex-1">
          {(booking.locations as any)?.name || t.station}
        </p>
        <StatusPill status={booking.status} />
      </div>
      <p className="text-[12px] text-gray-500 truncate">
        {(booking.services as any)?.name} · {formatDate(booking.slot_date, locale)} · {booking.slot_start_time?.slice(0, 5)}
      </p>
      <div className="h-px bg-gray-100 my-0.5" />
      <div className="flex justify-between items-center">
        <p
          className="text-[11px] font-medium text-gray-400"
          style={{
            fontFamily: 'ui-monospace, "SF Mono", monospace',
            letterSpacing: '0.6px',
          }}
        >
          {booking.booking_ref}
        </p>
        <p className="text-[15px] font-bold tracking-tight text-gray-900">
          €{Number(booking.total_amount || 0).toFixed(2)}
        </p>
      </div>
    </button>
  )
}

export default function ProfileBookingsPage() {
  const router = useRouter()
  const t = useT(T)
  const [loading, setLoading] = useState(true)
  const [bookings, setBookings] = useState<UserBooking[]>([])
  const [filter, setFilter] = useState<FilterKey>('all')

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

  const counts = useMemo(() => ({
    all: bookings.length,
    upcoming: bookings.filter(b => b.status === 'confirmed' || b.status === 'pending').length,
    completed: bookings.filter(b => b.status === 'completed').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length,
  }), [bookings])

  const filtered = useMemo(() => {
    if (filter === 'all') return bookings
    if (filter === 'upcoming') return bookings.filter(b => b.status === 'confirmed' || b.status === 'pending')
    if (filter === 'completed') return bookings.filter(b => b.status === 'completed')
    if (filter === 'cancelled') return bookings.filter(b => b.status === 'cancelled')
    return bookings
  }, [bookings, filter])

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center">
      <div className="w-full max-w-md pb-10">

        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-gray-50 pt-14 pb-3.5 px-5">
          <div className="flex items-center gap-3.5 mb-4">
            <button
              onClick={() => router.push('/profile')}
              className="w-10 h-10 rounded-full bg-white border border-gray-100 flex items-center justify-center text-gray-900"
            >
              <ChevronLeft size={18} />
            </button>
            <h1 className="text-[20px] font-bold tracking-tight text-gray-900">
              {t.myBookings}
            </h1>
          </div>

          {/* Filter chips */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-5 px-5 pb-1">
            <FilterChip active={filter === 'all'} count={counts.all} onClick={() => setFilter('all')}>
              {t.all}
            </FilterChip>
            <FilterChip active={filter === 'upcoming'} count={counts.upcoming} onClick={() => setFilter('upcoming')}>
              {t.upcoming}
            </FilterChip>
            <FilterChip active={filter === 'completed'} count={counts.completed} onClick={() => setFilter('completed')}>
              {t.completedTab}
            </FilterChip>
            <FilterChip active={filter === 'cancelled'} count={counts.cancelled} onClick={() => setFilter('cancelled')}>
              {t.cancelledTab}
            </FilterChip>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="px-5 py-8">
            <p className="text-xs text-gray-400">{t.loading}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center text-center px-10 pt-24">
            <div
              className="w-16 h-16 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-gray-400 mb-4"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
            >
              <Inbox size={28} strokeWidth={1.5} />
            </div>
            <p className="text-[17px] font-semibold tracking-tight text-gray-900">
              {filter === 'all' && t.emptyAll}
              {filter === 'upcoming' && t.emptyUpcoming}
              {filter === 'completed' && t.emptyCompleted}
              {filter === 'cancelled' && t.emptyCancelled}
            </p>
            <p className="text-[13px] text-gray-500 mt-1.5 max-w-[260px]">
              {filter === 'all' && t.emptyAllSub}
              {filter !== 'all' && t.emptyOtherSub}
            </p>
            {filter === 'all' && (
              <button
                onClick={() => router.push('/map')}
                className="mt-6 px-5 py-3 rounded-xl bg-gray-900 text-white text-[14px] font-semibold tracking-tight"
              >
                {t.findWash}
              </button>
            )}
          </div>
        ) : (
          <div className="px-5 pt-2 flex flex-col gap-2.5">
            {filtered.map(booking => (
              <BookingCard
                key={booking.id}
                booking={booking}
                onClick={() => router.push(`/profile/bookings/${booking.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}