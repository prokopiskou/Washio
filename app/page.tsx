'use client'

import Link from 'next/link'
import { MapPin, Star, Clock, Calendar, Search, ChevronDown } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const locations = [
  { id: 1, name: 'Avin Γλυφάδα', distance: '0.4 km', rating: 4.8, nextSlot: 'Τώρα' },
  { id: 2, name: 'Shell Άλιμος', distance: '1.2 km', rating: 4.6, nextSlot: 'Σε 30λ' },
  { id: 3, name: 'BP Ελληνικό', distance: '2.1 km', rating: 4.5, nextSlot: 'Τώρα' },
  { id: 4, name: 'Revoil Βούλα', distance: '3.0 km', rating: 4.3, nextSlot: 'Σε 1ω' },
]

const services = [
  { name: 'Μέσα', price: 'από €5' },
  { name: 'Έξω', price: 'από €7' },
  { name: 'Μέσα & Έξω', price: 'από €10' },
]

function getTimeSlots() {
  const slots: string[] = []
  for (let h = 8; h < 22; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`)
    slots.push(`${String(h).padStart(2, '0')}:30`)
  }
  return slots
}

function getTodayValue() {
  return new Date().toISOString().split('T')[0]
}

export default function Home() {
  const router = useRouter()
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [timing, setTiming] = useState<'now' | 'later'>('now')
  const [locationGranted, setLocationGranted] = useState(false)
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [showTimePicker, setShowTimePicker] = useState(false)
  const timePickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const loadSession = async () => {
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      setIsLoggedIn(!!data.session)
    }
    loadSession()
  }, [])

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      () => setLocationGranted(true),
      () => setLocationGranted(false)
    )
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (timePickerRef.current && !timePickerRef.current.contains(e.target as Node)) {
        setShowTimePicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleGPS = () => {
    navigator.geolocation?.getCurrentPosition(
      () => {
        setLocationGranted(true)
        router.push('/map?source=gps')
      },
      () => setLocationGranted(false)
    )
  }

  return (
    <main className="min-h-screen bg-white max-w-md mx-auto pb-24">

      {/* Navbar */}
      <nav className="flex justify-between items-center px-5 py-3 border-b border-gray-100">
        <img src="/washio_logo.png" alt="Washio" className="h-10 w-auto" />
        {!isLoggedIn && (
          <Link href="/login" className="text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-full">
            Σύνδεση
          </Link>
        )}
      </nav>

      {/* Hero */}
      <section className="px-5 pt-6 pb-4">
        <h1 className="text-xl font-semibold leading-tight tracking-tight text-gray-900 mb-1">
          Πού είσαι τώρα;
        </h1>
        <p className="text-xs text-gray-400 mb-4">
          Βρίσκουμε τον κοντινότερο διαθέσιμο σταθμό.
        </p>

        <Link
          href="/map?source=search"
          className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 mb-2"
        >
          <Search size={13} className="text-gray-400 shrink-0" />
          <span className="text-xs text-gray-400">Αναζήτηση περιοχής...</span>
        </Link>

        {!locationGranted ? (
          <button
            onClick={handleGPS}
            className="text-xs text-blue-500 mb-4 flex items-center gap-1"
          >
            <MapPin size={11} />
            Χρήση τοποθεσίας μου
          </button>
        ) : (
          <button
            onClick={() => router.push('/map?source=gps')}
            className="text-xs text-green-500 mb-4 flex items-center gap-1"
          >
            <MapPin size={11} />
            Τοποθεσία ενεργή — δες στο χάρτη
          </button>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setTiming('now')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-all ${
              timing === 'now'
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-400 border-gray-200'
            }`}
          >
            <Clock size={11} />
            Τώρα
          </button>
          <button
            onClick={() => { setTiming('later'); setSelectedTime(''); setShowTimePicker(false) }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-all ${
              timing === 'later'
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-400 border-gray-200'
            }`}
          >
            <Calendar size={11} />
            Προγραμματισμός
          </button>
        </div>

        {timing === 'later' && (
          <div className="mt-2 grid grid-cols-2 gap-2 items-stretch">
            <input
              type="date"
              defaultValue={getTodayValue()}
              style={{ height: '36px', minHeight: '36px' }}
              className="border border-gray-200 rounded-lg px-3 text-xs text-gray-700 bg-gray-50 w-full"
            />
            <div className="relative" ref={timePickerRef}>
              <button
                onClick={() => setShowTimePicker(!showTimePicker)}
                style={{ height: '36px', minHeight: '36px' }}
                className="w-full border border-gray-200 rounded-lg px-3 text-xs bg-gray-50 flex items-center justify-between"
              >
                <span className={selectedTime ? 'text-gray-700' : 'text-gray-400'}>
                  {selectedTime || 'Ώρα'}
                </span>
                <ChevronDown size={10} className="text-gray-400" />
              </button>

              {showTimePicker && (
                <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-md z-10 max-h-44 overflow-y-auto">
                  {getTimeSlots().map(slot => (
                    <button
                      key={slot}
                      onClick={() => { setSelectedTime(slot); setShowTimePicker(false) }}
                      className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                        selectedTime === slot
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Stations */}
      <section className="mb-6">
        <div className="flex items-center justify-between px-5 mb-3">
          <p className="text-xs font-medium tracking-widest text-gray-400 uppercase">
            {timing === 'now' ? 'Κοντά σου τώρα' : 'Διαθέσιμα την επιλεγμένη ώρα'}
          </p>
          <Link href="/map" className="text-xs text-blue-500">
            Χάρτης →
          </Link>
        </div>
        <div className="flex gap-2 px-5 overflow-x-auto scrollbar-hide pb-1">
          {locations.map(loc => (
            <Link
              key={loc.id}
              href={`/locations/${loc.id}`}
              className="min-w-[130px] border border-gray-100 rounded-xl p-2.5 shrink-0 flex flex-col gap-1.5"
            >
              <div className="w-full h-14 bg-gray-100 rounded-lg flex items-center justify-center text-xl">
                ⛽
              </div>
              <p className="text-xs font-medium text-gray-900 leading-tight">{loc.name}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{loc.distance}</span>
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-md ${
                  loc.nextSlot === 'Τώρα'
                    ? 'bg-green-50 text-green-600'
                    : 'bg-amber-50 text-amber-600'
                }`}>
                  {loc.nextSlot}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Star size={9} className="text-amber-400 fill-amber-400" />
                <span className="text-xs text-gray-400">{loc.rating}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Services */}
      <section className="px-5 mb-6">
        <p className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-1">
          Υπηρεσίες
        </p>
        <p className="text-xs text-gray-300 mb-3">Διαθέσιμες σε όλους τους σταθμούς</p>
        <div className="flex gap-2">
          {services.map(s => (
            <div key={s.name} className="flex-1 border border-gray-100 rounded-xl p-2.5 text-center">
              <p className="text-xs font-medium text-gray-900">{s.name}</p>
              <p className="text-xs text-gray-400 mt-1">{s.price}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Partner CTA */}
      <section className="px-5 mb-4">
        <div className="bg-gray-900 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-white text-xs font-medium">Είσαι πρατήριο;</p>
            <p className="text-gray-500 text-xs mt-0.5">Αύξησε τις κρατήσεις σου.</p>
          </div>
          <button className="bg-white text-gray-900 text-xs font-medium px-3 py-1.5 rounded-lg shrink-0">
            Μάθε περισσότερα
          </button>
        </div>
      </section>

      {/* Promo Banner */}
      <section className="px-5 mb-8">
        <p className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-3">
          Προσφορές & Νέα
        </p>
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
          <div className="min-w-[280px] h-32 bg-gradient-to-r from-blue-500 to-blue-700 rounded-2xl shrink-0 flex flex-col justify-between p-4">
            <p className="text-white text-xs font-medium uppercase tracking-wider">Προσφορά</p>
            <div>
              <p className="text-white font-semibold text-sm">-20% σε όλες τις υπηρεσίες</p>
              <p className="text-blue-200 text-xs mt-0.5">Ισχύει έως 30 Απρ</p>
            </div>
          </div>
          <div className="min-w-[280px] h-32 bg-gradient-to-r from-gray-800 to-gray-900 rounded-2xl shrink-0 flex flex-col justify-between p-4">
            <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">Νέο</p>
            <div>
              <p className="text-white font-semibold text-sm">Νέο πρατήριο στη Βούλα</p>
              <p className="text-gray-400 text-xs mt-0.5">Από 1 Μαΐου διαθέσιμο</p>
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

    </main>
  )
}