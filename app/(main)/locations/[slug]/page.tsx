'use client'

import { formatDuration } from '@/lib/duration'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Star, MapPin, Heart, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { track } from '@vercel/analytics'
import { athensToday, athensMinutesOfDay, ymdFromLocalDate } from '@/lib/time'
import { computeSlots, type OccupancyBooking, type HoursException } from '@/lib/availability'
import { isMotoService, compareServices, serviceImage } from '@/lib/services-catalog'
import { WashioLoader } from '@/components/WashioLoader'
import { lightTap, selectionHaptic } from '@/lib/haptics'
import { useT, useLocale, Locale } from '@/lib/i18n'
import { translateCatalogName } from '@/lib/catalog-i18n'
import { funnel } from '@/lib/funnel'
import { useCouponCredit, couponDiscount, eur, couponExpiryLabel } from '@/lib/use-coupon-credit'
import { applyPromo, promoAppliesTo } from '@/lib/promotions'
import { type WxDay, bestWashDay, isWet, wxEmoji } from '@/lib/weather'
import { useCarChoice, vehicleTypeOf, soleServiceId, type CarChoice } from '@/lib/car-choice'
import { flattenRange, fromPrice as fromPriceLabel } from '@/lib/range-price'
import { VehicleSelector, type VehicleSelectorHandle } from '@/components/VehiclePicker'

const T = {
  el: {
    loading: 'Φόρτωση...',
    newBadge: 'Νέο',
    vehicle: 'Όχημα',
    car: 'ΙΧ',
    moto: 'Μοτο',
    service: 'Υπηρεσία',
    couponGuest: 'Τιμές με −3€ για την 1η σου κράτηση', couponUser: 'Τιμές με το κουπόνι σου',
    date: 'Ημερομηνία',
    time: 'Ώρα',
    loadingHours: 'Φόρτωση ωρών...',
    noSlots: 'Δεν υπάρχουν διαθέσιμα slots για αυτή την ημέρα.',
    book: 'Κράτηση',
    selectPrompt: 'Επίλεξε υπηρεσία, ημερομηνία και ώρα',
    today: 'Σήμερα', tomorrow: 'Αύριο',
    reassure: 'Πληρώνεις στο πλυντήριο · Ακυρώνεις δωρεάν',
    bestDay: 'Ιδανική', bestHint: 'Καλύτερη μέρα για πλύσιμο', bestWhy: 'χωρίς βροχή και την επόμενη μέρα', rainWarn: 'Πιθανή βροχή', rainTry: 'Δοκίμασε', pick: 'Επιλογή',
  },
  en: {
    loading: 'Loading...',
    newBadge: 'New',
    vehicle: 'Vehicle',
    car: 'Car',
    moto: 'Moto',
    service: 'Service',
    couponGuest: 'Prices include −€3 on your first booking', couponUser: 'Prices include your coupon',
    date: 'Date',
    time: 'Time',
    loadingHours: 'Loading times...',
    noSlots: 'No available slots for this day.',
    book: 'Book',
    selectPrompt: 'Choose a service, date and time',
    today: 'Today', tomorrow: 'Tomorrow',
    reassure: 'Pay at the car wash · Free cancellation',
    bestDay: 'Best', bestHint: 'Best day to wash', bestWhy: 'no rain the day after either', rainWarn: 'Rain likely', rainTry: 'Try', pick: 'Pick',
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
  capacity?: number
  lat?: number | null
  lng?: number | null
}

type Service = {
  id: string
  name: string
  description: string
  price: number
  price_moto?: number
  price_suv?: number
  duration_minutes: number
  is_range?: boolean
  price_min?: number | null
  price_max?: number | null
  price_min_suv?: number | null
  price_max_suv?: number | null
  is_active?: boolean
  sort_order?: number | null
}

type Slot = {
  id: string
  time: string
  available: boolean
}

function jsDayToSupabase(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay
}

// Η λογική διαθεσιμότητας είναι ΚΟΙΝΗ σε όλη την εφαρμογή — lib/availability.ts.

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
  const [photoIdx, setPhotoIdx] = useState(0)
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
  const [wx, setWx] = useState<WxDay[]>([])
  const [pickedServiceId, setSelectedServiceId] = useState<string | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  // Όχημα: «Ποιο αμάξι έχεις;» (μάρκα/μοντέλο → ΙΧ/SUV). Χωρίς επιλογή → καμία τιμή.
  const [carChoice, setCarChoice] = useCarChoice()
  const vehicleType = vehicleTypeOf(carChoice)
  // Μία μόνο υπηρεσία για το όχημα (π.χ. μηχανή) → επιλεγμένη αυτόματα, κατευθείαν μέρα/ώρα.
  const selectedServiceId = pickedServiceId ?? (carChoice ? soleServiceId(services, vehicleType, isMotoService) : null)
  const carPickerRef = useRef<VehicleSelectorHandle>(null)
  const pendingSvcRef = useRef<string | null>(null)
  const onCarPicked = (c: CarChoice) => {
    setCarChoice(c)
    if (pendingSvcRef.current) { setSelectedServiceId(pendingSvcRef.current); pendingSvcRef.current = null }
  }
  // Πρώτη ελεύθερη ώρα ΗΔΗ επιλεγμένη (ένα πάτημα για κράτηση). Αν η μέρα δεν έχει
  // ελεύθερη ώρα, πάμε αυτόματα στην επόμενη (έως 7 μέρες) — μόνο αν ο χρήστης
  // δεν έχει διαλέξει ο ίδιος μέρα.
  const userPickedDateRef = useRef(false)
  const autoAdvanceRef = useRef(0)
  const userPickedSlotRef = useRef(false)

  useEffect(() => {
    track('location_viewed')
    const loadData = async () => {
      const supabase = createClient()

      const { data: sessionData } = await supabase.auth.getSession()
      const uid = sessionData.session?.user?.id || null
      setUserId(uid)

      // ΕΝΑ round-trip για πλυντήριο + υπηρεσίες + ωράριο + βαθμολογίες, και
      // παράλληλα το αγαπημένο (πριν: 3 διαδοχικά round-trips).
      const [{ data: locationData }, favRes] = await Promise.all([
        supabase
          .from('locations')
          .select(`id, name, address, city, photos, capacity, lat, lng,
            services(id, name, description, price, price_moto, price_suv, duration_minutes, is_active, sort_order, is_range, price_min, price_max, price_min_suv, price_max_suv),
            location_hours(day_of_week, is_closed, open_time, close_time, open_time2, close_time2),
            reviews(rating)`)
          .eq('slug', slug)
          .single(),
        uid
          ? supabase
              .from('favorites')
              .select('id, locations!inner(slug)')
              .eq('user_id', uid)
              .eq('locations.slug', slug)
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ])

      if (!locationData) {
        router.push('/')
        return
      }

      const loc = locationData as any
      setLocation({ id: loc.id, name: loc.name, address: loc.address, city: loc.city, photos: loc.photos, capacity: loc.capacity, lat: loc.lat, lng: loc.lng })
      funnel('washer_page', { locationId: loc.id })

      const svc = ((loc.services || []) as Service[]).map(flattenRange)
        .filter(s => s.is_active !== false)
        .sort(compareServices)
      setServices(svc)
      // «Κλείσε ξανά» (email επαναληπτικής κράτησης): ?service=<id> → η ίδια υπηρεσία με την προηγούμενη φορά, ήδη επιλεγμένη.
      try {
        const want = new URLSearchParams(window.location.search).get('service')
        if (want && svc.some(s => s.id === want)) setSelectedServiceId(want)
      } catch { /* ignore */ }
      setLocationHours(loc.location_hours || [])

      const reviews = (loc.reviews as { rating: number }[]) || []
      if (reviews.length > 0) {
        const sum = reviews.reduce((acc, r) => acc + r.rating, 0)
        setReviewAvg(Math.round((sum / reviews.length) * 10) / 10)
        setReviewCount(reviews.length)
      }

      const favData = (favRes as { data: { id: string } | null }).data
      if (favData) {
        setIsFavorite(true)
        setFavoriteId(favData.id)
      }

      setLoading(false)
    }

    loadData()
  }, [slug])

  const loadSlots = useCallback(async (date: Date, locationId: string, durationMinutes: number) => {
    setSlotsLoading(true)
    const supabase = createClient()

    const dayOfWeek = jsDayToSupabase(date.getDay())
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

    // ΚΟΙΝΗ λογική διαθεσιμότητας (lib/availability): ωράριο, εξαιρέσεις,
    // capacity μανικών, διάρκεια υπηρεσίας, lead time — ίδια με χάρτη & server.
    const [{ data: exceptionData }, { data: bookedData }] = await Promise.all([
      supabase
        .from('location_hours_exceptions')
        .select('periods, is_closed, closed_from, closed_to')
        .eq('location_id', locationId)
        .eq('exception_date', dateStr)
        .maybeSingle(),
      // busy_slots: όλες οι πιασμένες ώρες (το RLS των bookings κρύβει τις ξένες κρατήσεις).
      supabase.rpc('busy_slots', { p_from: dateStr, p_to: dateStr, p_location: locationId }),
    ])

    const dayHours = locationHours.find(h => h.day_of_week === dayOfWeek) || null

    const computed = computeSlots({
      dayHours,
      exception: exceptionData as HoursException,
      bookings: (bookedData || []) as OccupancyBooking[],
      capacity: Math.max(1, Number(location?.capacity) || 1),
      durationMinutes,
      isToday: dateStr === athensToday(),
      nowMinutes: athensMinutesOfDay(),
    })

    setSlots(computed.map(s => ({ id: s.time, time: s.time, available: s.available })))
    const first = computed.find(s => s.available)
    if (first) {
      // Κράτα την ώρα του χρήστη αν ισχύει ακόμα· αλλιώς η πρώτη ελεύθερη.
      setSelectedSlot(prev => (prev && computed.some(s => s.time === prev && s.available)) ? prev : first.time)
    } else if (!userPickedDateRef.current && autoAdvanceRef.current < 7) {
      autoAdvanceRef.current += 1
      const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
      setViewMonth(next.getMonth())
      setViewYear(next.getFullYear())
      setSelectedDate(next)
      return
    }
    setSlotsLoading(false)
  }, [locationHours, location?.capacity])

  const selectedServiceDuration = Math.max(
    30,
    services.find(s => s.id === selectedServiceId)?.duration_minutes || 30
  )

  useEffect(() => {
    if (location && locationHours.length > 0) {
      setSelectedSlot(null)
      userPickedSlotRef.current = false
      loadSlots(selectedDate, location.id, selectedServiceDuration)
    }
  }, [selectedDate, location, locationHours, selectedServiceDuration])

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

  // Καιρός 7 ημερών για το σημείο του πλυντηρίου (best-effort).
  useEffect(() => {
    if (!location) return
    let alive = true
    const q = location.lat && location.lng ? `?lat=${location.lat}&lng=${location.lng}` : ''
    fetch(`/api/weather${q}`).then(r => r.json()).then(j => { if (alive) setWx(Array.isArray(j?.days) ? j.days : []) }).catch(() => {})
    return () => { alive = false }
  }, [location?.id])

  const dates = getDatesForMonth(viewYear, viewMonth)
  const wxBy = new Map(wx.map(d => [d.date, d]))
  const closedOn = (ymd: string) => {
    const [y, m, dd] = ymd.split('-').map(Number)
    const dow = jsDayToSupabase(new Date(y, m - 1, dd).getDay())
    const h = locationHours.find(x => x.day_of_week === dow)
    return !h || !!h.is_closed
  }
  // Σήμερα μετά τις 17:00 δεν προτείνεται (λίγες/καθόλου ώρες).
  const skipDay = (ymd: string) => closedOn(ymd) || (ymd === athensToday() && athensMinutesOfDay() >= 17 * 60)
  const bestYmd = locationHours.length ? bestWashDay(wx, skipDay) : null
  const selYmd = ymdFromLocalDate(selectedDate)
  const selWx = wxBy.get(selYmd)
  const pickYmd = (ymd: string) => {
    const [y, m, dd] = ymd.split('-').map(Number)
    const d = new Date(y, m - 1, dd)
    userPickedDateRef.current = true
    setViewMonth(d.getMonth()); setViewYear(d.getFullYear())
    setSelectedDate(d); setSelectedSlot(null); lightTap()
  }

  // Τιμή ανά τύπο οχήματος: ΙΧ = βασική, SUV = price_suv, Μοτο = price_moto.
  // Υπηρεσία εύρους (βιολογικός): min–max ανά ΙΧ/SUV, όχι μοτο.
  const rangeFor = (s: Service): [number, number] => [
    Number(vehicleType === 'SUV' ? s.price_min_suv : s.price_min) || 0,
    Number(vehicleType === 'SUV' ? s.price_max_suv : s.price_max) || 0,
  ]
  // Τιμή καταλόγου (χωρίς προώθηση).
  const listPriceFor = (s: Service) => {
    if (s.is_range) { const [a, b] = rangeFor(s); return (a + b) / 2 }
    return vehicleType === 'Μοτοσικλέτα' && s.price_moto ? s.price_moto
      : vehicleType === 'SUV' && s.price_suv ? s.price_suv
      : s.price
  }
  // Προώθηση πλυντηρίου για την επιλεγμένη ημέρα (η κράτηση την εφαρμόζει server-side).
  // Βιολογικός (εύρος): μόνο προσφορά σταθερής τιμής («μόνο 120€») — το εύρος σβήνει.
  const promoFor = (s: Service) => promos.find(p => p.service_id === s.id && promoAppliesTo(p, selYmd, athensToday()) && (!s.is_range || p.discount_type === 'fixed'))
  const priceFor = (s: Service) => {
    const lp = listPriceFor(s)
    const pr = promoFor(s)
    return pr ? applyPromo(Number(lp) || 0, pr) : lp
  }
  const priceLabel = (s: Service) => {
    if (s.is_range && promoFor(s)) return `€${eur(Number(priceFor(s)) || 0)}`
    if (s.is_range) return fromPriceLabel(rangeFor(s)[0], locale === 'en' ? 'en' : 'el')
    return `€${priceFor(s)}`
  }
  // Κουπόνι ήδη μέσα στην τιμή (~~15€~~ 12€) — ίδιοι κανόνες με το checkout.
  const coupon = useCouponCredit()
  const [promos, setPromos] = useState<{ service_id: string; discount_type: 'percent' | 'amount' | 'fixed'; discount_value: number; starts_on: string; ends_on: string; by_booking_date?: boolean }[]>([])
  useEffect(() => {
    if (!location?.id) return
    let alive = true
    fetch(`/api/promotions?location=${location.id}`).then(r => r.json()).then(j => { if (alive) setPromos(j.promotions || []) }).catch(() => {})
    return () => { alive = false }
  }, [location?.id])
  // Συνολική έκπτωση που βλέπει ο πελάτης = προώθηση + κουπόνι (το κουπόνι στην τιμή μετά την προώθηση).
  const discFor = (s: Service) => s.is_range ? 0 : ((Number(listPriceFor(s)) || 0) - (Number(priceFor(s)) || 0)) + couponDiscount(coupon, Number(priceFor(s)) || 0, s.is_range)

  const visibleServices = services.filter(s => {
    // Χωρίς τιμή για τον επιλεγμένο τύπο οχήματος → δεν εμφανίζεται.
    if (s.is_range) {
      if (vehicleType === 'Μοτοσικλέτα') return false
      const [a, b] = rangeFor(s)
      return a > 0 && b > 0
    }
    if (!(Number(priceFor(s)) > 0)) return false
    if (vehicleType === 'ΙΧ' || vehicleType === 'SUV') return !isMotoService(s.name)
    if (vehicleType === 'Μοτοσικλέτα') return isMotoService(s.name)
    return true
  })

  const service = visibleServices.find(s => s.id === selectedServiceId)
  const canBook = selectedServiceId && selectedSlot
  const selectedServicePrice = service ? priceFor(service) : null

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
  // «Σήμερα» / «Αύριο» / «Παρ 24» — για το κουμπί κράτησης.
  const dayWord = (d: Date) => {
    if (isToday(d)) return t.today
    const tm = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
    if (d.toDateString() === tm.toDateString()) return t.tomorrow
    return `${DAYS_JS_L[locale][d.getDay()]} ${d.getDate()}`
  }
  const isSelectedDate = (d: Date) => d.toDateString() === selectedDate.toDateString()
  const isPast = viewMonth === today.getMonth() && viewYear === today.getFullYear()

  if (loading) {
    return (
      <main className="min-h-screen bg-washio-bg flex items-center justify-center">
        <WashioLoader />
      </main>
    )
  }

  if (!location) return null

  return (
    <main className="min-h-screen bg-washio-bg flex flex-col items-center">
      <div className="w-full max-w-md md:max-w-4xl pb-36 relative">

        {/* Hero photo strip with floating nav buttons */}
        <div className="h-[250px] relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #16233A 0%, #0E4A63 100%)' }}>
          {location.photos && location.photos.length > 0 ? (
            // Swipe carousel (scroll-snap) — όλες οι φωτογραφίες, όχι μόνο η 1η.
            <div
              className="absolute inset-0 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
              onScroll={e => {
                const el = e.currentTarget
                const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
                if (i !== photoIdx) setPhotoIdx(i)
              }}
            >
              {location.photos.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={src}
                  alt={location.name}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  className="w-full h-full object-cover shrink-0 snap-center"
                />
              ))}
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white/90 text-[44px] font-semibold tracking-tight">{location.name?.charAt(0)}</span>
            </div>
          )}

          {/* Απαλό navy fade κάτω — «δένει» τη φωτογραφία με την κάρτα περιεχομένου */}
          <div className="absolute inset-x-0 bottom-0 h-24 pointer-events-none"
            style={{ background: 'linear-gradient(180deg, rgba(16,24,42,0) 0%, rgba(16,24,42,0.45) 100%)' }} />

          {/* Nav buttons floating over hero */}
          <div className="absolute top-[calc(var(--safe-top)+14px)] left-4 right-4 flex justify-between">
            <button
              onClick={() => router.back()}
              className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center text-washio-navy"
              style={{ boxShadow: '0 4px 14px rgba(16,24,42,0.18)' }}
            >
              <ChevronLeft size={20} />
            </button>
            {userId && (
              <button
                onClick={toggleFavorite}
                className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-md flex items-center justify-center"
                style={{ boxShadow: '0 4px 14px rgba(16,24,42,0.18)' }}
              >
                <Heart size={18} className={isFavorite ? 'text-washio-cyan fill-washio-cyan' : 'text-washio-navy'} />
              </button>
            )}
          </div>

          {/* Photo dots */}
          {location.photos && location.photos.length > 1 && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none">
              {location.photos.map((_, i) => (
                <span
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full transition-opacity ${i === photoIdx ? 'bg-white' : 'bg-white opacity-50'}`}
                />
              ))}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="relative -mt-7 bg-washio-bg rounded-t-[28px] px-5 pt-6 md:flex md:gap-8 md:items-start">

          {/* LEFT (desktop): τι (όχημα + υπηρεσίες) */}
          <div className="md:flex-1 md:min-w-0">

          {/* Heading */}
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1">
              <h1 className="text-[25px] font-bold tracking-tight leading-[1.15] text-washio-navy">{location.name}</h1>
              <div className="flex items-center gap-1.5 mt-2">
                <MapPin size={14} className="text-washio-cyan-dark shrink-0" strokeWidth={2} />
                <p className="text-[13px] text-gray-500">{location.address}, {location.city}</p>
              </div>
            </div>
            <button
              onClick={() => { lightTap(); router.push('/locations/' + slug + '/reviews') }}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-washio-border rounded-full shrink-0"
              style={{ boxShadow: '0 2px 8px rgba(16,24,42,0.05)' }}
            >
              <Star size={13} className="fill-washio-cyan-dark text-washio-cyan-dark" strokeWidth={1} />
              {reviewAvg !== null ? (
                <span className="text-[12px] font-semibold text-washio-navy">
                  {reviewAvg.toFixed(1)}
                  <span className="text-gray-400 font-medium"> ({reviewCount})</span>
                </span>
              ) : (
                <span className="text-[12px] font-semibold text-washio-navy">{t.newBadge}</span>
              )}
            </button>
          </div>

          {/* Vehicle type */}
          <p className="text-[11px] font-bold text-washio-navy/70 tracking-[1.4px] uppercase mt-7 mb-2.5">
            {t.vehicle}
          </p>
          <div className="flex gap-2">
            <VehicleSelector ref={carPickerRef} choice={carChoice} big={!carChoice} onPick={onCarPicked} onClose={() => { pendingSvcRef.current = null }} locale={locale === 'en' ? 'en' : 'el'} />
          </div>

          {/* Χωρίς όχημα → καμία υπηρεσία (πρώτα «Τι όχημα έχεις;») */}
          {carChoice && <>
          {/* Services */}
          <p className="text-[11px] font-bold text-washio-navy/70 tracking-[1.4px] uppercase mt-6 mb-2.5">
            {t.service}
          </p>
          {carChoice && visibleServices.some(s => discFor(s) > 0) && (
            <p className="text-[12px] font-semibold text-washio-cyan-dark -mt-1 mb-2.5">{coupon.guest ? t.couponGuest : t.couponUser}{!coupon.guest && (() => { const ex = couponExpiryLabel(coupon.expiresAt, locale); return ex ? <span className={ex.urgent ? 'text-red-600' : ''}> · {ex.text}</span> : null })()}</p>
          )}
          <div className="flex flex-col gap-2.5">
            {visibleServices.map(s => {
              const selected = selectedServiceId === s.id
              const price = priceLabel(s)
              const base = Number(listPriceFor(s)) || 0
              const disc = discFor(s)
              const promo = promoFor(s)
              return (
                <button
                  key={s.id}
                  onClick={() => { if (!carChoice) { pendingSvcRef.current = s.id; carPickerRef.current?.open(); return } setSelectedServiceId(s.id); lightTap(); funnel('service_select', { locationId: location?.id, meta: { src: 'page', svc: s.name, price: base, shown: base - disc, disc, range: !!s.is_range, guest: coupon.guest } }) }}
                  className={`flex items-center gap-3.5 p-3.5 min-h-[72px] rounded-[20px] border transition-all text-left ${
                    selected
                      ? 'border-washio-navy text-white'
                      : 'bg-white border-washio-border text-washio-navy'
                  }`}
                  style={selected
                    ? { background: 'linear-gradient(135deg, #16233A 0%, #10182A 100%)', boxShadow: '0 10px 24px rgba(16,24,42,0.22)' }
                    : { boxShadow: '0 4px 14px rgba(16,24,42,0.05)' }}
                >
                  {serviceImage(s.name) ? (
                    <div className="relative w-14 h-14 shrink-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={serviceImage(s.name)!} alt="" width={56} height={56} loading="lazy" decoding="async"
                        className={`w-14 h-14 rounded-[14px] object-cover ${selected ? 'ring-2 ring-washio-cyan' : ''}`} />
                      {selected && (
                        <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-washio-cyan flex items-center justify-center ring-2 ring-[#10182A]">
                          <Check size={12} className="text-white" strokeWidth={3} />
                        </span>
                      )}
                    </div>
                  ) : (
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                        selected ? 'bg-washio-cyan' : 'border-[1.5px] border-washio-border'
                      }`}
                    >
                      {selected && <Check size={14} className="text-white" strokeWidth={2.6} />}
                    </div>
                  )}
                  <div className="flex-1">
                    <p className={`text-[15px] font-semibold tracking-tight ${selected ? 'text-white' : 'text-washio-navy'}`}>
                      {translateCatalogName(s.name, locale)}
                    </p>
                    {s.description && (
                      <p className={`text-xs mt-0.5 ${selected ? 'text-white/60' : 'text-gray-500'}`}>
                        {s.description} · {formatDuration(s.duration_minutes, locale)}
                      </p>
                    )}
                  </div>
                  {!carChoice ? (
                    <p className="text-[12px] font-semibold text-washio-cyan-dark shrink-0">{locale === 'en' ? 'see price' : 'δες τιμή'}</p>
                  ) : s.is_range && promo ? (
                    <div className="text-right shrink-0">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-red-500 leading-none mb-1">{locale === 'en' ? 'Offer' : 'Προσφορά'}</p>
                      <p className={`text-[12px] font-medium line-through leading-none ${selected ? 'text-white/50' : 'text-gray-400'}`}>{fromPriceLabel(rangeFor(s)[0], locale === 'en' ? 'en' : 'el')}</p>
                      <p className={`text-[17px] font-bold tracking-tight mt-0.5 ${selected ? 'text-washio-cyan' : 'text-washio-cyan-dark'}`}>€{eur(Number(priceFor(s)) || 0)} <span className="text-[11px] font-semibold">{locale === 'en' ? 'only' : 'μόνο'}</span></p>
                    </div>
                  ) : disc > 0 ? (
                    <div className="text-right shrink-0">
                      {promo && <p className="text-[10px] font-bold uppercase tracking-wide text-red-500 leading-none mb-1">{locale === 'en' ? 'Offer' : 'Προσφορά'}</p>}
                      <p className={`text-[12px] font-medium line-through leading-none ${selected ? 'text-white/50' : 'text-gray-400'}`}>€{eur(base)}</p>
                      <p className={`text-[17px] font-bold tracking-tight mt-0.5 ${selected ? 'text-washio-cyan' : 'text-washio-cyan-dark'}`}>€{eur(base - disc)}</p>
                    </div>
                  ) : (
                    <p className={`text-[17px] font-bold tracking-tight ${selected ? 'text-washio-cyan' : 'text-washio-navy'}`}>
                      {price}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
          </>}
          </div>

          {/* RIGHT (desktop): πότε (ημερομηνία + ώρες) */}
          <div className="md:flex-1 md:min-w-0">

          {/* Date picker */}
          <div className="flex items-center justify-between mt-7 mb-2.5">
            <p className="text-[11px] font-bold text-washio-navy/70 tracking-[1.4px] uppercase">
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
              <span className="text-[12px] font-semibold text-washio-navy min-w-[90px] text-center">
                {MONTHS_L[locale][viewMonth]}
              </span>
              <button onClick={nextMonth} className="p-1.5 rounded-lg text-gray-500">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-5 px-5 pt-2.5 pb-1">
            {dates.map((d, i) => {
              const selected = isSelectedDate(d)
              const isSunday = d.getDay() === 0
              const ymd = ymdFromLocalDate(d)
              const w = wxBy.get(ymd)
              const best = ymd === bestYmd
              return (
                <button
                  key={i}
                  onClick={() => { userPickedDateRef.current = true; setSelectedDate(d); setSelectedSlot(null); lightTap() }}
                  className={`relative shrink-0 w-14 ${w ? 'h-[84px]' : 'h-[72px]'} rounded-[14px] border flex flex-col items-center justify-center gap-0.5 transition-all ${
                    selected
                      ? 'border-washio-cyan text-white'
                      : best
                      ? 'bg-washio-cyan/5 border-dashed border-washio-cyan/60 text-washio-navy'
                      : isSunday
                      ? 'bg-gray-100 border-washio-border text-gray-400'
                      : 'bg-white border-washio-border text-washio-navy'
                  }`}
                  style={selected ? { background: 'linear-gradient(160deg, #19A8C7 0%, #078EAD 100%)', boxShadow: '0 6px 16px rgba(25,168,199,0.35)' } : undefined}
                >
                  <span
                    className={`text-[11px] font-medium uppercase tracking-wider ${
                      selected ? 'text-white/70' : isSunday ? 'text-gray-400' : 'text-gray-500'
                    }`}
                  >
                    {DAYS_JS_L[locale][d.getDay()]}
                  </span>
                  <span className={`text-[20px] font-semibold tracking-tight ${selected ? 'text-white' : isSunday ? 'text-gray-400' : 'text-washio-navy'}`}>
                    {d.getDate()}
                  </span>
                  {w && (
                    <span className={`text-[13px] leading-none ${isWet(w) && !selected ? 'opacity-90' : ''}`} aria-label={w.kind}>
                      {wxEmoji(w.kind)}
                    </span>
                  )}
                  {best && (
                    <span className={`absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 rounded-full text-[8.5px] font-bold uppercase tracking-wide whitespace-nowrap ${selected ? 'bg-white text-washio-cyan' : 'bg-washio-cyan text-white'}`}>
                      {t.bestDay}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Καιρός: προτεινόμενη μέρα / προειδοποίηση βροχής για την επιλεγμένη */}
          {bestYmd && (() => {
            const [, bm, bd] = bestYmd.split('-').map(Number)
            const bDate = new Date(Number(bestYmd.slice(0, 4)), bm - 1, bd)
            const label = `${DAYS_JS_L[locale][bDate.getDay()]} ${bd}/${bm}`
            const selWet = isWet(selWx)
            return (
              <div className={`mt-3 rounded-[12px] px-3 py-2.5 flex items-center gap-2.5 ${selWet ? 'bg-amber-50 border border-amber-200' : 'bg-washio-cyan/5 border border-washio-cyan/20'}`}>
                <span className="text-[18px] leading-none">{selWet ? wxEmoji(selWx!.kind) : '☀️'}</span>
                <p className="flex-1 text-[12px] leading-snug text-washio-navy">
                  {selWet ? (
                    <><b>{t.rainWarn} ({selWx!.prob}%)</b> · {t.rainTry} <b>{label}</b></>
                  ) : (
                    <><b>{t.bestHint}: {label}</b> · {t.bestWhy}</>
                  )}
                </p>
                {selYmd !== bestYmd && (
                  <button onClick={() => pickYmd(bestYmd)} className="shrink-0 text-[11px] font-semibold text-washio-cyan border border-washio-cyan/40 rounded-full px-2.5 py-1">
                    {t.pick}
                  </button>
                )}
              </div>
            )
          })()}

          {/* Time slots */}
          <p className="text-[11px] font-bold text-washio-navy/70 tracking-[1.4px] uppercase mt-6 mb-2.5">
            {t.time} · {selectedDate.getDate()} {MONTHS_SHORT_L[locale][selectedDate.getMonth()]}
          </p>
          {slotsLoading ? (
            <WashioLoader label={t.loadingHours} />
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
                      className="h-11 rounded-xl border border-washio-border bg-gray-100 flex items-center justify-center text-[14px] font-semibold text-gray-300"
                      style={{ textDecoration: 'line-through' }}
                    >
                      {slot.time}
                    </div>
                  )
                }
                return (
                  <button
                    key={slot.id}
                    onClick={() => { userPickedSlotRef.current = true; setSelectedSlot(slot.id); lightTap(); funnel('slot_select', { locationId: location?.id, meta: { src: 'page' } }) }}
                    className={`h-11 rounded-xl border text-[14px] font-semibold transition-all ${
                      selected
                        ? 'bg-washio-cyan border-washio-cyan text-white shadow-[0_4px_12px_rgba(25,168,199,0.30)]'
                        : 'bg-white border-washio-border text-washio-navy'
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
            background: 'linear-gradient(180deg, rgba(247,250,252,0) 0%, #F7FAFC 28%)',
          }}
        >
          {canBook ? (
            <button
              onClick={() => { funnel('book_click', { locationId: location.id, meta: { src: 'page', svc: service?.name || '', price: Number(selectedServicePrice) || 0, disc: service ? discFor(service) : 0, guest: coupon.guest, slot_auto: !userPickedSlotRef.current } }); router.push(`/booking?location=${location.id}&service=${selectedServiceId}&slot=${encodeURIComponent(selectedSlot!)}&date=${ymdFromLocalDate(selectedDate)}&vehicleType=${encodeURIComponent(vehicleType)}${carChoice?.label ? `&carModel=${encodeURIComponent(carChoice.label)}` : ''}`) }}
              className="w-full h-14 rounded-2xl text-white text-[15px] font-semibold tracking-tight flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
              style={{ background: 'linear-gradient(135deg, #19A8C7 0%, #078EAD 100%)', boxShadow: '0 10px 24px rgba(25,168,199,0.38)' }}
            >
              <span>{t.book} · {dayWord(selectedDate)} {selectedSlot}</span>
              <span className="w-px h-4 bg-white/25" />
              <span>{service && discFor(service) > 0 ? `€${eur((Number(priceFor(service)) || 0) - discFor(service))}` : service ? priceLabel(service) : `€${selectedServicePrice}`}</span>
            </button>
          ) : (
            <div className="w-full h-14 rounded-2xl bg-white border border-washio-border text-gray-400 text-[14px] font-medium flex items-center justify-center">
              {t.selectPrompt}
            </div>
          )}
          <p className="text-center text-[12px] text-gray-500 mt-2">{t.reassure}</p>
        </div>

      </div>
    </main>
  )
}