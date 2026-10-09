'use client'

import { formatDuration } from '@/lib/duration'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Capacitor } from '@capacitor/core'
import { ArrowRight, Star, RotateCw, Calendar, ChevronRight, Store, Clock, Heart, Car } from 'lucide-react'
import dynamic from 'next/dynamic'
// Landing μόνο για αποσυνδεδεμένους web επισκέπτες — όχι στο bundle των χρηστών.
const LandingPage = dynamic(() => import('./landing/page'))
import { BottomNav } from '@/components/BottomNav'
import { CouponActiveBanner } from '@/components/CouponActiveBanner'
import { WashioLoader } from '@/components/WashioLoader'
import { AppRatingPrompt } from '@/components/AppRatingPrompt'
import { useT, useLocale, Locale } from '@/lib/i18n'
import { athensToday, athensMinutesOfDay, weekdayMon1FromYmd } from '@/lib/time'
import { readPageCache, writePageCache } from '@/lib/page-cache'
import { flyerRef } from '@/lib/acq'

// Πού πάει όποιος σκανάρει flyer: 'map' (χάρτης χωρίς login) ή 'login' (κατευθείαν εγγραφή).
// Αλλάζει εδώ → ισχύει για ΟΛΑ τα flyers που κυκλοφορούν, χωρίς ξανατύπωμα.
// 9/10: 'login' — στο A/B των διαφημίσεων η εγγραφή-πρώτα έφερε ~10% εγγραφές vs ~0,6% ο χάρτης.
const FLYER_DEST: 'map' | 'login' = 'login'

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
    seeAll: 'Δες τα όλα →',
    nextBooking: 'Επόμενη κράτηση',
    recent: 'Πλυντήρια',
    all: 'Χάρτης →',
    open: 'Ανοιχτό', closed: 'Κλειστό', from: 'Από', newPlace: 'Νέο',
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
    seeAll: 'See them all →',
    nextBooking: 'Next booking',
    recent: 'Car washes',
    all: 'Map →',
    open: 'Open', closed: 'Closed', from: 'From', newPlace: 'New',
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
  photos?: string[] | null
  open?: boolean
  rating?: number | null
  reviewCount?: number
  minPrice?: number | null
  duration?: number | null
}

type LocRow = Location & {
  services?: { price: number | null; is_active: boolean | null; is_range?: boolean | null; price_min?: number | null; duration_minutes?: number | null; display_duration_minutes?: number | null }[]
  reviews?: { rating: number }[]
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
  // Αν ο server (Supabase) δεν απαντά, ΜΗΝ μένεις για πάντα στο loader:
  // μετά από 10″ δείξε μήνυμα + «Δοκίμασε ξανά».
  const [connFailed, setConnFailed] = useState(false)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let settled = false
    const watchdog = setTimeout(() => { if (!settled) setConnFailed(true) }, 10000)
    const init = async () => {
      const supabase = createClient()
      const { data: sessionData } = await supabase.auth.getSession()
      settled = true
      clearTimeout(watchdog)
      setConnFailed(false)

      if (!sessionData.session) {
        // Referral/ad link (?ref=ΚΩΔΙΚΟΣ): κράτα τον κωδικό και στείλε τον ΚΑΤΕΥΘΕΙΑΝ
        // στο sign-up με το κίνητρο «πάρε −3€».
        let ref: string | null = null
        let isFlyer = false
        try {
          const sp0 = new URLSearchParams(window.location.search)
          ref = sp0.get('ref')
          // Τυπωμένα flyers (1η παρτίδα): το QR γράφει washio.gr/?ref=WASHIO&utm_source=flyer.
          // Το ξεχωρίζουμε από τη διαφήμιση (ίδιο ref=WASHIO) μέσω utm_source → δικός του
          // κωδικός (FLYER, ίδιο −3€) και δικός του προορισμός, χωρίς να αγγίζουμε τις διαφημίσεις.
          const fr = flyerRef(sp0)
          if (fr) { isFlyer = true; ref = fr }
        } catch { /* ignore */ }
        if (ref) {
          try {
            document.cookie = `ws_ref=${encodeURIComponent(ref.trim())}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`
          } catch { /* ignore */ }
          // A/B τεστ landing (lp): «map» = βλέπει χάρτη/τιμές/ώρες ΧΩΡΙΣ login και γράφεται
          // μόνο στο «Συνέχεια». Οτιδήποτε άλλο = όπως πριν (κατευθείαν εγγραφή).
          // Tag παραλλαγής ΜΟΝΟ για κλικ από διαφήμιση Meta: lp=map (B) ή fbclid χωρίς lp (A).
          // Όχι για TikTok bio / links φίλων / flyers (?ref= χωρίς fbclid) — αλλιώς «μολύνουν» την A.
          let lp: 'map' | 'login' | null = null
          try {
            const sp = new URLSearchParams(window.location.search)
            lp = (sp.get('lp') === 'map' || (isFlyer && FLYER_DEST === 'map')) ? 'map'
              : (sp.get('lp') === 'login' || sp.get('fbclid') || isFlyer) ? 'login' : null
          } catch { /* ignore */ }
          if (lp) { try { document.cookie = `ws_lp=${lp}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax` } catch { /* ignore */ } }
          router.replace(lp === 'map' ? '/map' : '/login?welcome=1')
          return
        }
        // Native app: μπες στη ροή της εφαρμογής. Browser επισκέπτης: δείξε το landing.
        if (Capacitor.isNativePlatform()) {
          // Η εφαρμογή ανοίγει κατευθείαν στον χάρτη (πραγματικά πλυντήρια, −3€ banner).
          // Εγγραφή μόνο όταν πατήσει «Συνέχεια» σε ώρα — όχι πριν δει τίποτα.
          router.replace('/map')
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

      // Stale-while-revalidate: δείξε ΑΜΕΣΑ τα τελευταία δεδομένα, ανανέωσε από πίσω.
      type HomeCache = { upcoming: Booking | null; last: Booking | null; favs: Favorite[]; locs: Location[]; openCount?: number; partner: boolean }
      const applyHome = (c: HomeCache) => {
        setUpcomingBooking(c.upcoming)
        setLastBooking(c.last)
        setFavorites(c.favs || [])
        setRecentLocations(c.locs || [])
        setActiveLocationsCount(c.openCount ?? 0)
        setIsPartner(c.partner)
      }
      const cached = readPageCache<HomeCache>('home', user.id)
      if (cached) { applyHome(cached); setAuthChecking(false) }

      // Προφόρτωσε τις πιο πιθανές επόμενες οθόνες (κώδικας έτοιμος πριν το tap).
      router.prefetch('/map'); router.prefetch('/profile'); router.prefetch('/profile/bookings')

      // Load all data in parallel
      const today = athensToday()

      // Ξεκινά ΠΑΡΑΛΛΗΛΑ με τα παρακάτω (ίδιο round-trip): ωράριο/εξαιρέσεις σήμερα + ιστορικό σημείων.
      const extraP = Promise.all([
        supabase.from('location_hours').select('location_id, open_time, close_time, open_time2, close_time2, is_closed')
          .eq('day_of_week', weekdayMon1FromYmd(today)),
        supabase.from('location_hours_exceptions').select('location_id, is_closed').eq('exception_date', today),
        supabase.from('bookings').select('location_id').eq('user_id', user.id)
          .order('created_at', { ascending: false }).limit(20),
      ])

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
        // ΟΛΑ τα ενεργά σημεία — ίδια πηγή με τον χάρτη (is_active).
        supabase
          .from('locations')
          .select('id, name, city, slug, photos, services(price, is_active, is_range, price_min, duration_minutes, display_duration_minutes), reviews(rating)')
          .eq('is_active', true),
        // Partner check — έχει ο χρήστης δικό του πλυντήριο;
        supabase
          .from('locations')
          .select('id')
          .eq('owner_id', user.id)
          .limit(1)
          .maybeSingle(),
      ])

      // Ωράριο σήμερα + εξαιρέσεις → πραγματικό «ανοιχτά τώρα» (όχι πλήθος λίστας).
      const [{ data: hoursToday }, { data: excToday }, { data: myBookings }] = await extraP
      const nowMin = athensMinutesOfDay()
      const toMin = (s: string | null) => { if (!s) return -1; const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0) }
      const closedExc = new Set((excToday || []).filter((e: any) => e.is_closed).map((e: any) => e.location_id))
      const openIds = new Set((hoursToday || [])
        .filter((h: any) => !h.is_closed && !closedExc.has(h.location_id)
          && ((toMin(h.open_time) <= nowMin && nowMin < toMin(h.close_time))
            || (h.open_time2 && h.close_time2 && toMin(h.open_time2) <= nowMin && nowMin < toMin(h.close_time2))))
        .map((h: any) => h.location_id))

      // Σειρά: πρώτα όσα έχει ήδη κλείσει ο χρήστης (πιο πρόσφατα πρώτα), μετά τα ανοιχτά, μετά τα υπόλοιπα.
      const myOrder = new Map<string, number>()
      ;(myBookings || []).forEach((b: any, i: number) => { if (!myOrder.has(b.location_id)) myOrder.set(b.location_id, i) })
      // Κάρτα σημείου: βαθμολογία, «Από €», διάρκεια — από τα ίδια δεδομένα του πλυντηρίου.
      const summarize = (l: LocRow): Location => {
        const svc = (l.services || []).filter(s => s.is_active !== false)
        const prices = svc
          .map(s => s.is_range ? Number(s.price_min) : Number(s.price))
          .filter(p => p > 0)
        const cheapest = svc.find(s => (s.is_range ? Number(s.price_min) : Number(s.price)) === Math.min(...prices))
        const r = (l.reviews || []).map(x => Number(x.rating)).filter(x => x > 0)
        return {
          id: l.id, name: l.name, city: l.city, slug: l.slug, photos: l.photos,
          open: openIds.has(l.id),
          rating: r.length ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 10) / 10 : null,
          reviewCount: r.length,
          minPrice: prices.length ? Math.min(...prices) : null,
          duration: cheapest ? (cheapest.display_duration_minutes || cheapest.duration_minutes || null) : null,
        }
      }
      const allLocs = ((locs as unknown as LocRow[]) || []).map(summarize).sort((a, b) => {
        const ma = myOrder.get(a.id) ?? 999, mb = myOrder.get(b.id) ?? 999
        if (ma !== mb) return ma - mb
        return Number(openIds.has(b.id)) - Number(openIds.has(a.id))
      })

      const fresh: HomeCache = {
        upcoming: (upcoming as unknown as Booking) || null,
        last: (last as unknown as Booking) || null,
        favs: (favs as unknown as Favorite[]) || [],
        locs: allLocs,
        openCount: allLocs.filter(l => openIds.has(l.id)).length,
        partner: !!(ownedLocation as { id?: string } | null)?.id,
      }
      applyHome(fresh)
      writePageCache('home', user.id, fresh)

      setAuthChecking(false)
    }
    init().catch(() => { settled = true; clearTimeout(watchdog); setConnFailed(true) })
    return () => { settled = true; clearTimeout(watchdog) }
  }, [router, retryKey])

  if (showLanding) {
    return <LandingPage />
  }

  if (authChecking && connFailed) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-8">
        <div className="text-center max-w-xs">
          <p className="text-[17px] font-bold text-washio-navy">{locale === 'en' ? 'Connection is slow' : 'Η σύνδεση αργεί'}</p>
          <p className="text-[13px] text-gray-500 mt-1.5 leading-snug">
            {locale === 'en' ? 'We can’t reach our servers right now. Please try again in a moment.' : 'Δεν μπορούμε να συνδεθούμε αυτή τη στιγμή. Δοκίμασε ξανά σε λίγο.'}
          </p>
          <button
            onClick={() => { setConnFailed(false); setRetryKey(k => k + 1) }}
            className="mt-5 bg-washio-cyan text-white text-[14px] font-semibold px-6 py-3 rounded-2xl active:scale-95 transition-transform"
          >
            {locale === 'en' ? 'Try again' : 'Δοκίμασε ξανά'}
          </button>
        </div>
      </main>
    )
  }

  if (authChecking) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <WashioLoader />
      </main>
    )
  }

  const upcomingDate = upcomingBooking ? new Date(upcomingBooking.slot_date) : null
  const favIds = new Set(favorites.map(f => f.locations?.id).filter(Boolean) as string[])

  // Καρδιά σε κάρτα σημείου: προσθήκη/αφαίρεση από αγαπημένα (optimistic).
  const toggleFav = async (e: React.MouseEvent, loc: Location) => {
    e.preventDefault(); e.stopPropagation()
    const supabase = createClient()
    const { data: s } = await supabase.auth.getSession()
    const uid = s.session?.user?.id
    if (!uid) return
    const existing = favorites.find(f => f.locations?.id === loc.id)
    if (existing) {
      setFavorites(prev => prev.filter(f => f.id !== existing.id))
      await supabase.from('favorites').delete().eq('id', existing.id)
    } else {
      const tempId = 'tmp-' + loc.id
      setFavorites(prev => [...prev, { id: tempId, locations: { id: loc.id, name: loc.name, slug: loc.slug } }])
      const { data } = await supabase.from('favorites').insert({ user_id: uid, location_id: loc.id }).select('id').single()
      if (data?.id) setFavorites(prev => prev.map(f => f.id === tempId ? { ...f, id: data.id } : f))
    }
  }

  const cardShadow = { boxShadow: '0 4px 18px rgba(16,24,42,0.05)' }

  return (
    <main className="min-h-screen flex flex-col items-center relative"
      style={{ background: 'linear-gradient(180deg, #EAF8FB 0%, #F7FAFC 320px)' }}>
      {/* Διακριτικό cyan «κύμα» φόντου πάνω αριστερά. Το clipping γίνεται σε ΔΙΚΟ
          του wrapper — ΟΧΙ overflow-hidden στο <main> (έκοβε το scroll στο iOS WebView). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] overflow-hidden" aria-hidden>
        <div className="absolute -top-24 -left-28 w-[360px] h-[360px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(25,168,199,0.10) 0%, rgba(25,168,199,0) 70%)' }} />
      </div>

      <div className="relative w-full max-w-md md:max-w-2xl pb-32">
        <div className="px-5 pt-[calc(var(--safe-top)+8px)] pb-6 flex flex-col gap-5">

          {/* Header — centered logo */}
          <div className="flex justify-center items-center -mb-8">
            <img src="/washio-logo.webp" fetchPriority="high" decoding="async" alt="Washio" className="h-48 md:h-40 w-auto" />
          </div>

          {/* Partner banner — μόνο σε ιδιοκτήτες πλυντηρίων */}
          {isPartner && (
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full rounded-[22px] px-4 py-4 flex items-center gap-3.5 text-left active:scale-[0.99] transition-transform"
              style={{ background: 'linear-gradient(135deg, #16233A 0%, #10182A 100%)', boxShadow: '0 8px 22px rgba(16,24,42,0.18)' }}
            >
              <div className="w-12 h-12 rounded-full bg-washio-cyan flex items-center justify-center shrink-0">
                <Store size={20} className="text-white" strokeWidth={1.9} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold text-white leading-tight truncate">{t.partnerBannerTitle}</p>
                <p className="text-[12px] text-white/65 mt-1 truncate">{t.partnerBannerCta} →</p>
              </div>
              <ChevronRight size={20} className="text-white/70 shrink-0" />
            </button>
          )}

          <div>
            <h1 className="text-[27px] font-bold tracking-tight leading-[1.15] text-washio-navy">
              {t.heading}
            </h1>
          </div>

          {/* Hero CTA */}
          <button
            onClick={() => router.push('/map')}
            className="relative overflow-hidden rounded-[26px] px-5 py-6 text-left active:scale-[0.99] transition-transform"
            style={{ background: '#09162B', boxShadow: '0 14px 30px rgba(16,24,42,0.22)' }}
          >
            {/* Φωτογραφία (WebP 60KB) — το αυτοκίνητο πάντα δεξιά, το navy αριστερά
                σμίγει με το φόντο. Overlay από αριστερά για αναγνωσιμότητα κειμένου. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hero-car.webp"
              alt=""
              aria-hidden
              fetchPriority="high"
              decoding="async"
              className="absolute inset-y-0 right-0 h-full w-auto max-w-none object-cover pointer-events-none select-none"
            />
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'linear-gradient(90deg, #09162B 0%, rgba(9,22,43,0.92) 38%, rgba(9,22,43,0.35) 62%, rgba(9,22,43,0) 80%)' }} />

            <div className="relative flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-washio-cyan/90 text-white text-[11px] font-bold tracking-[1.2px] uppercase">
                  <Clock size={13} strokeWidth={2.2} /> {t.readyIn30}
                </span>
                <p className="text-[26px] font-bold tracking-tight leading-[1.12] text-white mt-3.5">
                  {t.findNearby1}<br />{t.findNearby2}
                </p>
                {activeLocationsCount > 0 && (
                  <div className="inline-flex items-center gap-2 mt-4 px-3 py-1.5 rounded-full bg-white/10">
                    <span className="w-2 h-2 rounded-full bg-washio-success" />
                    <span className="text-[12px] font-semibold text-white/90">{t.openNow(activeLocationsCount)}</span>
                  </div>
                )}
              </div>
              <div className="w-[62px] h-[62px] rounded-full bg-washio-cyan flex items-center justify-center shrink-0"
                style={{ boxShadow: '0 8px 22px rgba(25,168,199,0.45)' }}>
                <ArrowRight size={26} className="text-white" strokeWidth={2.2} />
              </div>
            </div>
          </button>

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-3">
            {lastBooking && lastBooking.locations ? (
              <button
                onClick={() => router.push(`/locations/${lastBooking.locations?.slug}`)}
                className="relative overflow-hidden bg-white rounded-[20px] border border-washio-border p-4 flex flex-col gap-2 text-left"
                style={{ ...cardShadow, background: 'linear-gradient(145deg, #FFFFFF 55%, #EAF8FB 100%)' }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-washio-cyan-light flex items-center justify-center">
                    <RotateCw size={16} className="text-washio-cyan-dark" strokeWidth={2} />
                  </div>
                  <p className="text-[11px] font-bold tracking-[1.3px] uppercase text-gray-500">{t.repeat}</p>
                </div>
                <p className="text-[15px] font-semibold text-washio-navy mt-1 truncate">{lastBooking.locations.name}</p>
                <p className="text-[13px] font-semibold text-washio-cyan-dark">{t.bookAgain}</p>
              </button>
            ) : (
              <button
                onClick={() => router.push('/map')}
                className="relative overflow-hidden bg-white rounded-[20px] border border-washio-border p-4 flex flex-col gap-2 text-left"
                style={{ ...cardShadow, background: 'linear-gradient(145deg, #FFFFFF 55%, #EAF8FB 100%)' }}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-washio-cyan-light flex items-center justify-center">
                    <Calendar size={16} className="text-washio-cyan-dark" strokeWidth={2} />
                  </div>
                  <p className="text-[11px] font-bold tracking-[1.3px] uppercase text-gray-500">{t.firstBooking}</p>
                </div>
                <p className="text-[15px] font-semibold text-washio-navy mt-1">{t.startNow}</p>
                <p className="text-[13px] font-semibold text-washio-cyan-dark">{t.findWash}</p>
              </button>
            )}

            <Link
              href="/profile/favorites"
              className="relative overflow-hidden rounded-[20px] border border-washio-border p-4 flex flex-col gap-2"
              style={{ ...cardShadow, background: 'linear-gradient(145deg, #FFFFFF 55%, #EAF8FB 100%)' }}
            >
              <Heart size={30} className="absolute right-3.5 bottom-3.5 text-washio-cyan/25 fill-washio-cyan/25 pointer-events-none" strokeWidth={0} />
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-washio-cyan-light flex items-center justify-center">
                  <Star size={16} className="text-washio-cyan-dark fill-washio-cyan-dark" strokeWidth={1} />
                </div>
                <p className="text-[11px] font-bold tracking-[1.3px] uppercase text-gray-500">{t.favorites}</p>
              </div>
              {favorites.length > 0 ? (
                <div className="flex items-center mt-1">
                  {favorites.slice(0, 3).map((fav, i) => (
                    <div
                      key={fav.id}
                      className="w-7 h-7 rounded-full bg-washio-navy border-2 border-white flex items-center justify-center text-white text-[11px] font-semibold"
                      style={{ marginLeft: i ? -8 : 0 }}
                    >
                      {fav.locations?.name?.charAt(0) || '?'}
                    </div>
                  ))}
                  {favorites.length > 3 && <span className="text-xs text-gray-500 ml-2">+{favorites.length - 3}</span>}
                </div>
              ) : (
                <p className="text-[15px] font-semibold text-washio-navy mt-1">{t.noneYet}</p>
              )}
              <p className="text-[13px] font-semibold text-washio-cyan-dark">{t.seeAll}</p>
            </Link>
          </div>

          {/* Upcoming booking */}
          {upcomingBooking && upcomingDate && (
            <Link
              href={`/profile/bookings/${upcomingBooking.id}`}
              className="bg-white rounded-[20px] p-4 border border-washio-border flex items-center gap-4"
              style={cardShadow}
            >
              <div className="w-14 h-14 rounded-2xl bg-white border border-washio-border flex flex-col items-center justify-center shrink-0"
                style={{ boxShadow: '0 2px 8px rgba(16,24,42,0.06)' }}>
                <span className="text-[10px] font-bold tracking-wider uppercase text-washio-navy/70">
                  {MONTHS_SHORT[locale][upcomingDate.getMonth()]}
                </span>
                <span className="text-[20px] font-bold text-washio-navy tabular-nums leading-none mt-0.5">
                  {upcomingDate.getDate()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold tracking-[1.3px] uppercase text-gray-500">{t.nextBooking}</p>
                <p className="text-[15px] font-semibold text-washio-navy mt-1 truncate">
                  {upcomingBooking.locations?.name} · {upcomingBooking.slot_start_time?.slice(0, 5)}
                </p>
                <p className="text-[12px] font-medium text-washio-cyan mt-0.5 font-mono tracking-wider">
                  {upcomingBooking.booking_ref}
                </p>
              </div>
              <ChevronRight size={18} className="text-washio-cyan-dark shrink-0" />
            </Link>
          )}

          {/* Πλυντήρια — πραγματικά σημεία (ίδια με τον χάρτη) */}
          {recentLocations.length > 0 && (
            <div>
              <div className="flex justify-between items-baseline mb-3">
                <p className="text-[13px] font-bold tracking-[1.6px] uppercase text-washio-navy">{t.recent}</p>
                <Link href="/map" className="text-[14px] font-semibold text-washio-cyan-dark">{t.all}</Link>
              </div>
              <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-5 px-5 pb-2 snap-x">
                {recentLocations.map(loc => (
                  <Link
                    key={loc.id}
                    href={`/locations/${loc.slug}`}
                    className="snap-start flex-shrink-0 w-[168px] bg-white rounded-[18px] border border-washio-border overflow-hidden flex flex-col"
                    style={cardShadow}
                  >
                    <div className="h-[92px] relative bg-washio-navy">
                      {loc.photos && loc.photos.length > 0 ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={loc.photos[0]} alt={loc.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center"
                          style={{ background: 'linear-gradient(135deg, #16233A 0%, #0E4A63 100%)' }}>
                          <span className="text-white text-[26px] font-semibold">{loc.name?.charAt(0) || '·'}</span>
                        </div>
                      )}
                      <span className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${loc.open ? 'bg-white/95 text-washio-navy' : 'bg-black/55 text-white/85'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${loc.open ? 'bg-washio-success' : 'bg-gray-400'}`} />
                        {loc.open ? t.open : t.closed}
                      </span>
                      <button
                        onClick={e => toggleFav(e, loc)}
                        className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/25 backdrop-blur-sm flex items-center justify-center"
                        aria-label="favorite"
                      >
                        <Heart size={15} className={favIds.has(loc.id) ? 'text-white fill-white' : 'text-white'} strokeWidth={2} />
                      </button>
                    </div>
                    <div className="p-3 flex flex-col gap-1.5">
                      <p className="text-[14px] font-semibold text-washio-navy truncate">{loc.name}</p>
                      <p className="text-[12px] text-gray-500 flex items-center gap-1">
                        <Star size={12} className="text-washio-cyan-dark fill-washio-cyan-dark" strokeWidth={1} />
                        {loc.rating ? (
                          <><span className="font-semibold text-washio-navy">{loc.rating.toFixed(1)}</span> ({loc.reviewCount})</>
                        ) : (
                          <span>{t.newPlace}</span>
                        )}
                      </p>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <div className="flex items-center gap-2 text-[11px] text-gray-500 min-w-0">
                          {loc.minPrice != null && (
                            <span className="flex items-center gap-1 whitespace-nowrap"><Car size={12} />{t.from} €{loc.minPrice}</span>
                          )}
                          {loc.duration != null && (
                            <span className="flex items-center gap-1 whitespace-nowrap"><Clock size={12} />{formatDuration(loc.duration, locale)}</span>
                          )}
                        </div>
                        <span className="w-7 h-7 rounded-full bg-washio-cyan flex items-center justify-center shrink-0">
                          <ArrowRight size={14} className="text-white" strokeWidth={2.4} />
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Nav */}
        <BottomNav />

        {/* Web-only: όποιος έχει κουπόνι (referral/ad) → σπρώξ' τον στο native app. */}
        <CouponActiveBanner />

        {/* Prompt αξιολόγησης app store — μετά την 1η ολοκληρωμένη κράτηση */}
        <AppRatingPrompt />
      </div>
    </main>
  )
}
