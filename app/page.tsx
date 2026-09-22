'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Capacitor } from '@capacitor/core'
import { ArrowRight, Star, RotateCw, Calendar, ChevronRight, MapPin, Home as HomeIcon, Store } from 'lucide-react'
import LandingPage from './landing/page'
import { BottomNav } from '@/components/BottomNav'
import { WashioLoader } from '@/components/WashioLoader'
import { AppRatingPrompt } from '@/components/AppRatingPrompt'
import { useT, useLocale, Locale } from '@/lib/i18n'
import { athensToday } from '@/lib/time'

const T = {
  el: {
    loading: 'Φόρτωση...',
    heading: 'Που θες να κλείσεις ραντεβού;',
    readyIn30: 'Έτοιμο σε 30 λεπτά',
    findNearby1: 'Βρες κοντινό',
    findNearby2: 'πλυντήριο',
    openNow: (n: number) => `${n} ανοιχτά τώρα`,
    repeat: 'Επανάληψη',
    bookAgain: 'Κράτηση ξανά →',
    firstBooking: 'Πρώτη κράτηση',
    startNow: 'Ξεκίνα τώρα',
    findWash: 'Βρες πλυντήριο →',
    favorites: 'Αγαπημένα',
    noneYet: 'Κανένα ακόμα',
    seeAll: 'Δες όλα →',
    nextBooking: 'Επόμενη κράτηση',
    recent: 'Πρόσφατα',
    all: 'Όλα →',
    partnerBannerTitle: 'Η επιχείρησή σου είναι live',
    partnerBannerSub: 'Δες κρατήσεις, τιμές και ωράριο',
    partnerBannerCta: 'Άνοιξε το dashboard',
  },
  en: {
    loading: 'Loading...',
    heading: 'Where do you want to book?',
    readyIn30: 'Ready in 30 minutes',
    findNearby1: 'Find a nearby',
    findNearby2: 'car wash',
    openNow: (n: number) => `${n} open now`,
    repeat: 'Repeat',
    bookAgain: 'Book again →',
    firstBooking: 'First booking',
    startNow: 'Start now',
    findWash: 'Find a car wash →',
    favorites: 'Favorites',
    noneYet: 'None yet',
    seeAll: 'See all →',
    nextBooking: 'Next booking',
    recent: 'Recent',
    all: 'All →',
    partnerBannerTitle: 'Your business is live',
    partnerBannerSub: 'See bookings, prices and hours',
    partnerBannerCta: 'Open dashboard',
  },
}

const MONTHS_SHORT: Record<Locale, string[]> = {
  el: ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}

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

export default function HomePage() {
  const router = useRouter()
  const t = useT(T)
  const { locale } = useLocale()
  const [authChecking, setAuthChecking] = useState(true)
  const [showLanding, setShowLanding] = useState(false)
  const [upcomingBooking, setUpcomingBooking] = useState<Booking | null>(null)
  const [recentLocations, setRecentLocations] = useState<Location[]>([])
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [lastBooking, setLastBooking] = useState<Booking | null>(null)
  const [activeLocationsCount, setActiveLocationsCount] = useState(0)
  const [isPartner, setIsPartner] = useState(false)

  useEffect(() => {
    const init = async () => {
      const supabase = createClient()
      const { data: sessionData } = await supabase.auth.getSession()

      if (!sessionData.session) {
        // Referral/ad link (?ref=ΚΩΔΙΚΟΣ): κράτα τον κωδικό και στείλε τον ΚΑΤΕΥΘΕΙΑΝ
        // στο sign-up με το κίνητρο «πάρε −3€».
        let ref: string | null = null
        try { ref = new URLSearchParams(window.location.search).get('ref') } catch { /* ignore */ }
        if (ref) {
          try {
            document.cookie = `ws_ref=${encodeURIComponent(ref.trim())}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`
          } catch { /* ignore */ }
          router.replace('/login?welcome=1')
          return
        }
        // Native app: μπες στη ροή της εφαρμογής. Browser επισκέπτης: δείξε το landing.
        if (Capacitor.isNativePlatform()) {
          router.replace('/welcome')
        } else {
          setShowLanding(true)
          setAuthChecking(false)
        }
        return
      }

      const user = sessionData.session.user

      // «Θυμήσου την τελευταία όψη»: αν ο ιδιοκτήτης ήταν τελευταία στο dashboard,
      // πήγαινέ τον ΚΑΤΕΥΘΕΙΑΝ εκεί (γρήγορη είσοδος, χωρίς να περνά από την εφαρμογή πελάτη).
      // Το flag τίθεται μόνο μέσα στο dashboard (verified partner), άρα είναι ασφαλές.
      try {
        if (Capacitor.isNativePlatform() && localStorage.getItem('washio_mode') === 'partner') {
          router.replace('/dashboard')
          return
        }
      } catch { /* localStorage μη διαθέσιμο — αγνόησε */ }

      // Load all data in parallel
      const today = athensToday()

      const [
        { data: upcoming },
        { data: last },
        { data: favs },
        { data: locs },
        { data: ownedLocation },
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
        // Partner check — έχει ο χρήστης δικό του πλυντήριο;
        supabase
          .from('locations')
          .select('id')
          .eq('owner_id', user.id)
          .limit(1)
          .maybeSingle(),
      ])

      setUpcomingBooking(upcoming as unknown as Booking)
      setLastBooking(last as unknown as Booking)
      setFavorites((favs as unknown as Favorite[]) || [])
      setRecentLocations((locs as Location[]) || [])
      setActiveLocationsCount(locs?.length || 0)
      setIsPartner(!!(ownedLocation as { id?: string } | null)?.id)

      setAuthChecking(false)
    }
    init()
  }, [router])

  if (showLanding) {
    return <LandingPage />
  }

  if (authChecking) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <WashioLoader />
      </main>
    )
  }

  const upcomingDate = upcomingBooking ? new Date(upcomingBooking.slot_date) : null

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center">
      <div className="w-full max-w-md md:max-w-2xl pb-24">
        <div className="px-5 pt-[calc(max(env(safe-area-inset-top),47px)+8px)] pb-6 flex flex-col gap-5">

          {/* Header — centered logo */}
          <div className="flex justify-center items-center -mb-8">
            <img src="/washio-logo.png" alt="Washio" className="h-48 md:h-40 w-auto" />
          </div>

          {/* Partner banner — εμφανίζεται μόνο σε ιδιοκτήτες πλυντηρίων */}
          {isPartner && (
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full bg-gray-900 rounded-2xl px-4 py-3.5 flex items-center gap-3 text-left"
              style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
            >
              <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                <Store size={18} className="text-white" strokeWidth={1.8} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-white leading-tight truncate">
                  {t.partnerBannerTitle}
                </p>
                <p className="text-[11px] text-white/70 mt-0.5 truncate">
                  {t.partnerBannerCta} →
                </p>
              </div>
              <ChevronRight size={18} className="text-white/70 shrink-0" />
            </button>
          )}

          <h1 className="text-[26px] font-bold tracking-tight leading-[1.15] text-gray-900 text-center">
            {t.heading}
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
                  {t.readyIn30}
                </p>
                <p className="text-[22px] font-bold tracking-tight leading-[1.15] text-white mt-2">
                  {t.findNearby1}<br />{t.findNearby2}
                </p>
                {activeLocationsCount > 0 && (
                  <div className="inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded-full bg-white/10">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <span className="text-[11px] font-semibold text-white/85">
                      {t.openNow(activeLocationsCount)}
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
                    {t.repeat}
                  </p>
                </div>
                <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">
                  {lastBooking.locations.name}
                </p>
                <p className="text-xs font-medium text-blue-600">{t.bookAgain}</p>
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
                    {t.firstBooking}
                  </p>
                </div>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{t.startNow}</p>
                <p className="text-xs font-medium text-blue-600">{t.findWash}</p>
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
                  {t.favorites}
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
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{t.noneYet}</p>
              )}
              <p className="text-xs font-medium text-blue-600">{t.seeAll}</p>
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
                  {MONTHS_SHORT[locale][upcomingDate.getMonth()]}
                </span>
                <span className="text-[15px] font-bold text-gray-900 tabular-nums leading-none mt-0.5">
                  {upcomingDate.getDate()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold tracking-[1.4px] uppercase text-gray-500">
                  {t.nextBooking}
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
                  {t.recent}
                </p>
                <Link href="/map" className="text-xs font-medium text-blue-600">{t.all}</Link>
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
                        {'// photo'}
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
        <BottomNav />

        {/* Prompt αξιολόγησης app store — μετά την 1η ολοκληρωμένη κράτηση */}
        <AppRatingPrompt />
      </div>
    </main>
  )
}