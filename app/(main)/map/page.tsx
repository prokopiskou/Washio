'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, X, ChevronRight } from 'lucide-react'
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
  const [locations, setLocations] = useState<Location[]>([])
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null)
  const [locationServices, setLocationServices] = useState<Service[]>([])
  const [selectedService, setSelectedService] = useState<string | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)

  const today = new Date().toISOString().split('T')[0]
  const service = locationServices.find(s => s.id === selectedService)
  const canBook = selectedService && selectedSlot

  // Load locations from Supabase
  useEffect(() => {
    const loadLocations = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('locations')
        .select('id, name, address, city, slug, lat, lng')
        .eq('is_active', true)
      setLocations((data as Location[]) || [])
    }
    loadLocations()
  }, [])

  // Load services for selected location
  useEffect(() => {
    if (!selectedLocation) return
    const loadServices = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('services')
        .select('id, name, price')
        .eq('location_id', selectedLocation.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      setLocationServices((data as Service[]) || [])
    }
    loadServices()
  }, [selectedLocation])

  // Load slots for selected location and today
  useEffect(() => {
    if (!selectedLocation) return
    const loadSlots = async () => {
      const supabase = createClient()
      const dayOfWeek = jsDayToSupabase(new Date().getDay())

      const { data: hoursData } = await supabase
        .from('location_hours')
        .select('open_time, close_time, is_closed')
        .eq('location_id', selectedLocation.id)
        .eq('day_of_week', dayOfWeek)
        .single()

      if (!hoursData || hoursData.is_closed) {
        setSlots([])
        return
      }

      const allTimes = generateSlots(hoursData.open_time, hoursData.close_time)

      const { data: bookedData } = await supabase
        .from('bookings')
        .select('slot_start_time')
        .eq('location_id', selectedLocation.id)
        .eq('slot_date', today)
        .not('status', 'in', '("cancelled")')

      const bookedTimes = new Set((bookedData || []).map((b: any) => b.slot_start_time?.slice(0, 5)))
      const now = new Date()

      setSlots(allTimes.map(time => {
        const [h, m] = time.split(':').map(Number)
        const isPast = h < now.getHours() || (h === now.getHours() && m <= now.getMinutes())
        return { time, available: !bookedTimes.has(time) && !isPast }
      }))
    }
    loadSlots()
  }, [selectedLocation])

  const selectLocation = (loc: Location) => {
    setSelectedLocation(loc)
    setSelectedService(null)
    setSelectedSlot(null)
    mapInstanceRef.current?.panTo({ lat: loc.lat, lng: loc.lng })
  }

  // Init Google Maps
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

      if (params.get('source') === 'gps') {
        navigator.geolocation?.getCurrentPosition(pos => {
          map.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          map.setZoom(14)
        })
      }
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&callback=initMap&libraries=places`
    script.async = true
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [])

  // Add markers when locations load and map is ready
  useEffect(() => {
    if (!mapLoaded || !mapInstanceRef.current || locations.length === 0) return

    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current = []

    locations.forEach(loc => {
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
  }, [mapLoaded, locations])

  // Autocomplete
  useEffect(() => {
    if (!search.trim() || !autocompleteServiceRef.current || !window.google?.maps?.places) {
      setSuggestions([])
      return
    }
    const timeoutId = window.setTimeout(() => {
      autocompleteServiceRef.current.getPlacePredictions(
        { input: search, componentRestrictions: { country: 'gr' } },
        (predictions: any[] | null, status: string) => {
          if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions) {
            setSuggestions([])
            return
          }
          setSuggestions(predictions)
        }
      )
    }, 200)
    return () => window.clearTimeout(timeoutId)
  }, [search])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!searchContainerRef.current?.contains(event.target as Node)) setShowSuggestions(false)
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

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md h-screen relative overflow-hidden">

        {/* Search bar */}
        <div className="absolute top-0 left-0 right-0 z-10 px-4 pt-4">
          <div ref={searchContainerRef} className="relative">
            <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm">
              <button onClick={() => router.back()} className="text-gray-400 shrink-0">
                <ArrowLeft size={16} />
              </button>
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setShowSuggestions(true) }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="Αναζήτηση περιοχής..."
                className="flex-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none bg-transparent"
                autoFocus={params.get('source') === 'search'}
              />
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
        </div>

        {/* Map */}
        <div ref={mapRef} className="w-full h-full" />

        {!mapLoaded && (
          <div className="absolute inset-0 bg-gray-50 flex items-center justify-center">
            <p className="text-xs text-gray-400">Φόρτωση χάρτη...</p>
          </div>
        )}

        {/* Bottom panel */}
        <div className="absolute bottom-0 left-0 right-0 z-10">

          {!selectedLocation && locations.length > 0 && (
            <div className="pb-4 pt-2">
              <div className="flex gap-3 px-4 overflow-x-auto scrollbar-hide pb-2">
                {locations.map(loc => (
                  <button key={loc.id} onClick={() => selectLocation(loc)}
                    className="min-w-[200px] bg-white rounded-2xl p-4 shrink-0 text-left shadow-lg border border-gray-100">
                    <p className="text-sm font-semibold text-gray-900 mb-1">{loc.name}</p>
                    <p className="text-xs text-gray-400 mb-2">{loc.address}, {loc.city}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">⛽</span>
                      <ChevronRight size={12} className="text-gray-300" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {selectedLocation && (
            <div className="bg-white rounded-t-3xl shadow-2xl px-4 pt-4 pb-6">
              <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-base font-semibold text-gray-900">{selectedLocation.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{selectedLocation.address}, {selectedLocation.city}</p>
                </div>
                <button onClick={() => setSelectedLocation(null)} className="text-gray-300">
                  <X size={16} />
                </button>
              </div>

              {/* Services */}
              <div className="flex gap-2 mb-3">
                {locationServices.map(s => (
                  <button key={s.id} onClick={() => { setSelectedService(s.id); setSelectedSlot(null) }}
                    className={`flex-1 py-2.5 rounded-xl border text-center transition-all ${
                      selectedService === s.id ? 'bg-gray-900 border-gray-900' : 'bg-white border-gray-200'
                    }`}>
                    <p className={`text-xs font-medium ${selectedService === s.id ? 'text-white' : 'text-gray-900'}`}>{s.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">€{s.price}</p>
                  </button>
                ))}
              </div>

              {/* Slots */}
              {selectedService && (
                <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide pb-1">
                  {slots.filter(s => s.available).length === 0 ? (
                    <p className="text-xs text-gray-400">Δεν υπάρχουν διαθέσιμες ώρες σήμερα.</p>
                  ) : (
                    slots.filter(s => s.available).map(slot => (
                      <button key={slot.time} onClick={() => setSelectedSlot(slot.time)}
                        className={`shrink-0 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                          selectedSlot === slot.time
                            ? 'bg-gray-900 border-gray-900 text-white'
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
                    onClick={() => router.push(`/booking?location=${selectedLocation.id}&service=${selectedService}&slot=${encodeURIComponent(selectedSlot!)}&date=${today}`)}
                    className="flex-1 bg-gray-900 text-white text-sm font-medium py-3 rounded-xl flex items-center justify-center gap-1">
                    Κράτηση — €{service?.price}
                    <ChevronRight size={14} />
                  </button>
                ) : (
                  <div className="flex-1 bg-gray-100 text-gray-400 text-sm font-medium py-3 rounded-xl flex items-center justify-center">
                    {!selectedService ? 'Επίλεξε υπηρεσία' : 'Επίλεξε ώρα'}
                  </div>
                )}
                <button
                  onClick={() => router.push(`/locations/${selectedLocation.slug}`)}
                  className="border border-gray-200 text-gray-500 text-xs px-3 py-3 rounded-xl">
                  Άλλη μέρα
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
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