'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft, Star, MapPin, Clock, Check, ChevronLeft, ChevronRight, Heart } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type Location = {
  id: string
  name: string
  address: string
  city: string
}

type Service = {
  id: string
  name: string
  description: string
  price: number
  duration_minutes: number
}

type Slot = {
  id: string
  time: string
  available: boolean
}

const DAYS_JS = ['Κυ', 'Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα']
const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος']
const MONTHS_SHORT = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']

// day_of_week: 1=Δε, 2=Τρ, ..., 7=Κυ (Supabase convention)
// JS getDay(): 0=Κυ, 1=Δε, ..., 6=Σα
function jsDayToSupabase(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay
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

function getDatesForMonth(year: number, month: number) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dates = []
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    if (date >= today) dates.push(date)
  }
  return dates
}

export default function LocationPage() {
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [location, setLocation] = useState<Location | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [isFavorite, setIsFavorite] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [favoriteId, setFavoriteId] = useState<string | null>(null)
  const [locationHours, setLocationHours] = useState<any[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)

  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [selectedDate, setSelectedDate] = useState(today)
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()

      const { data: sessionData } = await supabase.auth.getSession()
      const uid = sessionData.session?.user?.id || null
      setUserId(uid)

      const { data: locationData } = await supabase
        .from('locations')
        .select('id, name, address, city')
        .eq('slug', slug)
        .single()

      if (!locationData) {
        router.push('/')
        return
      }

      setLocation(locationData)

      const [servicesRes, hoursRes] = await Promise.all([
        supabase
          .from('services')
          .select('id, name, description, price, duration_minutes')
          .eq('location_id', locationData.id)
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('location_hours')
          .select('day_of_week, is_open, open_time, close_time')
          .eq('location_id', locationData.id),
      ])

      setServices(servicesRes.data || [])
      setLocationHours(hoursRes.data || [])

      if (uid) {
        const { data: favData } = await supabase
          .from('favorites')
          .select('id')
          .eq('user_id', uid)
          .eq('location_id', locationData.id)
          .single()

        if (favData) {
          setIsFavorite(true)
          setFavoriteId(favData.id)
        }
      }

      setLoading(false)
    }

    loadData()
  }, [slug])

  const loadSlots = useCallback(async (date: Date, locationId: string) => {
    setSlotsLoading(true)
    const supabase = createClient()

    const dayOfWeek = jsDayToSupabase(date.getDay())
    const dayHours = locationHours.find(h => h.day_of_week === dayOfWeek)

    if (!dayHours || !dayHours.is_open) {
      setSlots([])
      setSlotsLoading(false)
      return
    }

    const allTimes = generateSlots(dayHours.open_time, dayHours.close_time)
    const dateStr = date.toISOString().split('T')[0]

    // Παίρνουμε τις ήδη κρατημένες ώρες
    const { data: bookedData } = await supabase
      .from('bookings')
      .select('slot_start_time')
      .eq('location_id', locationId)
      .eq('slot_date', dateStr)
      .not('status', 'in', '("cancelled")')

    const bookedTimes = new Set((bookedData || []).map((b: any) => b.slot_start_time?.slice(0, 5)))

    // Αν είναι σήμερα, εξαιρούμε τα περασμένα slots
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    setSlots(allTimes.map(time => {
      const [h, m] = time.split(':').map(Number)
      const isPast = isToday && (h < now.getHours() || (h === now.getHours() && m <= now.getMinutes()))
      return {
        id: time,
        time,
        available: !bookedTimes.has(time) && !isPast,
      }
    }))

    setSlotsLoading(false)
  }, [locationHours])

  useEffect(() => {
    if (location && locationHours.length > 0) {
      loadSlots(selectedDate, location.id)
      setSelectedSlot(null)
    }
  }, [selectedDate, location, locationHours])

  const toggleFavorite = async () => {
    if (!userId || !location) return
    const supabase = createClient()

    if (isFavorite && favoriteId) {
      await supabase.from('favorites').delete().eq('id', favoriteId)
      setIsFavorite(false)
      setFavoriteId(null)
    } else {
      const { data } = await supabase
        .from('favorites')
        .insert({ user_id: userId, location_id: location.id })
        .select('id')
        .single()
      if (data) {
        setIsFavorite(true)
        setFavoriteId(data.id)
      }
    }
  }

  const dates = getDatesForMonth(viewYear, viewMonth)
  const service = services.find(s => s.id === selectedServiceId)
  const canBook = selectedServiceId && selectedSlot

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const prevMonth = () => {
    const now = new Date()
    if (viewMonth === now.getMonth() && viewYear === now.getFullYear()) return
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }

  const isToday = (d: Date) => d.toDateString() === today.toDateString()
  const isSelected = (d: Date) => d.toDateString() === selectedDate.toDateString()
  const isPast = viewMonth === today.getMonth() && viewYear === today.getFullYear()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xs text-gray-400">Φόρτωση...</p>
      </div>
    )
  }

  if (!location) return null

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md pb-32">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-gray-400 p-2 -ml-2">
              <ArrowLeft size={18} />
            </button>
            <span className="text-sm font-medium text-gray-900">{location.name}</span>
          </div>
          {userId && (
            <button onClick={toggleFavorite} className="p-2">
              <Heart size={18} className={isFavorite ? 'text-red-500 fill-red-500' : 'text-gray-300'} />
            </button>
          )}
        </div>

        {/* Cover */}
        <div className="w-full h-28 bg-gray-100 flex items-center justify-center text-4xl">⛽</div>

        {/* Info */}
        <section className="px-5 py-3 border-b border-gray-100">
          <div className="flex items-start justify-between mb-1">
            <h1 className="text-sm font-semibold text-gray-900">{location.name}</h1>
            <div className="flex items-center gap-1">
              <Star size={11} className="text-amber-400 fill-amber-400" />
              <span className="text-xs font-medium text-gray-700">Νέο</span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <MapPin size={10} />
            <span>{location.address}, {location.city}</span>
          </div>
        </section>

        {/* Services */}
        <section className="px-5 py-4 border-b border-gray-100">
          <p className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-3">Υπηρεσία</p>
          <div className="flex flex-col gap-2">
            {services.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedServiceId(s.id)}
                className={`flex items-center justify-between px-4 py-4 rounded-xl border text-left transition-all min-h-[64px] ${
                  selectedServiceId === s.id ? 'border-gray-900 bg-gray-900' : 'border-gray-100 bg-white'
                }`}
              >
                <div>
                  <p className={`text-sm font-medium ${selectedServiceId === s.id ? 'text-white' : 'text-gray-900'}`}>
                    {s.name}
                  </p>
                  {s.description && (
                    <p className="text-xs mt-0.5 text-gray-400">{s.description}</p>
                  )}
                  <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
                    <Clock size={10} />
                    {s.duration_minutes} λεπτά
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className={`text-sm font-semibold ${selectedServiceId === s.id ? 'text-white' : 'text-gray-900'}`}>
                    €{s.price}
                  </p>
                  {selectedServiceId === s.id && (
                    <Check size={14} className="text-white mt-1 ml-auto" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Date picker */}
        <section className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium tracking-widest text-gray-400 uppercase">Ημερομηνία</p>
            <div className="flex items-center gap-2">
              <button onClick={prevMonth} disabled={isPast}
                className={`p-2 rounded-lg ${isPast ? 'text-gray-200' : 'text-gray-400'}`}>
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs font-medium text-gray-700 min-w-[80px] text-center">
                {MONTHS[viewMonth]}
              </span>
              <button onClick={nextMonth} className="p-2 rounded-lg text-gray-400">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
            {dates.map((d, i) => (
              <button
                key={i}
                onClick={() => { setSelectedDate(d); setSelectedSlot(null) }}
                className={`flex flex-col items-center min-w-[48px] py-3 px-1 rounded-xl border transition-all shrink-0 ${
                  isSelected(d) ? 'bg-gray-900 border-gray-900' : 'bg-white border-gray-100'
                }`}
              >
                <span className="text-xs text-gray-400">{DAYS_JS[d.getDay()]}</span>
                <span className={`text-xs font-semibold mt-0.5 ${isSelected(d) ? 'text-white' : 'text-gray-900'}`}>
                  {d.getDate()}
                </span>
                {isToday(d) && (
                  <span className={`w-1 h-1 rounded-full mt-1 ${isSelected(d) ? 'bg-gray-500' : 'bg-blue-500'}`} />
                )}
              </button>
            ))}
          </div>
        </section>

        {/* Time slots */}
        <section className="px-5 py-4">
          <p className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-3">
            Ώρα · {selectedDate.getDate()} {MONTHS_SHORT[selectedDate.getMonth()]}
          </p>
          {slotsLoading ? (
            <p className="text-xs text-gray-400">Φόρτωση ωρών...</p>
          ) : slots.length === 0 ? (
            <p className="text-xs text-gray-400">Δεν υπάρχουν διαθέσιμα slots για αυτή την ημέρα.</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {slots.map(slot => (
                <button
                  key={slot.id}
                  disabled={!slot.available}
                  onClick={() => setSelectedSlot(slot.id)}
                  className={`py-3.5 rounded-xl text-xs font-medium border transition-all ${
                    !slot.available
                      ? 'border-gray-100 text-gray-300 bg-gray-50 cursor-not-allowed'
                      : selectedSlot === slot.id
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-200 text-gray-700 bg-white'
                  }`}
                >
                  {slot.time}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Bottom CTA */}
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md px-5 py-4 bg-white border-t border-gray-100">
          {canBook ? (
            <button
              onClick={() => router.push(`/booking?location=${location.id}&service=${selectedServiceId}&slot=${encodeURIComponent(selectedSlot!)}&date=${selectedDate.toISOString().split('T')[0]}`)}
              className="w-full bg-gray-900 text-white text-sm font-medium py-4 rounded-xl"
            >
              Κράτηση — €{service?.price} · {selectedDate.getDate()} {MONTHS_SHORT[selectedDate.getMonth()]}
            </button>
          ) : (
            <div className="w-full bg-gray-100 text-gray-400 text-sm font-medium py-4 rounded-xl flex items-center justify-center">
              Επίλεξε υπηρεσία, ημερομηνία και ώρα
            </div>
          )}
        </div>

      </div>
    </main>
  )
}