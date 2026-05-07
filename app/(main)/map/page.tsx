'use client'

import { Suspense, useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, X, ChevronRight, Clock, Calendar, ChevronDown, AlertTriangle, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

declare global {
  interface Window { google: any; initMap: () => void }
}

type Location = {
  id: string
  name: string
  address: string
  city: string
  slug: string
  lat: number
  lng: number
  distance?: number
  bookingCount?: number
  hasAvailability?: boolean
  nextSlot?: string | null
}

type Service = {
  id: string
  name: string
  price: number
}

type Slot = {
  time: string
  available: boolean
}

type Timing = 'now' | 'later'

const BUFFER_MINUTES = 15
const TIGHT_SLOT_THRESHOLD = 20 // λεπτά — αν το slot είναι εντός 20 λεπτών → προειδοποίηση

function generateSlots(openTime: string, closeTime: string): string[] {
  const slots: string[] = []
  const [openH, openM] = openTime.split(':').map(Number)
  const [closeH, closeM] = closeTime.split(':').map(Number)
  let current = openH * 60 + openM
  const end = closeH * 60 + closeTime.split(':').map(Number)[1]
  const endMinutes = closeH * 60 + closeM
  while (current < endMinutes) {
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

function getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} μ`
  return `${km.toFixed(1)} χλμ`
}

function getTodayValue() {
  return new Date().toISOString().split('T')[0]
}

function getTimeSlots() {
  const slots: string[] = []
  for (let h = 8; h < 22; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`)
    slots.push(`${String(h).padStart(2, '0')}:30`)
  }
  return slots
}

function getMinutesUntilSlot(slotTime: string): number {
  const now = new Date()
  const [h, m] = slotTime.split(':').map(Number)
  const slotMinutes = h * 60 + m
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  return slotMinutes - nowMinutes
}

function MapPageContent() {
  const router = useRouter()
  const params = useSearchParams()
  const mapRef = useRef<HTMLDivElement>(null)
  const searchContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const autocompleteServiceRef = useRef<any>(null)
  const placesServiceRef = useRef<any>(null)

  const [mapLoaded, setMapLoaded] = useState(false)
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)
  const [allLocations, setAllLocations] = useState<Location[]>([])
  const [filteredLocations, setFilteredLocations] = useState<Location[]>([])
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null)
  const [locationServices, setLocationServices] = useState<Service[]>([])
  const [selectedService, setSelectedService] = useState<string | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showTightSlotModal, setShowTightSlotModal] = useState(false)
  const [pendingBookingUrl, setPendingBookingUrl] = useState<string | null>(null)
  const [minutesUntilSlot, setMinutesUntilSlot] = useState(0)

  const [timing, setTiming] = useState<Timing>('now')
  const [showSchedule, setShowSchedule] = useState(false)
  const [selectedDate, setSelectedDate] = useState(getTodayValue())
  const [selectedTime, setSelectedTime] = useState('')
  const [showTimePicker, setShowTimePicker] = useState(false)
  const timePickerRef = useRef<HTMLDivElement>(null)

  const activeDate = timing === 'now' ? getTodayValue() : selectedDate
  const service = locationServices.find(s => s.id === selectedService)
  const canBook = selectedService && selectedSlot

  const loadLocations = useCallback(async (lat?: number, lng?: number) => {
    const supabase = createClient()
    const now = new Date()
    const dayOfWeek = jsDayToSupabase(now.getDay())
    const checkDate = timing === 'later' ? selectedDate : getTodayValue()
    const checkTime = timing === 'later' ? selectedTime : null

    const [{ data: locsData }, { data: hoursData }, { data: bookingsData }] = await Promise.all([
      supabase.from('locations').select('id, name, address, city, slug, lat, lng').eq('is_active', true),
      supabase.from('location_hours').select('location_id, open_time, close_time, is_closed').eq('day_of_week', dayOfWeek),
      supabase.from('bookings').select('location_id, slot_start_time').eq('slot_date', checkDate).not('status', 'in', '("cancelled")'),
    ])

    const hoursMap: Record<string, any> = {}
    ;(hoursData || []).forEach((h: any) => { hoursMap[h.location_id] = h })

    const bookingsMap: Record<string, Set<string>> = {}
    ;(bookingsData || []).forEach((b: any) => {
      if (!bookingsMap[b.location_id]) bookingsMap[b.location_id] = new Set()
      bookingsMap[b.location_id].add(b.slot_start_time?.slice(0, 5))
    })

    let locs: Location[] = (locsData || []).map((loc: any) => {
      const hours = hoursMap[loc.id]
      let hasAvailability = false
      let nextSlot: string | null = null

      if (hours && !hours.is_closed) {
        const allSlots = generateSlots(hours.open_time, hours.close_time)
        const booked = bookingsMap[loc.id] || new Set()

        if (timing === 'later' && checkTime) {
          hasAvailability = allSlots.includes(checkTime) && !booked.has(checkTime)
          nextSlot = checkTime
        } else {
          const nowMinutes = now.getHours() * 60 + now.getMinutes()
          const maxMinutes = nowMinutes + 60

          nextSlot = allSlots.find(t => {
            const [h, m] = t.split(':').map(Number)
            const slotMinutes = h * 60 + m
            return slotMinutes >= nowMinutes + BUFFER_MINUTES
              && slotMinutes <= maxMinutes
              && !booked.has(t)
          }) || null

          hasAvailability = nextSlot !== null
        }
      }

      return {
        ...loc,
        distance: lat && lng ? getDistance(lat, lng, loc.lat, loc.lng) : undefined,
        hasAvailability,
        nextSlot,
        bookingCount: (bookingsMap[loc.id]?.size || 0),
      }
    })

    if (lat && lng) {
      locs = locs.sort((a, b) => (a.distance || 0) - (b.distance || 0))
    } else {
      locs = locs.sort((a, b) => (b.bookingCount || 0) - (a.bookingCount || 0))
    }

    setAllLocations(locs)
    const available = locs.filter(l => l.hasAvailability)

    if (timing === 'now') {
      available.sort((a, b) => {
        if (!a.nextSlot || !b.nextSlot) return 0
        return a.nextSlot.localeCompare(b.nextSlot)
      })
    }

    setFilteredLocations(available)
  }, [timing, selectedDate, selectedTime])

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => {
        setUserLat(pos.coords.latitude)
        setUserLng(pos.coords.longitude)
        loadLocations(pos.coords.latitude, pos.coords.longitude)
        mapInstanceRef.current?.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        mapInstanceRef.current?.setZoom(14)
      },
      () => loadLocations()
    )
  }, [])

  useEffect(() => {
    if (allLocations.length > 0) {
      loadLocations(userLat ?? undefined, userLng ?? undefined)
    }
  }, [timing, selectedDate, selectedTime])

  useEffect(() => {
    if (!selectedLocation) return
    const loadServices = async () => {
      const supabase = createClient()
      const { data } = await supabase.from('services').select('id, name, price')
        .eq('location_id', selectedLocation.id).eq('is_active', true).order('sort_order', { ascending: true })
      setLocationServices((data as Service[]) || [])
    }
    loadServices()
  }, [selectedLocation])

  useEffect(() => {
    if (!selectedLocation) return
    const loadSlots = async () => {
      const supabase = createClient()
      const checkDate = timing === 'now' ? getTodayValue() : selectedDate
      const dateObj = new Date(checkDate)
      const dayOfWeek = jsDayToSupabase(dateObj.getDay())

      const { data: hoursData } = await supabase.from('location_hours')
        .select('open_time, close_time, is_closed')
        .eq('location_id', selectedLocation.id).eq('day_of_week', dayOfWeek).single()

      if (!hoursData || hoursData.is_closed) { setSlots([]); return }

      const allTimes = generateSlots(hoursData.open_time, hoursData.close_time)

      const { data: bookedData } = await supabase.from('bookings').select('slot_start_time')
        .eq('location_id', selectedLocation.id).eq('slot_date', checkDate).not('status', 'in', '("cancelled")')

      const bookedTimes = new Set((bookedData || []).map((b: any) => b.slot_start_time?.slice(0, 5)))
      const now = new Date()
      const isToday = checkDate === getTodayValue()

      const computedSlots = allTimes.map(time => {
        const [h, m] = time.split(':').map(Number)
        const slotMinutes = h * 60 + m
        const nowMinutes = now.getHours() * 60 + now.getMinutes()
        const isPast = isToday && slotMinutes < nowMinutes + BUFFER_MINUTES
        return { time, available: !bookedTimes.has(time) && !isPast }
      })

      setSlots(computedSlots)

      if (timing === 'later' && selectedTime) {
        const isAvailable = computedSlots.find(s => s.time === selectedTime && s.available)
        if (isAvailable) setSelectedSlot(selectedTime)
      } else if (timing === 'now') {
        const next = computedSlots.find(s => s.available)
        if (next) setSelectedSlot(next.time)
      }
    }
    loadSlots()
  }, [selectedLocation, timing, selectedDate, selectedTime])

  const selectLocation = (loc: Location) => {
    setSelectedLocation(loc)
    setSelectedService(null)
    setSelectedSlot(null)
    mapInstanceRef.current?.panTo({ lat: loc.lat, lng: loc.lng })
  }

  const visibleSlots = (() => {
    const available = slots.filter(s => s.available)
    if (timing === 'now') return available

    if (timing === 'later' && selectedSlot) {
      const idx = available.findIndex(s => s.time === selectedSlot)
      if (idx === -1) return available
      const start = Math.max(0, idx - 2)
      const end = Math.min(available.length, idx + 3)
      return available.slice(start, end)
    }
    return available
  })()

  const handleBookingAttempt = () => {
    if (!canBook || !selectedLocation) return

    const bookingUrl = `/booking?location=${selectedLocation.id}&service=${selectedService}&slot=${encodeURIComponent(selectedSlot!)}&date=${activeDate}`

    // Έλεγχος αν το slot είναι πολύ κοντά (εντός 20 λεπτών) — μόνο για σήμερα
    if (timing === 'now' && activeDate === getTodayValue()) {
      const minutes = getMinutesUntilSlot(selectedSlot!)
      if (minutes <= TIGHT_SLOT_THRESHOLD) {
        setMinutesUntilSlot(minutes)
        setPendingBookingUrl(bookingUrl)
        setShowTightSlotModal(true)
        return
      }
    }

    router.push(bookingUrl)
  }

  const updateMarkers = useCallback(() => {
    if (!mapLoaded || !mapInstanceRef.current) return
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []

    filteredLocations.forEach(loc => {
      const marker = new window.google.maps.Marker({
        position: { lat: loc.lat, lng: loc.lng },
        map: mapInstanceRef.current,
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 20,
          fillColor: '#0A0A0A',
          fillOpacity: 1,
          strokeWeight: 0,
        },
        label: { text: '⛽', color: '#fff', fontSize: '12px' },
      })
      marker.addListener('click', () => selectLocation(loc))
      markersRef.current.push(marker)
    })
  }, [mapLoaded, filteredLocations])

  useEffect(() => { updateMarkers() }, [updateMarkers])

  useEffect(() => {
    window.initMap = () => {
      if (!mapRef.current) return
      const map = new window.google.maps.Map(mapRef.current, {
        center: { lat: 37.8878, lng: 23.7436 },
        zoom: 13,
        disableDefaultUI: true,
        styles: [
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', stylers: [{ visibility: 'off' }] },
        ],
      })
      mapInstanceRef.current = map
      autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService()
      placesServiceRef.current = new window.google.maps.places.PlacesService(map)
      setMapLoaded(true)
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&callback=initMap&libraries=places`
    script.async = true
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [])

  useEffect(() => {
    if (!search.trim() || !autocompleteServiceRef.current || !window.google?.maps?.places) {
      setSuggestions([]); return
    }
    const timeoutId = window.setTimeout(() => {
      autocompleteServiceRef.current.getPlacePredictions(
        { input: search, componentRestrictions: { country: 'gr' } },
        (predictions: any[] | null, status: string) => {
          setSuggestions(status === window.google.maps.places.PlacesServiceStatus.OK && predictions ? predictions : [])
        }
      )
    }, 200)
    return () => window.clearTimeout(timeoutId)
  }, [search])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!searchContainerRef.current?.contains(event.target as Node)) setShowSuggestions(false)
      if (timePickerRef.current && !timePickerRef.current.contains(event.target as Node)) setShowTimePicker(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelectSuggestion = (prediction: any) => {
    if (!placesServiceRef.current || !mapInstanceRef.current) return
    placesServiceRef.current.getDetails(
      { placeId: prediction.place_id, fields: ['geometry', 'name'] },
      (place: any, status: string) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) return
        mapInstanceRef.current.panTo(place.geometry.location)
        mapInstanceRef.current.setZoom(15)
        setSearch(place.name || prediction.description || '')
        setShowSuggestions(false)
      }
    )
  }

  const handleApplySchedule = () => {
    setTiming('later')
    setShowSchedule(false)
  }

  const formattedSchedule = timing === 'later' && selectedDate && selectedTime
    ? `${new Date(selectedDate).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })} · ${selectedTime}`
    : null

  const mapsUrl = selectedLocation
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${selectedLocation.address}, ${selectedLocation.city}`)}`
    : '#'

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md h-screen relative overflow-hidden">

        <div className="absolute top-0 left-0 right-0 z-10 px-4 pt-4 flex flex-col gap-2">
          <div ref={searchContainerRef} className="relative">
            <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm">
              <button onClick={() => router.push('/')} className="text-gray-400 shrink-0">
                <ArrowLeft size={16} />
              </button>
              <input type="text" value={search}
                onChange={e => { setSearch(e.target.value); setShowSuggestions(true) }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Αναζήτηση περιοχής..."
                className="flex-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none bg-transparent"
                autoFocus={params.get('source') === 'search'} />
            </div>
            {showSuggestions && suggestions.length > 0 && (
              <div className="mt-2 bg-white rounded-xl shadow-sm border border-gray-100 py-1 overflow-hidden">
                {suggestions.map(suggestion => (
                  <button key={suggestion.place_id} onClick={() => handleSelectSuggestion(suggestion)}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                    {suggestion.description}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={() => { setTiming('now'); setSelectedTime(''); setSelectedSlot(null) }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium shadow-sm transition-all ${
                timing === 'now' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-100'
              }`}>
              <Clock size={11} />
              Τώρα
            </button>
            <button onClick={() => setShowSchedule(true)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium shadow-sm transition-all ${
                timing === 'later' ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 border border-gray-100'
              }`}>
              <Calendar size={11} />
              {formattedSchedule || 'Προγραμματισμός'}
            </button>
          </div>
        </div>

        <div ref={mapRef} className="w-full h-full" />

        {!mapLoaded && (
          <div className="absolute inset-0 bg-gray-50 flex items-center justify-center">
            <p className="text-xs text-gray-400">Φόρτωση χάρτη...</p>
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 z-15 pb-16">

          {!selectedLocation && filteredLocations.length > 0 && (
            <div className="pb-4 pt-2">
              <div className="flex gap-3 px-4 overflow-x-auto scrollbar-hide pb-2">
                {filteredLocations.map(loc => (
                  <button key={loc.id} onClick={() => selectLocation(loc)}
                    className="min-w-[200px] bg-white rounded-2xl p-4 shrink-0 text-left shadow-lg border border-gray-100">
                    <p className="text-sm font-semibold text-gray-900 mb-1">{loc.name}</p>
                    {loc.distance !== undefined && (
                      <p className="text-xs text-gray-400 mb-1">{formatDistance(loc.distance)}</p>
                    )}
                    {timing === 'now' && loc.nextSlot && (
                      <p className="text-xs text-green-600 font-medium">Διαθέσιμο από {loc.nextSlot}</p>
                    )}
                    {timing === 'later' && (
                      <p className="text-xs text-blue-600 font-medium">
                        {new Date(selectedDate).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })} · {selectedTime}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!selectedLocation && filteredLocations.length === 0 && allLocations.length > 0 && (
            <div className="pb-6 px-4">
              <div className="bg-white rounded-2xl p-5 shadow-lg border border-gray-100 text-center">
                <p className="text-sm font-medium text-gray-700 mb-1">Δεν υπάρχουν διαθέσιμα σημεία</p>
                <p className="text-xs text-gray-400 mb-4">Δοκίμασε να προγραμματίσεις για αργότερα</p>
                <button onClick={() => setShowSchedule(true)}
                  className="w-full bg-gray-900 text-white text-sm font-medium py-3 rounded-xl flex items-center justify-center gap-2">
                  <Calendar size={14} />
                  Προγραμματισμός
                </button>
              </div>
            </div>
          )}

          {selectedLocation && (
            <div className="bg-white rounded-t-3xl shadow-2xl px-4 pt-4 pb-6">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-base font-semibold text-gray-900">{selectedLocation.name}</p>
                  {selectedLocation.distance !== undefined && (
                    <p className="text-xs text-gray-400 mt-0.5">{formatDistance(selectedLocation.distance)}</p>
                  )}
                </div>
                <button onClick={() => setSelectedLocation(null)} className="text-gray-300">
                  <X size={16} />
                </button>
              </div>

              <div className="flex gap-2 mb-3">
                {locationServices.map(s => (
                  <button key={s.id} onClick={() => setSelectedService(s.id)}
                    className={`flex-1 py-2.5 rounded-xl border text-center transition-all ${
                      selectedService === s.id ? 'bg-gray-600 border-gray-600' : 'bg-white border-gray-200'
                    }`}>
                    <p className={`text-xs font-medium ${selectedService === s.id ? 'text-white' : 'text-gray-900'}`}>{s.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">€{s.price}</p>
                  </button>
                ))}
              </div>

              {selectedService && (
                <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide pb-1">
                  {visibleSlots.length === 0 ? (
                    <p className="text-xs text-gray-400">Δεν υπάρχουν διαθέσιμες ώρες.</p>
                  ) : (
                    visibleSlots.map(slot => (
                      <button key={slot.time} onClick={() => setSelectedSlot(slot.time)}
                        className={`shrink-0 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                          selectedSlot === slot.time
                            ? 'bg-gray-600 border-gray-600 text-white'
                            : 'bg-white border-gray-200 text-gray-700'
                        }`}>
                        {slot.time}
                      </button>
                    ))
                  )}
                </div>
              )}

              <div className="flex gap-2">
                {canBook ? (
                  <button
                    onClick={handleBookingAttempt}
                    className="flex-1 bg-gray-900 text-white text-sm font-medium py-3 rounded-xl flex items-center justify-center gap-1">
                    Κράτηση — €{service?.price}
                    <ChevronRight size={14} />
                  </button>
                ) : (
                  <div className="flex-1 bg-gray-100 text-gray-400 text-sm font-medium py-3 rounded-xl flex items-center justify-center">
                    Επίλεξε υπηρεσία
                  </div>
                )}
                <button onClick={() => router.push(`/locations/${selectedLocation.slug}`)}
                  className="border border-gray-200 text-gray-500 text-xs px-3 py-3 rounded-xl">
                  Άλλη μέρα
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Nav */}
        <nav className="absolute bottom-0 left-0 right-0 z-20 flex justify-around items-center py-3 border-t border-gray-100 bg-white">
          <Link href="/" className="flex flex-col items-center gap-1 text-gray-300">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
            <span className="text-xs">Αρχική</span>
          </Link>
          <button className="flex flex-col items-center gap-1 text-blue-600">
            <MapPin size={18} />
            <span className="text-xs">Εύρεση</span>
          </button>
          <Link href="/profile" className="flex flex-col items-center gap-1 text-gray-300">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span className="text-xs">Προφίλ</span>
          </Link>
        </nav>
      </div>

      {/* Tight Slot Modal */}
      {showTightSlotModal && selectedLocation && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowTightSlotModal(false)} />
          <div className="relative bg-white rounded-t-3xl px-5 pt-6 pb-10 w-full max-w-md z-10">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 bg-amber-50 rounded-full flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-amber-500" />
              </div>
              <p className="text-base font-semibold text-gray-900">
                Το ραντεβού είναι σε {minutesUntilSlot} λεπτά
              </p>
            </div>

            {/* Tappable address → Google Maps */}
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 py-3 mb-4 active:bg-gray-100 transition-colors"
            >
              <MapPin size={14} className="text-gray-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">{selectedLocation.name}</p>
                <p className="text-xs text-gray-400">{selectedLocation.address}, {selectedLocation.city}</p>
              </div>
              <ChevronRight size={14} className="text-gray-300 ml-auto shrink-0" />
            </a>

            <p className="text-sm text-gray-500 mb-6 text-center">
              Αν καθυστερήσεις, το πλύσιμο ενδέχεται να ακυρωθεί από το σημείο.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setShowTightSlotModal(false)}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-3 rounded-xl">
                Επίλεξε άλλη ώρα
              </button>
              <button
                onClick={() => {
                  setShowTightSlotModal(false)
                  if (pendingBookingUrl) router.push(pendingBookingUrl)
                }}
                className="flex-1 bg-gray-900 text-white text-sm font-medium py-3 rounded-xl">
                Κατανοώ, συνέχεια
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Bottom Sheet */}
      {showSchedule && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowSchedule(false)} />
          <div className="relative bg-white rounded-t-3xl px-5 pt-5 pb-10 z-10">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <div className="flex items-center justify-between mb-5">
              <p className="text-base font-semibold text-gray-900">Πότε θέλεις;</p>
              <button onClick={() => setShowSchedule(false)} className="text-gray-400"><X size={18} /></button>
            </div>

            <div className="mb-3">
              <p className="text-xs text-gray-400 mb-1.5">Ημερομηνία</p>
              <div className="relative">
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                  min={getTodayValue()} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                <div className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 flex items-center justify-between bg-gray-50">
                  <span>{new Date(selectedDate).toLocaleDateString('el-GR', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <ChevronDown size={14} className="text-gray-400" />
                </div>
              </div>
            </div>

            <div className="mb-5" ref={timePickerRef}>
              <p className="text-xs text-gray-400 mb-1.5">Ώρα</p>
              <button onClick={() => setShowTimePicker(!showTimePicker)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm flex items-center justify-between bg-gray-50">
                <span className={selectedTime ? 'text-gray-900' : 'text-gray-400'}>
                  {selectedTime || 'Επίλεξε ώρα'}
                </span>
                <ChevronDown size={14} className="text-gray-400" />
              </button>
              {showTimePicker && (
                <div className="mt-1 border border-gray-200 rounded-xl bg-white shadow-md max-h-44 overflow-y-auto">
                  {getTimeSlots().map(slot => (
                    <button key={slot} onClick={() => { setSelectedTime(slot); setShowTimePicker(false) }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        selectedTime === slot ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-50'
                      }`}>
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={handleApplySchedule} disabled={!selectedDate || !selectedTime}
              className="w-full bg-gray-900 text-white text-sm font-medium py-3.5 rounded-xl disabled:opacity-40">
              Εφαρμογή
            </button>
          </div>
        </div>
      )}
    </main>
  )
}

export default function MapPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex flex-col items-center"><div className="w-full max-w-md h-screen flex items-center justify-center"><p className="text-xs text-gray-400">Φόρτωση...</p></div></div>}>
      <MapPageContent />
    </Suspense>
  )
}