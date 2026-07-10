'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Star, MapPin, Heart, Check, Car, Bike } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { track } from '@vercel/analytics'
import { athensToday, athensMinutesOfDay } from '@/lib/time'
import { lightTap, selectionHaptic } from '@/lib/haptics'
import { useT, useLocale, Locale } from '@/lib/i18n'

const T = {
  el: {
    loading: 'Φόρτωση...',
    newBadge: 'Νέο',
    vehicle: 'Όχημα',
    car: 'ΙΧ',
    moto: 'Μοτο',
    service: 'Υπηρεσία',
    date: 'Ημερομηνία',
    time: 'Ώρα',
    loadingHours: 'Φόρτωση ωρών...',
    noSlots: 'Δεν υπάρχουν διαθέσιμα slots για αυτή την ημέρα.',
    book: 'Κράτηση',
    selectPrompt: 'Επίλεξε υπηρεσία, ημερομηνία και ώρα',
  },
  en: {
    loading: 'Loading...',
    newBadge: 'New',
    vehicle: 'Vehicle',
    car: 'Car',
    moto: 'Moto',
    service: 'Service',
    date: 'Date',
    time: 'Time',
    loadingHours: 'Loading times...',
    noSlots: 'No available slots for this day.',
    book: 'Book',
    selectPrompt: 'Choose a service, date and time',
  },
}

const DAYS_JS_L: Record<Locale, string[]> = {
  el: ['Κυρ', 'Δευ', 'Τρι', 'Τετ', 'Πεμ', 'Παρ', 'Σαβ'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
}
const MONTHS_L: Record<Locale, string[]> = {
  el: ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
}
const MONTHS_SHORT_L: Record<Locale, string[]> = {
  el: ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}

type Location = {
  id: string
  name: string
  address: string
  city: string
  photos?: string[] | null
}

type Service = {
  id: string
  name: string
  description: string
  price: number
  price_moto?: number
  duration_minutes: number
}

type Slot = {
  id: string
  time: string
  available: boolean
}

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
  const todayStr = athensToday()
  const dates = []
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    if (dateStr >= todayStr) dates.push(new Date(year, month, d))
  }
  return dates
}

export default function LocationPage() {
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string
  const t = useT(T)
  const { locale } = useLocale()

  const today = new Date()

  const [location, setLocation] = useState<Location | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [isFavorite, setIsFavorite] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [favoriteId, setFavoriteId] = useState<string | null>(null)
  const [locationHours, setLocationHours] = useState<any[]>([])
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [reviewAvg, setReviewAvg] = useState<number | null>(null)
  const [reviewCount, setReviewCount] = useState(0)

  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [selectedDate, setSelectedDate] = useState(today)
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [vehicleType, setVehicleType] = useState<'ΙΧ' | 'Μοτοσικλέτα'>('ΙΧ')

  useEffect(() => {
    track('location_viewed')
    const loadData = async () => {
      const supabase = createClient()

      const { data: sessionData } = await supabase.auth.getSession()
      const uid = sessionData.session?.user?.id || null
      setUserId(uid)

      const { data: locationData } = await supabase
        .from('locations')
        .select('id, name, address, city, photos')
        .eq('slug', slug)
        .single()

      if (!locationData) {
        router.push('/')
        return
      }

      setLocation(locationData)

      const [servicesRes, hoursRes, reviewsRes] = await Promise.all([
        supabase
          .from('services')
          .select('id, name, description, price, price_moto, duration_minutes')
          .eq('location_id', locationData.id)
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('location_hours')
          .select('day_of_week, is_closed, open_time, close_time')
          .eq('location_id', locationData.id),
        supabase
          .from('reviews')
          .select('id, rating, comment, created_at')
          .eq('location_id', locationData.id)
          .order('created_at', { ascending: false }),
      ])

      setServices(servicesRes.data || [])
      setLocationHours(hoursRes.data || [])

      const reviews = (reviewsRes.data as { rating: number }[]) || []
      if (reviews.length > 0) {
        const sum = reviews.reduce((acc, r) => acc + r.rating, 0)
        setReviewAvg(Math.round((sum / reviews.length) * 10) / 10)
        setReviewCount(reviews.length)
      }

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
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

    const { data: exceptionData } = await supabase
      .from('location_hours_exceptions')
      .select('periods, is_closed')
      .eq('location_id', locationId)
      .eq('exception_date', dateStr)
      .maybeSingle()

    let allTimes: string[] = []

    if (exceptionData) {
      if (exceptionData.is_closed) {
        setSlots([])
        setSlotsLoading(false)
        return
      }
      for (const period of exceptionData.periods) {
        allTimes = [...allTimes, ...generateSlots(period.open, period.close)]
      }
    } else {
      const dayHours = locationHours.find(h => h.day_of_week === dayOfWeek)
      if (!dayHours || dayHours.is_closed) {
        setSlots([])
        setSlotsLoading(false)
        return
      }
      allTimes = generateSlots(dayHours.open_time, dayHours.close_time)
    }

    const { data: bookedData } = await supabase
      .from('bookings')
      .select('slot_start_time')
      .eq('location_id', locationId)
      .eq('slot_date', dateStr)
      .not('status', 'in', '("cancelled")')

    const bookedTimes = new Set((bookedData || []).map((b: any) => b.slot_start_time?.slice(0, 5)))

    const isToday = dateStr === athensToday()
    const nowMinutes = athensMinutesOfDay()

    setSlots(allTimes.map(time => {
      const [h, m] = time.split(':').map(Number)
      const isPast = isToday && (h * 60 + m) <= nowMinutes
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
    lightTap()
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

  const visibleServices = services.filter(s => {
    if (vehicleType === 'ΙΧ') return s.name !== 'Πλύσιμο'
    if (vehicleType === 'Μοτοσικλέτα') return s.name === 'Πλύσιμο'
    return true
  })

  const service = visibleServices.find(s => s.id === selectedServiceId)
  const canBook = selectedServiceId && selectedSlot
  const selectedServicePrice = service ? (vehicleType === 'Μοτοσικλέτα' && service.price_moto ? service.price_moto : service.price) : null

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
  const isSelectedDate = (d: Date) => d.toDateString() === selectedDate.toDateString()
  const isPast = viewMonth === today.getMonth() && viewYear === today.getFullYear()

  if (loading) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-xs text-gray-400">{t.loading}</p>
      </main>
    )
  }

  if (!location) return null

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md md:max-w-4xl pb-32 relative">

        {/* Hero photo strip with floating nav buttons */}
        <div
          className="h-[160px] relative overflow-hidden"
          style={{
            background: 'repeating-linear-gradient(135deg, #FAFAFA 0 16px, #F7F7F7 16px 32px)',
          }}
        >
          {location.photos && location.photos.length > 0 ? (
            <img
              src={location.photos[0]}
              alt={location.name}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute top-3.5 left-3.5 font-mono text-[10px] text-gray-400 tracking-wider">
              // photo
            </div>
          )}

          {/* Nav buttons floating over hero */}
          <div className="absolute top-14 left-4 right-4 flex justify-between">
            <button
              onClick={() => router.back()}
              className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-900"
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
            >
              <ChevronLeft size={20} />
            </button>
            {userId && (
              <button
                onClick={toggleFavorite}
                className="w-10 h-10 rounded-full bg-white flex items-center justify-center"
                style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
              >
                <Heart size={18} className={isFavorite ? 'text-red-500 fill-red-500' : 'text-gray-900'} />
              </button>
            )}
          </div>

          {/* Photo dots */}
          {location.photos && location.photos.length > 1 && (
            <div className="absolute bottom-3.5 left-1/2 -translate-x-1/2 flex gap-1.5">
              {location.photos.map((_, i) => (
                <span
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-white' : 'bg-white opacity-60'}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="px-5 pt-5 md:flex md:gap-8 md:items-start">

          {/* LEFT (desktop): τι (όχημα + υπηρεσίες) */}
          <div className="md:flex-1 md:min-w-0">

          {/* Heading */}
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1">
              <h1 className="text-[24px] font-semibold tracking-tight leading-[1.15] text-gray-900">{location.name}</h1>
              <div className="flex items-center gap-1.5 mt-2">
                <MapPin size={13} className="text-gray-500" strokeWidth={1.6} />
                <p className="text-[13px] text-gray-500">{location.address}, {location.city}</p>
              </div>
            </div>
            <button
              onClick={() => { lightTap(); router.push('/locations/' + slug + '/reviews') }}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-50 rounded-lg shrink-0"
            >
              <Star size={12} className="fill-gray-900 text-gray-900" strokeWidth={1} />
              {reviewAvg !== null ? (
                <span className="text-[12px] font-semibold text-gray-900">
                  {reviewAvg.toFixed(1)}
                  <span className="text-gray-400 font-medium"> ({reviewCount})</span>
                </span>
              ) : (
                <span className="text-[12px] font-semibold text-gray-900">{t.newBadge}</span>
              )}
            </button>
          </div>

          {/* Vehicle type */}
          <p className="text-[11px] font-semibold text-gray-400 tracking-[1.8px] uppercase mt-7 mb-2.5">
            {t.vehicle}
          </p>
          <div className="flex gap-2">
            {(['ΙΧ', 'Μοτοσικλέτα'] as const).map(type => {
              const active = vehicleType === type
              return (
                <button
                  key={type}
                  onClick={() => { setVehicleType(type); lightTap() }}
                  className={`px-3.5 py-2.5 rounded-full text-[13px] font-semibold border flex items-center gap-1.5 transition-all ${
                    active
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-900 border-gray-200'
                  }`}
                >
                  {type === 'ΙΧ' ? <Car size={15} /> : <Bike size={15} />}
                  {type === 'ΙΧ' ? t.car : t.moto}
                </button>
              )
            })}
          </div>

          {/* Services */}
          <p className="text-[11px] font-semibold text-gray-400 tracking-[1.8px] uppercase mt-6 mb-2.5">
            {t.service}
          </p>
          <div className="flex flex-col gap-2.5">
            {visibleServices.map(s => {
              const selected = selectedServiceId === s.id
              const price = vehicleType === 'Μοτοσικλέτα' && s.price_moto ? s.price_moto : s.price
              return (
                <button
                  key={s.id}
                  onClick={() => { setSelectedServiceId(s.id); lightTap() }}
                  className={`flex items-center gap-3.5 p-[18px] rounded-2xl border transition-all text-left ${
                    selected
                      ? 'bg-gray-900 border-gray-900 text-white'
                      : 'bg-white border-gray-100 text-gray-900'
                  }`}
                  style={!selected ? { boxShadow: '0 1px 3px rgba(0,0,0,0.03)' } : undefined}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                      selected ? 'bg-white' : 'border-[1.5px] border-gray-200'
                    }`}
                  >
                    {selected && <Check size={14} className="text-gray-900" strokeWidth={2.4} />}
                  </div>
                  <div className="flex-1">
                    <p className={`text-[15px] font-semibold tracking-tight ${selected ? 'text-white' : 'text-gray-900'}`}>
                      {s.name}
                    </p>
                    {s.description && (
                      <p className={`text-xs mt-0.5 ${selected ? 'text-white/60' : 'text-gray-500'}`}>
                        {s.description} · {s.duration_minutes}′
                      </p>
                    )}
                  </div>
                  <p className={`text-[17px] font-semibold tracking-tight ${selected ? 'text-white' : 'text-gray-900'}`}>
                    €{price}
                  </p>
                </button>
              )
            })}
          </div>
          </div>

          {/* RIGHT (desktop): πότε (ημερομηνία + ώρες) */}
          <div className="md:flex-1 md:min-w-0">

          {/* Date picker */}
          <div className="flex items-center justify-between mt-7 mb-2.5">
            <p className="text-[11px] font-semibold text-gray-400 tracking-[1.8px] uppercase">
              {t.date}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={prevMonth}
                disabled={isPast}
                className={`p-1.5 rounded-lg ${isPast ? 'text-gray-200' : 'text-gray-500'}`}
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-[12px] font-semibold text-gray-700 min-w-[90px] text-center">
                {MONTHS_L[locale][viewMonth]}
              </span>
              <button onClick={nextMonth} className="p-1.5 rounded-lg text-gray-500">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-5 px-5 pb-1">
            {dates.map((d, i) => {
              const selected = isSelectedDate(d)
              const isSunday = d.getDay() === 0
              return (
                <button
                  key={i}
                  onClick={() => { setSelectedDate(d); setSelectedSlot(null); lightTap() }}
                  className={`shrink-0 w-14 h-[72px] rounded-[14px] border flex flex-col items-center justify-center gap-1 transition-all ${
                    selected
                      ? 'bg-gray-900 border-gray-900 text-white'
                      : isSunday
                      ? 'bg-gray-50 border-gray-100 text-gray-400'
                      : 'bg-white border-gray-100 text-gray-900'
                  }`}
                >
                  <span
                    className={`text-[11px] font-medium uppercase tracking-wider ${
                      selected ? 'text-white/70' : isSunday ? 'text-gray-400' : 'text-gray-500'
                    }`}
                  >
                    {DAYS_JS_L[locale][d.getDay()]}
                  </span>
                  <span className={`text-[20px] font-semibold tracking-tight ${selected ? 'text-white' : isSunday ? 'text-gray-400' : 'text-gray-900'}`}>
                    {d.getDate()}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Time slots */}
          <p className="text-[11px] font-semibold text-gray-400 tracking-[1.8px] uppercase mt-6 mb-2.5">
            {t.time} · {selectedDate.getDate()} {MONTHS_SHORT_L[locale][selectedDate.getMonth()]}
          </p>
          {slotsLoading ? (
            <p className="text-xs text-gray-400">{t.loadingHours}</p>
          ) : slots.length === 0 ? (
            <p className="text-xs text-gray-400">{t.noSlots}</p>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {slots.map(slot => {
                const selected = selectedSlot === slot.id
                if (!slot.available) {
                  return (
                    <div
                      key={slot.id}
                      className="h-11 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center text-[14px] font-semibold text-gray-300"
                      style={{ textDecoration: 'line-through' }}
                    >
                      {slot.time}
                    </div>
                  )
                }
                return (
                  <button
                    key={slot.id}
                    onClick={() => { setSelectedSlot(slot.id); lightTap() }}
                    className={`h-11 rounded-xl border text-[14px] font-semibold transition-all ${
                      selected
                        ? 'bg-gray-900 border-gray-900 text-white'
                        : 'bg-white border-gray-200 text-gray-900'
                    }`}
                  >
                    {slot.time}
                  </button>
                )
              })}
            </div>
          )}
          </div>
        </div>

        {/* Sticky CTA with gradient fade */}
        <div
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md px-5 pt-3.5 pb-10"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, #fff 28%)',
          }}
        >
          {canBook ? (
            <button
              onClick={() => router.push(`/booking?location=${location.id}&service=${selectedServiceId}&slot=${encodeURIComponent(selectedSlot!)}&date=${selectedDate.toISOString().split('T')[0]}&vehicleType=${encodeURIComponent(vehicleType)}`)}
              className="w-full h-14 rounded-xl bg-gray-900 text-white text-[15px] font-semibold tracking-tight flex items-center justify-center gap-2"
            >
              <span>{t.book}</span>
              <span className="w-px h-4 bg-white/25" />
              <span>€{selectedServicePrice}</span>
            </button>
          ) : (
            <div className="w-full h-14 rounded-xl bg-gray-100 text-gray-400 text-[14px] font-medium flex items-center justify-center">
              {t.selectPrompt}
            </div>
          )}
        </div>

      </div>
    </main>
  )
}