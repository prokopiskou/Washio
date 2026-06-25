'use client'

import { Suspense, useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search, X, ChevronRight, Clock, Calendar, ChevronDown, AlertTriangle, MapPin, Locate, SlidersHorizontal, Home as HomeIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { track } from '@vercel/analytics'
import { athensToday, athensMinutesOfDay } from '@/lib/time'

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
  price_moto?: number
}

type Slot = {
  time: string
  available: boolean
}

type Timing = 'now' | 'later'

const BUFFER_MINUTES = 15
const TIGHT_SLOT_THRESHOLD = 20

function generateSlots(openTime: string, closeTime: string): string[] {
  const slots: string[] = []
  const [openH, openM] = openTime.split(':').map(Number)
  const [closeH, closeM] = closeTime.split(':').map(Number)
  let current = openH * 60 + openM
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
  return athensToday()
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
  const [h, m] = slotTime.split(':').map(Number)
  const slotMinutes = h * 60 + m
  const nowMinutes = athensMinutesOfDay()
  return slotMinutes - nowMinutes
}

// Mapbox-Light style for Google Maps
const COOL_MAP_STYLES = [
  { elementType: 'geometry', stylers: [{ color: '#EEF0F2' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#A7AAB0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#EEF0F2' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#DEE6EC' }] },
  { featureType: 'landscape.natural', stylers: [{ color: '#E6EBE7' }] },
]

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
  const [vehicleType, setVehicleType] = useState<'ΙΧ' | 'Μοτοσικλέτα'>('ΙΧ')
  const timePickerRef = useRef<HTMLDivElement>(null)

  const activeDate = timing === 'now' ? getTodayValue() : selectedDate

  const visibleServices = locationServices.filter(s => {
    if (vehicleType === 'ΙΧ') return s.name !== 'Πλύσιμο'
    if (vehicleType === 'Μοτοσικλέτα') return s.name === 'Πλύσιμο'
    return true
  })

  const service = visibleServices.find(s => s.id === selectedService)
  const selectedServicePrice = service ? (vehicleType === 'Μοτοσικλέτα' && service.price_moto ? service.price_moto : service.price) : undefined
  const canBook = selectedService && selectedSlot

  // Get price for marker (lowest available service price for ΙΧ)
  const getMarkerPrice = (loc: Location): number | null => {
    // We don't have services loaded here, so return null and use distance/availability
    return null
  }

  const loadLocations = useCallback(async (lat?: number, lng?: number) => {
    const supabase = createClient()
    const dayOfWeek = jsDayToSupabase(new Date(`${getTodayValue()}T12:00:00`).getDay())
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
          const nowMinutes = athensMinutesOfDay()
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
    track('map_viewed')
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
      const { data } = await supabase.from('services').select('id, name, price, price_moto')
        .eq('location_id', selectedLocation.id).eq('is_active', true).order('sort_order', { ascending: true })
      setLocationServices((data as Service[]) || [])
    }
    loadServices()
  }, [selectedLocation])

  useEffect(() => {
    if (!selectedLocation) return
    const loadSlots = async () => {
      const supabase = createClient()
      const today = new Date()
      const checkDate = timing === 'now'
        ? `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        : selectedDate
      const dateObj = new Date(checkDate)
      const dayOfWeek = jsDayToSupabase(dateObj.getDay())

      const { data: exceptionData } = await supabase
        .from('location_hours_exceptions')
        .select('periods, is_closed')
        .eq('location_id', selectedLocation.id)
        .eq('exception_date', checkDate)
        .maybeSingle()

      let allTimes: string[] = []

      if (exceptionData) {
        if (exceptionData.is_closed) { setSlots([]); return }
        for (const period of exceptionData.periods) {
          allTimes = [...allTimes, ...generateSlots(period.open, period.close)]
        }
      } else {
        const { data: hoursData } = await supabase.from('location_hours')
          .select('open_time, close_time, is_closed')
          .eq('location_id', selectedLocation.id).eq('day_of_week', dayOfWeek).single()
        if (!hoursData || hoursData.is_closed) { setSlots([]); return }
        allTimes = generateSlots(hoursData.open_time, hoursData.close_time)
      }

      const { data: bookedData } = await supabase.from('bookings').select('slot_start_time')
        .eq('location_id', selectedLocation.id).eq('slot_date', checkDate).not('status', 'in', '("cancelled")')

      const bookedTimes = new Set((bookedData || []).map((b: any) => b.slot_start_time?.slice(0, 5)))
      const isToday = checkDate === getTodayValue()

      const computedSlots = allTimes.map(time => {
        const [h, m] = time.split(':').map(Number)
        const slotMinutes = h * 60 + m
        const nowMinutes = athensMinutesOfDay()
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

    const bookingUrl = `/booking?location=${selectedLocation.id}&service=${selectedService}&slot=${encodeURIComponent(selectedSlot!)}&date=${activeDate}&vehicleType=${encodeURIComponent(vehicleType)}`

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

  const handleLocateMe = () => {
    if (userLat && userLng && mapInstanceRef.current) {
      mapInstanceRef.current.panTo({ lat: userLat, lng: userLng })
      mapInstanceRef.current.setZoom(15)
    }
  }

  const updateMarkers = useCallback(() => {
    if (!mapLoaded || !mapInstanceRef.current) return
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []

    filteredLocations.forEach(loc => {
      const isSelected = selectedLocation?.id === loc.id
      const svgString = `
  <svg xmlns="http://www.w3.org/2000/svg" width="44" height="50" viewBox="0 0 44 50">
    <defs>
      <filter id="shadow-${loc.id}" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.15"/>
      </filter>
    </defs>
    <g filter="url(#shadow-${loc.id})">
      <circle cx="22" cy="18" r="16" fill="${isSelected ? '#0A0A0A' : '#FFFFFF'}" stroke="rgba(0,0,0,0.06)" stroke-width="1"/>
      <circle cx="22" cy="18" r="5" fill="${isSelected ? '#FFFFFF' : '#0A0A0A'}"/>
      <path d="M16 32 L22 42 L28 32 Z" fill="${isSelected ? '#0A0A0A' : '#FFFFFF'}"/>
    </g>
  </svg>
`

      const marker = new window.google.maps.Marker({
        position: { lat: loc.lat, lng: loc.lng },
        map: mapInstanceRef.current,
        icon: {
          url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svgString),
          scaledSize: new window.google.maps.Size(44, 50),
          anchor: new window.google.maps.Point(22, 42),
        },
      })
      marker.addListener('click', () => selectLocation(loc))
      markersRef.current.push(marker)
    })
  }, [mapLoaded, filteredLocations, selectedLocation])

  useEffect(() => { updateMarkers() }, [updateMarkers])

  useEffect(() => {
    window.initMap = () => {
      if (!mapRef.current) return
      const map = new window.google.maps.Map(mapRef.current, {
        center: { lat: 37.8878, lng: 23.7436 },
        zoom: 13,
        disableDefaultUI: true,
        styles: COOL_MAP_STYLES,
      })
      mapInstanceRef.current = map
      autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService()
      placesServiceRef.current = new window.google.maps.places.PlacesService(map)
      setMapLoaded(true)
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&callback=initMap&libraries=places&loading=async`
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
      <div className="w-full max-w-md md:max-w-none relative overflow-hidden" style={{ height: '100dvh' }}>

        {/* Top controls — search + time chips */}
        <div className="absolute top-0 left-0 right-0 z-10 px-4 pt-14 flex flex-col gap-2.5">

          {/* Search row */}
          <div ref={searchContainerRef} className="relative flex gap-2.5">
            <div className="flex-1 h-12 bg-white rounded-xl flex items-center px-3.5 gap-2.5"
                 style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)' }}>
              <Search size={18} className="text-gray-500 shrink-0" />
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setShowSuggestions(true) }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Αναζήτηση περιοχής"
                className="flex-1 text-sm text-gray-900 placeholder-gray-500 focus:outline-none bg-transparent"
                autoFocus={params.get('source') === 'search'}
              />
            </div>
            <button
              onClick={() => router.push('/')}
              className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-gray-900 shrink-0"
              style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)' }}
            >
              <X size={18} />
            </button>

            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-14 left-0 right-14 bg-white rounded-xl shadow-lg border border-gray-100 py-1 overflow-hidden z-20">
                {suggestions.map(suggestion => (
                  <button key={suggestion.place_id} onClick={() => handleSelectSuggestion(suggestion)}
                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                    {suggestion.description}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Segmented time chip */}
          <div className="inline-flex bg-white rounded-full p-1 self-start"
               style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)' }}>
            <button
              onClick={() => { setTiming('now'); setSelectedTime(''); setSelectedSlot(null) }}
              className={`px-3.5 py-2 rounded-full text-[13px] font-semibold tracking-tight flex items-center gap-1.5 transition-all ${
                timing === 'now' ? 'bg-gray-900 text-white' : 'text-gray-500'
              }`}
            >
              {timing === 'now' && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
              Τώρα
            </button>
            <button
              onClick={() => setShowSchedule(true)}
              className={`px-3.5 py-2 rounded-full text-[13px] font-medium tracking-tight flex items-center gap-1.5 transition-all ${
                timing === 'later' ? 'bg-gray-900 text-white font-semibold' : 'text-gray-500'
              }`}
            >
              <Clock size={13} />
              {formattedSchedule || 'Προγραμματισμός'}
            </button>
          </div>
        </div>

        {/* Locate-me FAB */}
        {userLat && userLng && (
          <button
            onClick={handleLocateMe}
            className="absolute right-4 top-44 z-10 w-11 h-11 bg-white rounded-xl flex items-center justify-center text-gray-900"
            style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.04)' }}
          >
            <Locate size={18} />
          </button>
        )}

        <div ref={mapRef} className="w-full h-full" />

        {!mapLoaded && (
          <div className="absolute inset-0 bg-gray-50 flex items-center justify-center">
            <p className="text-xs text-gray-400">Φόρτωση χάρτη...</p>
          </div>
        )}

        {/* Bottom Sheet */}
        <div className="absolute left-0 right-0 z-15" style={{ bottom: 'calc(56px + env(safe-area-inset-bottom))' }}>

          {/* Collapsed peek — list of locations */}
          {!selectedLocation && filteredLocations.length > 0 && (
            <div className="bg-white rounded-t-2xl"
                 style={{ boxShadow: '0 -8px 24px rgba(0,0,0,0.06), 0 -1px 0 rgba(0,0,0,0.04)' }}>
              {/* Drag handle */}
              <div className="flex justify-center pt-2 pb-2">
                <div className="w-9 h-1 rounded-full bg-gray-200" />
              </div>

              {/* Header */}
              <div className="flex justify-between items-baseline px-5 pb-2">
                <p className="text-[14px] font-semibold tracking-tight text-gray-900">
                  {filteredLocations.length} {filteredLocations.length === 1 ? 'πλυντήριο' : 'πλυντήρια'} κοντά
                </p>
                <p className="text-[12px] font-medium text-blue-600">Λίστα</p>
              </div>

              {/* Horizontal compact cards */}
              <div className="flex gap-2.5 overflow-x-auto scrollbar-hide px-4 pb-3">
                {filteredLocations.map(loc => (
                  <button
                    key={loc.id}
                    onClick={() => selectLocation(loc)}
                    className="shrink-0 w-[220px] bg-white rounded-xl p-3 border border-gray-100 flex flex-col gap-1 text-left"
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
                  >
                    <div className="flex justify-between items-start gap-2">
                      <p className="text-[13px] font-semibold tracking-tight text-gray-900 leading-tight truncate">{loc.name}</p>
                      {timing === 'now' && loc.nextSlot && (
                        <p className="text-[13px] font-semibold text-green-600 shrink-0">{loc.nextSlot}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-gray-500">{loc.city}</span>
                      {loc.distance !== undefined && (
                        <>
                          <span className="w-[3px] h-[3px] rounded-full bg-gray-300" />
                          <span className="text-[11px] text-gray-500">{formatDistance(loc.distance)}</span>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* No availability */}
          {!selectedLocation && filteredLocations.length === 0 && allLocations.length > 0 && (
            <div className="bg-white rounded-t-2xl p-4"
                 style={{ boxShadow: '0 -8px 24px rgba(0,0,0,0.06)' }}>
              <div className="flex justify-center pb-3">
                <div className="w-9 h-1 rounded-full bg-gray-200" />
              </div>
              <div className="text-center">
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

          {/* Selected location — booking flow */}
          {selectedLocation && (
            <div className="bg-white rounded-t-2xl px-5 pt-3 pb-5"
                 style={{ boxShadow: '0 -8px 24px rgba(0,0,0,0.06)' }}>
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-[16px] font-semibold tracking-tight text-gray-900">{selectedLocation.name}</p>
                  {selectedLocation.distance !== undefined && (
                    <p className="text-xs text-gray-500 mt-0.5">{formatDistance(selectedLocation.distance)} · {selectedLocation.city}</p>
                  )}
                </div>
                <button onClick={() => setSelectedLocation(null)} className="text-gray-400 -mt-1 -mr-1 p-1">
                  <X size={18} />
                </button>
              </div>

              {/* Vehicle type segmented */}
              <div className="flex gap-2 mb-3">
                {(['ΙΧ', 'Μοτοσικλέτα'] as const).map(type => (
                  <button key={type} onClick={() => setVehicleType(type)}
                    className={`px-4 py-2 rounded-full text-[13px] font-semibold border transition-all ${
                      vehicleType === type
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-700 border-gray-200'
                    }`}>
                    {type === 'ΙΧ' ? 'ΙΧ' : 'Μοτο'}
                  </button>
                ))}
              </div>

              {/* Services */}
              <div className="flex gap-2 mb-3">
                {visibleServices.map(s => {
                  const price = vehicleType === 'Μοτοσικλέτα' && s.price_moto ? s.price_moto : s.price
                  const isSelected = selectedService === s.id
                  return (
                    <button key={s.id} onClick={() => setSelectedService(s.id)}
                      className={`flex-1 py-2.5 rounded-xl border text-center transition-all ${
                        isSelected ? 'bg-gray-900 border-gray-900' : 'bg-white border-gray-200'
                      }`}>
                      <p className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-gray-900'}`}>{s.name}</p>
                      <p className={`text-xs mt-0.5 ${isSelected ? 'text-white/70' : 'text-gray-500'}`}>€{price}</p>
                    </button>
                  )
                })}
              </div>

              {/* Time slots */}
              {selectedService && (
                <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide pb-1">
                  {visibleSlots.length === 0 ? (
                    <p className="text-xs text-gray-500">Δεν υπάρχουν διαθέσιμες ώρες.</p>
                  ) : (
                    visibleSlots.map(slot => {
                      const isSelected = selectedSlot === slot.time
                      return (
                        <button key={slot.time} onClick={() => setSelectedSlot(slot.time)}
                          className={`shrink-0 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                            isSelected
                              ? 'bg-gray-900 border-gray-900 text-white'
                              : 'bg-white border-gray-200 text-gray-900'
                          }`}>
                          {slot.time}
                        </button>
                      )
                    })
                  )}
                </div>
              )}

              {/* CTAs */}
              <div className="flex gap-2">
                {canBook ? (
                  <button
                    onClick={handleBookingAttempt}
                    className="flex-1 bg-gray-900 text-white text-sm font-semibold py-3.5 rounded-xl flex items-center justify-center gap-1.5">
                    <span>Κράτηση</span>
                    <span className="w-px h-4 bg-white/25" />
                    <span>€{selectedServicePrice}</span>
                  </button>
                ) : (
                  <div className="flex-1 bg-gray-100 text-gray-400 text-sm font-medium py-3.5 rounded-xl flex items-center justify-center">
                    Επίλεξε υπηρεσία
                  </div>
                )}
                <button
                  onClick={() => router.push(`/locations/${selectedLocation.slug}`)}
                  className="border border-gray-200 text-gray-600 text-xs px-3 py-3.5 rounded-xl font-medium">
                  Άλλη μέρα
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Nav */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-20 flex justify-around items-center py-3 border-t border-gray-100 bg-white" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <Link href="/" className="flex flex-col items-center gap-1 text-gray-300">
            <HomeIcon size={18} />
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