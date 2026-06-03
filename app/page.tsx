'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, Star, RotateCw, Calendar, ChevronRight, MapPin, Home as HomeIcon } from 'lucide-react'

type Location = {
  id: string
  name: string
  city: string
  slug: string
}

type Booking = {
  id: string
  booking_ref: string
  slot_date: string
  slot_start_time: string
  locations: { name: string; slug: string } | null
}

type Favorite = {
  id: string
  locations: { id: string; name: string; slug: string } | null
}

const MONTHS_SHORT = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']

export default function HomePage() {
  const router = useRouter()
  const [authChecking, setAuthChecking] = useState(true)
  const [upcomingBooking, setUpcomingBooking] = useState<Booking | null>(null)
  const [recentLocations, setRecentLocations] = useState<Location[]>([])
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [lastBooking, setLastBooking] = useState<Booking | null>(null)
  const [activeLocationsCount, setActiveLocationsCount] = useState(0)

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const { data: sessionData } = await supabase.auth.getSession()

      if (!sessionData.session) {
        router.replace('/welcome')
        return
      }

      const user = sessionData.session.user

      // Load all data in parallel
      const today = new Date().toISOString().split('T')[0]

      const [
        { data: upcoming },
        { data: last },
        { data: favs },
        { data: locs },
      ] = await Promise.all([
        // Επόμενη κράτηση
        supabase
          .from('bookings')
          .select('id, booking_ref, slot_date, slot_start_time, locations(name, slug)')
          .eq('user_id', user.id)
          .eq('status', 'confirmed')
          .gte('slot_date', today)
          .order('slot_date', { ascending: true })
          .order('slot_start_time', { ascending: true })
          .limit(1)
          .maybeSingle(),
        // Τελευταία ολοκληρωμένη
        supabase
          .from('bookings')
          .select('id, booking_ref, slot_date, slot_start_time, locations(name, slug)')
          .eq('user_id', user.id)
          .in('status', ['completed', 'confirmed'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        // Αγαπημένα
        supabase
          .from('favorites')
          .select('id, locations(id, name, slug)')
          .eq('user_id', user.id)
          .limit(5),
        // Active locations count
        supabase
          .from('locations')
          .select('id, name, city, slug', { count: 'exact' })
          .eq('is_active', true)
          .limit(3),
      ])

      setUpcomingBooking(upcoming as unknown as Booking)
      setLastBooking(last as unknown as Booking)
      setFavorites((favs as unknown as Favorite[]) || [])
      setRecentLocations((locs as Location[]) || [])
      setActiveLocationsCount(locs?.length || 0)

      setAuthChecking(false)
    }
    init()
  }, [router])

  if (authChecking) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-xs text-gray-400">Φόρτωση...</p>
      </main>
    )
  }

  const upcomingDate = upcomingBooking ? new Date(upcomingBooking.slot_date) : null

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md pb-24">
        <div className="px-5 pt-6 pb-6 flex flex-col gap-5">

          {/* Header — centered logo */}
          <div className="flex justify-center items-center -my-8">
            <img src="/washio-logo.png" alt="Washio" className="h-48 w-auto" />
          </div>
          <h1 className="text-[26px] font-bold tracking-tight leading-[1.15] text-gray-900 text-center">
            Που θες να κλείσεις ραντεβού;
          </h1>

          {/* Hero CTA */}
          <button
            onClick={() => router.push('/map')}
            className="relative overflow-hidden bg-gray-900 rounded-[22px] px-6 py-6 shadow-lg text-left"
            style={{ boxShadow: '0 8px 24px rgba(0,0,0,0.10)' }}
          >
            {/* Decorative droplet */}
            <div
              className="absolute -right-6 -bottom-8 w-36 h-36 bg-white/[0.04] -rotate-[30deg]"
              style={{ borderRadius: '50% 50% 50% 0' }}
            />
            <div className="flex items-center gap-3.5 relative">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold tracking-[1.6px] uppercase text-white/55">
                  Έτοιμο σε 30 λεπτά
                </p>
                <p className="text-[22px] font-bold tracking-tight leading-[1.15] text-white mt-2">
                  Βρες κοντινό<br />πλυντήριο
                </p>
                {activeLocationsCount > 0 && (
                  <div className="inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded-full bg-white/10">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <span className="text-[11px] font-semibold text-white/85">
                      {activeLocationsCount} ανοιχτά τώρα
                    </span>
                  </div>
                )}
              </div>
              <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center flex-shrink-0">
                <ArrowRight size={20} className="text-gray-900" strokeWidth={2} />
              </div>
            </div>
          </button>

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Repeat */}
            {lastBooking && lastBooking.locations ? (
              <button
                onClick={() => router.push(`/locations/${lastBooking.locations?.slug}`)}
                className="bg-white rounded-2xl border border-gray-100 p-3.5 flex flex-col gap-2 text-left"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center">
                    <RotateCw size={14} className="text-gray-900" strokeWidth={1.8} />
                  </div>
                  <p className="text-[11px] font-semibold tracking-[1.4px] uppercase text-gray-500">
                    Επανάληψη
                  </p>
                </div>
                <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">
                  {lastBooking.locations.name}
                </p>
                <p className="text-xs font-medium text-blue-600">Κράτηση ξανά →</p>
              </button>
            ) : (
              <button
                onClick={() => router.push('/map')}
                className="bg-white rounded-2xl border border-gray-100 p-3.5 flex flex-col gap-2 text-left"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center">
                    <Calendar size={14} className="text-gray-900" strokeWidth={1.8} />
                  </div>
                  <p className="text-[11px] font-semibold tracking-[1.4px] uppercase text-gray-500">
                    Πρώτη κράτηση
                  </p>
                </div>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">Ξεκίνα τώρα</p>
                <p className="text-xs font-medium text-blue-600">Βρες πλυντήριο →</p>
              </button>
            )}

            {/* Favorites */}
            <Link
              href="/profile/favorites"
              className="bg-white rounded-2xl border border-gray-100 p-3.5 flex flex-col gap-2"
              style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gray-50 flex items-center justify-center">
                  <Star size={14} className="text-gray-900 fill-gray-900" strokeWidth={1} />
                </div>
                <p className="text-[11px] font-semibold tracking-[1.4px] uppercase text-gray-500">
                  Αγαπημένα
                </p>
              </div>
              {favorites.length > 0 ? (
                <div className="flex items-center mt-0.5">
                  {favorites.slice(0, 3).map((fav, i) => (
                    <div
                      key={fav.id}
                      className="w-7 h-7 rounded-full bg-gray-900 border-2 border-white flex items-center justify-center text-white text-[11px] font-semibold"
                      style={{ marginLeft: i ? -8 : 0 }}
                    >
                      {fav.locations?.name?.charAt(0) || '?'}
                    </div>
                  ))}
                  {favorites.length > 3 && (
                    <span className="text-xs text-gray-500 ml-2">+{favorites.length - 3}</span>
                  )}
                </div>
              ) : (
                <p className="text-sm font-semibold text-gray-900 mt-0.5">Κανένα ακόμα</p>
              )}
              <p className="text-xs font-medium text-blue-600">Δες όλα →</p>
            </Link>
          </div>

          {/* Upcoming booking */}
          {upcomingBooking && upcomingDate && (
            <Link
              href={`/profile/bookings/${upcomingBooking.id}`}
              className="bg-gray-50 rounded-2xl p-4 border border-gray-100 flex items-center gap-3.5"
            >
              <div className="w-11 h-11 rounded-[11px] bg-white border border-gray-200 flex flex-col items-center justify-center">
                <span className="text-[9px] font-semibold tracking-wider uppercase text-gray-400">
                  {MONTHS_SHORT[upcomingDate.getMonth()]}
                </span>
                <span className="text-[15px] font-bold text-gray-900 tabular-nums leading-none mt-0.5">
                  {upcomingDate.getDate()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold tracking-[1.4px] uppercase text-gray-500">
                  Επόμενη κράτηση
                </p>
                <p className="text-sm font-semibold text-gray-900 mt-1 truncate">
                  {upcomingBooking.locations?.name} · {upcomingBooking.slot_start_time?.slice(0, 5)}
                </p>
                <p className="text-[11px] font-medium text-gray-400 mt-0.5 font-mono tracking-wider">
                  {upcomingBooking.booking_ref}
                </p>
              </div>
              <ChevronRight size={16} className="text-gray-400" />
            </Link>
          )}

          {/* Recent locations */}
          {recentLocations.length > 0 && (
            <div>
              <div className="flex justify-between items-baseline mb-2.5">
                <p className="text-[11px] font-semibold tracking-[1.6px] uppercase text-gray-500">
                  Πρόσφατα
                </p>
                <Link href="/map" className="text-xs font-medium text-blue-600">Όλα →</Link>
              </div>
              <div className="flex gap-2.5 overflow-x-auto scrollbar-hide -mx-5 px-5 pb-1">
                {recentLocations.map(loc => (
                  <Link
                    key={loc.id}
                    href={`/locations/${loc.slug}`}
                    className="flex-shrink-0 w-40 bg-white rounded-xl border border-gray-100 p-2.5 flex flex-col gap-2"
                  >
                    <div
                      className="h-16 rounded-lg relative"
                      style={{
                        background: 'repeating-linear-gradient(135deg, #F7F7F7 0 10px, #FAFAFA 10px 20px)',
                      }}
                    >
                      <div className="absolute top-1.5 left-2 font-mono text-[8px] text-gray-400">
                        // photo
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-900 truncate">{loc.name}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{loc.city}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Nav */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md flex justify-around items-center py-3 border-t border-gray-100 bg-white">
          <button className="flex flex-col items-center gap-1 text-blue-600">
            <HomeIcon size={18} />
            <span className="text-xs">Αρχική</span>
          </button>
          <Link href="/map" className="flex flex-col items-center gap-1 text-gray-300">
            <MapPin size={18} />
            <span className="text-xs">Εύρεση</span>
          </Link>
          <Link href="/profile" className="flex flex-col items-center gap-1 text-gray-300">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span className="text-xs">Προφίλ</span>
          </Link>
        </nav>
      </div>
    </main>
  )
}