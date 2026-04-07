'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, X, ChevronRight } from 'lucide-react'

const locations = [
  { id: 1, name: 'Avin Γλυφάδα', address: 'Λεωφ. Βουλιαγμένης 20', lat: 37.8678, lng: 23.7536, rating: 4.8, distance: '0.4 km', nextSlot: 'Τώρα' },
  { id: 2, name: 'Shell Άλιμος', address: 'Λεωφ. Βουλιαγμένης 100', lat: 37.9100, lng: 23.7200, rating: 4.6, distance: '1.2 km', nextSlot: 'Σε 30λ' },
  { id: 3, name: 'BP Ελληνικό', address: 'Λεωφ. Ποσειδώνος 50', lat: 37.8900, lng: 23.7300, rating: 4.5, distance: '2.1 km', nextSlot: 'Τώρα' },
  { id: 4, name: 'Revoil Βούλα', address: 'Λεωφ. Βάρης 10', lat: 37.8500, lng: 23.7700, rating: 4.3, distance: '3.0 km', nextSlot: 'Σε 1ω' },
]

const services = [
  { id: 1, name: 'Μέσα', price: 10 },
  { id: 2, name: 'Έξω', price: 6 },
  { id: 3, name: 'Μέσα-Έξω', price: 15 },
]

const slots = [
  { id: 1, time: '09:00', available: true },
  { id: 2, time: '09:30', available: true },
  { id: 3, time: '10:00', available: false },
  { id: 4, time: '10:30', available: true },
  { id: 5, time: '11:00', available: true },
  { id: 6, time: '11:30', available: true },
]

declare global {
  interface Window { google: any; initMap: () => void }
}

function MapPageContent() {
  const router = useRouter()
  const params = useSearchParams()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])

  const [mapLoaded, setMapLoaded] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<typeof locations[0] | null>(null)
  const [selectedService, setSelectedService] = useState<number | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const today = new Date().toISOString().split('T')[0]
  const service = services.find(s => s.id === selectedService)
  const canBook = selectedService && selectedSlot

  const selectLocation = (loc: typeof locations[0]) => {
    setSelectedLocation(loc)
    setSelectedService(null)
    setSelectedSlot(null)
    mapInstanceRef.current?.panTo({ lat: loc.lat, lng: loc.lng })
  }

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

      locations.forEach(loc => {
        const marker = new window.google.maps.Marker({
          position: { lat: loc.lat, lng: loc.lng },
          map,
          label: { text: `€${loc.id === 2 || loc.id === 4 ? 5 : 6}`, color: '#fff', fontSize: '11px', fontWeight: '600' },
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 20,
            fillColor: '#0A0A0A',
            fillOpacity: 1,
            strokeWeight: 0,
          },
        })

        marker.addListener('click', () => selectLocation(loc))
        markersRef.current.push(marker)
      })

      setMapLoaded(true)

      if (params.get('source') === 'gps') {
        navigator.geolocation?.getCurrentPosition(pos => {
          map.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          map.setZoom(14)
        })
      }
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&callback=initMap`
    script.async = true
    document.head.appendChild(script)

    return () => { document.head.removeChild(script) }
  }, [])

  return (
    <main className="h-screen w-full max-w-md mx-auto relative overflow-hidden">

      {/* Search bar */}
      <div className="absolute top-0 left-0 right-0 z-10 px-4 pt-4">
        <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm">
          <button onClick={() => router.back()} className="text-gray-400 shrink-0">
            <ArrowLeft size={16} />
          </button>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Αναζήτηση περιοχής..."
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 focus:outline-none bg-transparent"
            autoFocus={params.get('source') === 'search'}
          />
        </div>
      </div>

      {/* Map — full screen */}
      <div ref={mapRef} className="w-full h-full" />

      {!mapLoaded && (
        <div className="absolute inset-0 bg-gray-50 flex items-center justify-center">
          <p className="text-xs text-gray-400">Φόρτωση χάρτη...</p>
        </div>
      )}

      {/* Bottom panel — πάνω στον χάρτη */}
      <div className="absolute bottom-0 left-0 right-0 z-10">

        {/* Cards χωρίς selection */}
        {!selectedLocation && (
          <div className="pb-4 pt-2">
            <div className="flex gap-3 px-4 overflow-x-auto scrollbar-hide pb-2">
              {locations.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => selectLocation(loc)}
                  className="min-w-[200px] bg-white rounded-2xl p-4 shrink-0 text-left shadow-lg border border-gray-100"
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-gray-900">{loc.name}</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-lg ${
                      loc.nextSlot === 'Τώρα' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'
                    }`}>{loc.nextSlot}</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-2">{loc.address}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">⭐ {loc.rating}</span>
                      <span className="text-xs text-gray-300 mx-1">·</span>
                      <span className="text-xs text-gray-400">{loc.distance}</span>
                    </div>
                    <span className="text-xs font-semibold text-gray-900">από €{loc.id === 2 || loc.id === 4 ? 5 : 6}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Selected location — mini booking flow */}
        {selectedLocation && (
          <div className="bg-white rounded-t-3xl shadow-2xl px-4 pt-4 pb-6">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-base font-semibold text-gray-900">{selectedLocation.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-400">{selectedLocation.distance}</span>
                  <span className="text-xs text-gray-400">⭐ {selectedLocation.rating}</span>
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${
                    selectedLocation.nextSlot === 'Τώρα' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'
                  }`}>{selectedLocation.nextSlot}</span>
                </div>
              </div>
              <button onClick={() => setSelectedLocation(null)} className="text-gray-300">
                <X size={16} />
              </button>
            </div>

            <div className="flex gap-2 mb-3">
              {services.map(s => (
                <button
                  key={s.id}
                  onClick={() => { setSelectedService(s.id); setSelectedSlot(null) }}
                  className={`flex-1 py-2.5 rounded-xl border text-center transition-all ${
                    selectedService === s.id ? 'bg-gray-900 border-gray-900' : 'bg-white border-gray-200'
                  }`}
                >
                  <p className={`text-xs font-medium ${selectedService === s.id ? 'text-white' : 'text-gray-900'}`}>{s.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">€{s.price}</p>
                </button>
              ))}
            </div>

            {selectedService && (
              <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide pb-1">
                {slots.filter(s => s.available).map(slot => (
                  <button
                    key={slot.id}
                    onClick={() => setSelectedSlot(slot.id)}
                    className={`shrink-0 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                      selectedSlot === slot.id
                        ? 'bg-gray-900 border-gray-900 text-white'
                        : 'bg-white border-gray-200 text-gray-700'
                    }`}
                  >
                    {slot.time}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              {canBook ? (
                <button
                  onClick={() => router.push(`/booking?location=${selectedLocation.id}&service=${selectedService}&slot=${selectedSlot}&date=${today}`)}
                  className="flex-1 bg-gray-900 text-white text-sm font-medium py-3 rounded-xl flex items-center justify-center gap-1"
                >
                  Κράτηση — €{service?.price}
                  <ChevronRight size={14} />
                </button>
              ) : (
                <div className="flex-1 bg-gray-100 text-gray-400 text-sm font-medium py-3 rounded-xl flex items-center justify-center">
                  {!selectedService ? 'Επίλεξε υπηρεσία' : 'Επίλεξε ώρα'}
                </div>
              )}
              <button
                onClick={() => router.push(`/locations/${selectedLocation.id}`)}
                className="border border-gray-200 text-gray-500 text-xs px-3 py-3 rounded-xl"
              >
                Άλλη μέρα
              </button>
            </div>
          </div>
        )}
      </div>

    </main>
  )
}

export default function MapPage() {
  return (
    <Suspense fallback={<div className="h-screen w-full max-w-md mx-auto flex items-center justify-center"><p className="text-xs text-gray-400">Φόρτωση...</p></div>}>
      <MapPageContent />
    </Suspense>
  )
}