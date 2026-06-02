'use client'

import Link from 'next/link'
import { MapPin, Star, Clock, Calendar, ChevronDown, X } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Location = {
  id: string
  name: string
  address: string
  city: string
  lat: number
  lng: number
  slug: string
  distance?: number
  nextSlot?: string | null
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

export default function Home() {
  const router = useRouter()
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [timing, setTiming] = useState<'now' | 'later'>('now')
  const [userLat, setUserLat] = useState<number | null>(null)
  const [userLng, setUserLng] = useState<number | null>(null)
  const [locations, setLocations] = useState<Location[]>([])
  const [locationsLoading, setLocationsLoading] = useState(true)
  const [hasLocation, setHasLocation] = useState<boolean | null>(null)
  const [showSchedule, setShowSchedule] = useState(false)
  const [selectedDate, setSelectedDate] = useState(getTodayValue())
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [showTimePicker, setShowTimePicker] = useState(false)
  const timePickerRef = useRef<HTMLDivElement>(null)

  // Auth check
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/welcome')
        return
      }
      setIsLoggedIn(true)
    })
  }, [router])

  // Location permission + load locations
  useEffect(() => {
    const loadLocations = async (lat?: number, lng?: number) => {
      const supabase = createClient()
      const { data } = await supabase
        .from('locations')
        .select('id, name, address, city, lat, lng, slug')
        .eq('is_active', true)

      let locs: Location[] = (data || []).map(loc => ({
        ...loc,
        distance: lat && lng ? getDistance(lat, lng, loc.lat, loc.lng) : undefined,
      }))

      if (lat && lng) {
        locs = locs.sort((a, b) => (a.distance || 0) - (b.distance || 0))
      }

      setLocations(locs)
      setLocationsLoading(false)
    }

    navigator.geolocation?.getCurrentPosition(
      pos => {
        setHasLocation(true)
        setUserLat(pos.coords.latitude)
        setUserLng(pos.coords.longitude)
        loadLocations(pos.coords.latitude, pos.coords.longitude)
      },
      () => {
        // Δεν έδωσε permission → εμφανίζουμε no-location state
        setHasLocation(false)
        setLocationsLoading(false)
      },
      { timeout: 4000 }
    )
  }, [])

  // Close time picker on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (timePickerRef.current && !timePickerRef.current.contains(e.target as Node)) {
        setShowTimePicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const formattedDate = new Date(selectedDate).toLocaleDateString('el-GR', {
    weekday: 'short', day: 'numeric', month: 'short'
  })

  const handleApplySchedule = () => {
    setTiming('later')
    setShowSchedule(false)
  }

  const handleNow = () => {
    setTiming('now')
    setSelectedDate(getTodayValue())
    setSelectedTime('')
  }

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md pb-24">

        {/* Navbar */}
        <nav className="relative flex justify-center items-center px-5 py-4">
          <img src="/washio_logo.png" alt="Washio" className="h-9 w-auto" />
          {!isLoggedIn && (
            <Link href="/login" className="absolute right-5 text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-full">
              Σύνδεση
            </Link>
          )}
        </nav>

        {/* Hero Banner */}
        <section className="px-5 pt-6 pb-2">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900 leading-tight mb-1">
            Πλύνε το αυτοκίνητό σου<br />
            <span className="text-gray-400">σε 3 δευτερόλεπτα.</span>
          </h1>
          <p className="text-xs text-gray-400">
            Βρες κοντινό πλυντήριο, κλείσε θέση, πήγαινε.
          </p>
        </section>

        {hasLocation && (
          <>
            {/* Timing selector */}
            <section className="px-5 mb-5">
              <div className="flex gap-2">
                <button
                  onClick={handleNow}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium border transition-all ${
                    timing === 'now'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-400 border-gray-200'
                  }`}
                >
                  <Clock size={11} />
                  Τώρα
                </button>
                <button
                  onClick={() => setShowSchedule(true)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-medium border transition-all ${
                    timing === 'later'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-400 border-gray-200'
                  }`}
                >
                  <Calendar size={11} />
                  {timing === 'later' && selectedDate && selectedTime
                    ? `${formattedDate} · ${selectedTime}`
                    : 'Προγραμματισμός'
                  }
                </button>
              </div>
            </section>

            {/* Locations list */}
            <section className="px-5">
              <p className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-3">
                {timing === 'now' ? 'Κοντά σου' : `Διαθέσιμα · ${formattedDate} ${selectedTime}`}
              </p>

              {locationsLoading ? (
                <div className="flex flex-col gap-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-20 bg-gray-50 rounded-2xl animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {locations.map(loc => (
                    <Link
                      key={loc.id}
                      href={`/locations/${loc.slug}`}
                      className="flex items-center gap-4 border border-gray-100 rounded-2xl p-4"
                    >
                      <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-2xl shrink-0">
                        ⛽
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{loc.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{loc.address}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Star size={9} className="text-amber-400 fill-amber-400" />
                          <span className="text-xs text-gray-400">Νέο</span>
                          {loc.distance !== undefined && (
                            <>
                              <span className="text-gray-200">·</span>
                              <MapPin size={9} className="text-gray-400" />
                              <span className="text-xs text-gray-400">{formatDistance(loc.distance)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="text-xs font-medium px-2 py-1 rounded-lg bg-green-50 text-green-600 shrink-0">
                        Τώρα
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {hasLocation === false && (
          <section className="px-5 mt-4">
            <Link
              href="/map?source=search"
              className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3.5"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400 shrink-0"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <span className="text-sm text-gray-400">Αναζήτηση περιοχής...</span>
            </Link>
          </section>
        )}

        {/* Partner CTA */}
        <section className="px-5 mt-6">
          <div className="bg-gray-900 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-white text-xs font-medium">Είσαι πρατήριο;</p>
              <p className="text-gray-500 text-xs mt-0.5">Αύξησε τις κρατήσεις σου.</p>
            </div>
            <Link href="/apply" className="bg-white text-gray-900 text-xs font-medium px-3 py-1.5 rounded-lg shrink-0">
              Μάθε περισσότερα
            </Link>
          </div>
        </section>

        {/* Promo Banners */}
        <section className="px-5 mt-4 mb-8">
          <p className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-3">
            Προσφορές & Νέα
          </p>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
            <div className="min-w-[280px] h-32 bg-gradient-to-r from-blue-500 to-blue-700 rounded-2xl shrink-0 flex flex-col justify-between p-4">
              <p className="text-white text-xs font-medium uppercase tracking-wider">Προσφορά</p>
              <div>
                <p className="text-white font-semibold text-sm">-20% σε όλες τις υπηρεσίες</p>
                <p className="text-blue-200 text-xs mt-0.5">Ισχύει έως 30 Μαΐου</p>
              </div>
            </div>
            <div className="min-w-[280px] h-32 bg-gradient-to-r from-gray-800 to-gray-900 rounded-2xl shrink-0 flex flex-col justify-between p-4">
              <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Νέο</p>
              <div>
                <p className="text-white font-semibold text-sm">Νέο πρατήριο στη Βούλα</p>
                <p className="text-gray-400 text-xs mt-0.5">Από 1 Ιουνίου διαθέσιμο</p>
              </div>
            </div>
            <div className="min-w-[280px] h-32 bg-gradient-to-r from-emerald-500 to-emerald-700 rounded-2xl shrink-0 flex flex-col justify-between p-4">
              <p className="text-white text-xs font-medium uppercase tracking-wider">Tip</p>
              <div>
                <p className="text-white font-semibold text-sm">Κλείσε 5 πλυσίματα</p>
                <p className="text-emerald-200 text-xs mt-0.5">Κέρδισε 1 δωρεάν</p>
              </div>
            </div>
          </div>
        </section>

        {/* Bottom Nav */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md flex justify-around items-center py-3 border-t border-gray-100 bg-white">
          <button className="flex flex-col items-center gap-1 text-blue-600">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
            <span className="text-xs">Αρχική</span>
          </button>
          <Link href="/map" className="flex flex-col items-center gap-1 text-gray-300">
            <MapPin size={18} />
            <span className="text-xs">Εύρεση</span>
          </Link>
          <Link href="/profile" className="flex flex-col items-center gap-1 text-gray-300">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span className="text-xs">Προφίλ</span>
          </Link>
        </nav>

      </div>

      {/* Schedule Bottom Sheet */}
      {showSchedule && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowSchedule(false)} />
          <div className="relative bg-white rounded-t-3xl px-5 pt-5 pb-10 z-10">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <div className="flex items-center justify-between mb-5">
              <p className="text-base font-semibold text-gray-900">Πότε θέλεις;</p>
              <button onClick={() => setShowSchedule(false)} className="text-gray-400">
                <X size={18} />
              </button>
            </div>

            {/* Date picker */}
            <div className="mb-3">
              <p className="text-xs text-gray-400 mb-1.5">Ημερομηνία</p>
              <div className="relative">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  min={getTodayValue()}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 flex items-center justify-between bg-gray-50">
                  <span>{formattedDate}</span>
                  <ChevronDown size={14} className="text-gray-400" />
                </div>
              </div>
            </div>

            {/* Time picker */}
            <div className="mb-5" ref={timePickerRef}>
              <p className="text-xs text-gray-400 mb-1.5">Ώρα</p>
              <button
                onClick={() => setShowTimePicker(!showTimePicker)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm flex items-center justify-between bg-gray-50"
              >
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

            <button
              onClick={handleApplySchedule}
              disabled={!selectedDate || !selectedTime}
              className="w-full bg-gray-900 text-white text-sm font-medium py-3.5 rounded-xl disabled:opacity-40"
            >
              Εφαρμογή
            </button>
          </div>
        </div>
      )}
    </main>
  )
}