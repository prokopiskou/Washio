'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LineChart, Line, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { createClient } from '@/lib/supabase/client'
import { lightTap, selectionHaptic, errorHaptic } from '@/lib/haptics'
import { CORE_SERVICES, type CatalogService } from '@/lib/services-catalog'
import { ymdFromLocalDate } from '@/lib/time'
import { isAdminEmail } from '@/lib/admins'
import { useBodyScrollLock } from '@/lib/useBodyScrollLock'
import { WashioLoader } from '@/components/WashioLoader'
import { Capacitor } from '@capacitor/core'
import { registerNativePush, nativePushGranted } from '@/lib/native-push'
import PushInit from '@/components/PushInit'

type TabKey = 'overview' | 'bookings' | 'calendar' | 'services' | 'hours' | 'settings' | 'staff' | 'feedback'
type Period = '7D' | '30D' | '3M' | '6M' | '12M'
type Metric = 'revenue' | 'bookings'

type Booking = {
  id: string
  slot_date?: string
  slot_start_time?: string
  total_amount?: number
  status?: string
  service_id?: string
  user_id?: string
  created_at?: string
  stripe_payment_status?: string | null
  source?: string | null
  customer_name?: string | null
  customer_phone?: string | null
  duration_minutes?: number | null
  profiles?: { full_name?: string; phone?: string; email?: string } | null
  services?: { name?: string } | null
}

type BookableService = {
  id: string
  name: string
  price: number
  price_moto?: number | null
  price_suv?: number | null
  duration_minutes: number
  is_active: boolean
}

type DashboardService = {
  id: string
  service_name: string
  price: number
  price_override?: number
  price_moto?: number
  is_active: boolean
}

type LocationHour = {
  id?: string
  day_of_week: number
  is_open: boolean
  is_closed?: boolean
  open_time: string
  close_time: string
}

type HourException = {
  id?: string
  exception_date: string
  periods: { open: string; close: string }[]
  is_closed: boolean
  closed_from?: string | null
  closed_to?: string | null
}

type StaffMember = {
  id: string
  full_name: string
  role: string
  phone: string
}

type Review = {
  id: string
  rating: number
  comment: string
  created_at: string
}

const DAYS = ['Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο', 'Κυριακή']
const HOUR_OPTIONS = Array.from({ length: 16 }, (_, i) => {
  const hour = 7 + i
  return `${String(hour).padStart(2, '0')}:00`
})

// Όλες οι μέρες ΚΛΕΙΣΤΕΣ by default — ο ιδιοκτήτης ανοίγει & ορίζει ό,τι θέλει.
const defaultHours: LocationHour[] = DAYS.map((_, idx) => ({
  day_of_week: idx + 1,
  is_open: false,
  open_time: '08:00',
  close_time: '20:00',
}))

const PERIODS: { key: Period; label: string }[] = [
  { key: '7D', label: '7Μ' },
  { key: '30D', label: '30Μ' },
  { key: '3M', label: '3Μη' },
  { key: '6M', label: '6Μη' },
  { key: '12M', label: '12Μη' },
]

const METRICS: { key: Metric; label: string }[] = [
  { key: 'revenue', label: 'Έσοδα' },
  { key: 'bookings', label: 'Κρατήσεις' },
]

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()

    // Χαρακτηριστικός ήχος — 3 beeps
    const beepTimes = [0, 0.3, 0.6]
    beepTimes.forEach(startTime => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime + startTime)
      gain.gain.setValueAtTime(0.5, ctx.currentTime + startTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startTime + 0.25)
      osc.start(ctx.currentTime + startTime)
      osc.stop(ctx.currentTime + startTime + 0.25)
    })
  } catch (e) {
    console.log('Audio not supported')
  }
}

function flashTabTitle(locationName: string) {
  const originalTitle = document.title
  const flashTitle = '🔔 Νέα Κράτηση!'
  let count = 0
  const interval = setInterval(() => {
    document.title = count % 2 === 0 ? flashTitle : originalTitle
    count++
    if (count > 10) {
      clearInterval(interval)
      document.title = originalTitle
    }
  }, 800)
}

async function showBrowserNotification(locationName: string) {
  if (!('Notification' in window)) return

  if (Notification.permission === 'default') {
    await Notification.requestPermission()
  }

  if (Notification.permission === 'granted') {
    new Notification('🔔 Νέα Κράτηση! — Washio', {
      body: `Νέα κράτηση στο ${locationName}`,
      icon: '/washio_logo.png',
      requireInteraction: true, // Δεν εξαφανίζεται μόνο του
    })
  }
}

function triggerNewBookingAlert(locationName: string) {
  playNotificationSound()
  flashTabTitle(locationName)
  showBrowserNotification(locationName)
}

export default function DashboardPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<TabKey>('overview')
  const [loading, setLoading] = useState(true)
  const [location, setLocation] = useState<any | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [services, setServices] = useState<DashboardService[]>([])
  const [hours, setHours] = useState<LocationHour[]>(defaultHours)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [savingHours, setSavingHours] = useState(false)
  const [newStaffName, setNewStaffName] = useState('')
  const [newStaffRole, setNewStaffRole] = useState('Τεχνικός')
  const [newStaffPhone, setNewStaffPhone] = useState('')
  const [newBookingsCount, setNewBookingsCount] = useState(0)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'created_at' | 'slot_date'>('created_at')
  const [calendarDate, setCalendarDate] = useState<Date>(new Date())
  const [calendarBookings, setCalendarBookings] = useState<Booking[]>([])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [exceptions, setExceptions] = useState<HourException[]>([])
  const [showExceptionPicker, setShowExceptionPicker] = useState(false)
  const [exceptionDate, setExceptionDate] = useState('')
  const [exceptionPeriods, setExceptionPeriods] = useState<{ open: string; close: string }[]>([{ open: '09:00', close: '17:00' }])
  const [exceptionClosed, setExceptionClosed] = useState(false)
  // Νέο μοντέλο εξαιρέσεων: 'day' = κλειστό όλη μέρα, 'hours' = κλειστό από-έως.
  const [exceptionMode, setExceptionMode] = useState<'day' | 'hours'>('day')
  const [exceptionFrom, setExceptionFrom] = useState('12:00')
  const [exceptionTo, setExceptionTo] = useState('15:00')
  // Ρυθμίσεις: μάνικες / θέσεις εξυπηρέτησης.
  const [capacity, setCapacity] = useState(1)
  const [savingCapacity, setSavingCapacity] = useState(false)
  const [capacitySaved, setCapacitySaved] = useState(false)
  // Support mode: admin βλέπει/χειρίζεται το dashboard συγκεκριμένου πλυντηρίου.
  const [supportMode, setSupportMode] = useState(false)
  // Κεντρικός κατάλογος βασικών υπηρεσιών — από τη βάση (admin-managed),
  // με fallback το hardcoded seed μέχρι να τρέξει το SQL.
  const [catalog, setCatalog] = useState<CatalogService[]>(CORE_SERVICES)
  // Χειροκίνητη κράτηση (ημερολόγιο).
  const [bookableServices, setBookableServices] = useState<BookableService[]>([])
  const [showManualForm, setShowManualForm] = useState(false)
  // Όνομα υπηρεσίας από τον ΚΑΤΑΛΟΓΟ — όχι id, ώστε ο πλυντηριάς να μπορεί
  // να περάσει ραντεβού και για υπηρεσία που δεν έχει ενεργοποιήσει στην πλατφόρμα.
  const [manualServiceName, setManualServiceName] = useState('')
  const [manualTime, setManualTime] = useState('10:00')
  const [manualFirstName, setManualFirstName] = useState('')
  const [manualLastName, setManualLastName] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [manualSaving, setManualSaving] = useState(false)
  const [manualError, setManualError] = useState('')
  const [notifPermission, setNotifPermission] = useState<string>('default')
  const [chartPeriod, setChartPeriod] = useState<Period>('6M')
  const [chartMetric, setChartMetric] = useState<Metric>('revenue')
  const locationIdRef = useRef<string | null>(null)
  const calendarDateRef = useRef<Date>(calendarDate)
  // Cleanup του realtime channel + polling interval (ορίζεται μέσα στο loadDashboard).
  const cleanupRef = useRef<(() => void) | null>(null)
  useEffect(() => { calendarDateRef.current = calendarDate }, [calendarDate])

  useEffect(() => {
    (async () => {
      // NATIVE (iOS/Android): έλεγχος της ΠΡΑΓΜΑΤΙΚΗΣ άδειας FCM, όχι του
      // web Notification API (που δεν υπάρχει στο native webview). Αλλιώς το
      // κουμπί «Ενεργοποίηση» ξαναεμφανιζόταν σε κάθε άνοιγμα του app.
      if (Capacitor.isNativePlatform()) {
        const granted = await nativePushGranted()
        setNotifPermission(granted ? 'granted' : 'default')
        return
      }
      if ('Notification' in window) {
        setNotifPermission(Notification.permission)
      }
    })()
  }, [])

  // Κλείδωμα body όσο είναι ανοιχτό bottom-sheet — fix για το iOS
  // «πεδία ορατά αλλά δεν πατιούνται» (hit-testing offset με keyboard).
  useBodyScrollLock(showManualForm || showExceptionPicker)

  // «Θυμήσου την τελευταία όψη»: μαρκάρω ότι ο χρήστης είναι στο dashboard,
  // ώστε την επόμενη φορά που ανοίγει το app να έρθει κατευθείαν εδώ.
  // ΜΟΝΟ όταν όντως έχει πλυντήριο — αλλιώς ένας πελάτης που έπεσε εδώ
  // θα κλειδωνόταν σε owner mode σε κάθε άνοιγμα του app.
  useEffect(() => {
    if (!location?.id) return
    try { localStorage.setItem('washio_mode', 'partner') } catch { /* ignore */ }
  }, [location?.id])

  const [notifBusy, setNotifBusy] = useState(false)

  const requestNotifications = async () => {
    if (notifBusy) return
    setNotifBusy(true)
    try {
      // NATIVE app (iOS/Android): εγγραφή μέσω FCM.
      if (Capacitor.isNativePlatform()) {
        const supabase = createClient()
        const { data: sess } = await supabase.auth.getSession()
        const userId = sess.session?.user?.id
        if (!userId) { alert('Χρειάζεται να είσαι συνδεδεμένος.'); return }
        const result = await registerNativePush(userId)
        setNotifPermission(result.ok ? 'granted' : 'denied')
        if (!result.ok) {
          const r = result.reason || 'άγνωστο'
          if (r.includes('not implemented') || r.includes('UNIMPLEMENTED')) {
            alert('Τρέχεις παλιό build χωρίς ειδοποιήσεις. Κάνε update από το TestFlight στο 1.0.2 (5).')
          } else if (r.startsWith('permission')) {
            alert('Δεν δόθηκε άδεια. Ενεργοποίησέ τες από Ρυθμίσεις → Washio → Ειδοποιήσεις.')
          } else {
            alert('Οι ειδοποιήσεις δεν ενεργοποιήθηκαν.\nΛόγος: ' + r)
          }
        } else {
          selectionHaptic()
          alert('Οι ειδοποιήσεις ενεργοποιήθηκαν! ✅')
        }
        return
      }

      // 1) WEB: υπάρχει καθόλου API ειδοποιήσεων;
      if (typeof Notification === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('Η συσκευή σου δεν υποστηρίζει ειδοποιήσεις μέσα από το app. Δοκίμασε να ανοίξεις το washio.gr από τον browser (Safari/Chrome) και ενεργοποίησέ τες από εκεί.')
        return
      }

      // 2) Άδεια χρήστη.
      const permission = await Notification.requestPermission()
      setNotifPermission(permission)
      if (permission !== 'granted') {
        const isDesktop = !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
        if (permission === 'denied' && isDesktop) {
          alert('Οι ειδοποιήσεις είναι μπλοκαρισμένες σε αυτόν τον browser για το washio.gr.\n\nΞεμπλόκαρέ τες: πάτησε το εικονίδιο 🔒 (ή ⚙️) αριστερά από τη διεύθυνση → «Ειδοποιήσεις» → «Να επιτρέπεται», μετά κάνε refresh και πάτησε ξανά «Ενεργοποίηση».')
        } else if (permission === 'denied') {
          alert('Οι ειδοποιήσεις είναι μπλοκαρισμένες. Ενεργοποίησέ τες από τις Ρυθμίσεις του browser/συσκευής για το washio.gr και δοκίμασε ξανά.')
        } else {
          alert('Οι ειδοποιήσεις δεν ενεργοποιήθηκαν. Δοκίμασε ξανά και πάτησε «Επιτρέπω» στο παράθυρο του browser.')
        }
        return
      }

      // 3) Πραγματική εγγραφή push (service worker + subscription + αποθήκευση).
      const supabase = createClient()
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess.session?.user?.id
      if (!userId) { alert('Χρειάζεται να είσαι συνδεδεμένος.'); return }

      const registration = await navigator.serviceWorker.register('/sw.js')
      const existing = await registration.pushManager.getSubscription()
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      })

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, userId }),
      })
      if (!res.ok) { alert('Κάτι πήγε στραβά στην εγγραφή. Δοκίμασε ξανά.'); return }

      selectionHaptic()
    } catch (err) {
      console.error('Notif enable error:', err)
      alert('Δεν ήταν δυνατή η ενεργοποίηση των ειδοποιήσεων σε αυτή τη συσκευή.')
    } finally {
      setNotifBusy(false)
    }
  }

  const loadCalendarBookings = async (date: Date) => {
    if (!location?.id) return
    setCalendarLoading(true)
    const supabase = createClient()
    // ΤΟΠΙΚΗ ημερομηνία (όχι UTC): στο +3 το toISOString γύριζε την ΠΡΟΗΓΟΥΜΕΝΗ μέρα.
    const dateStr = ymdFromLocalDate(date)
    const { data } = await supabase
      .from('bookings')
      .select('id, slot_start_time, total_amount, status, duration_minutes, source, customer_name, stripe_payment_status, profiles(full_name), services(name)')
      .eq('location_id', location.id)
      .eq('slot_date', dateStr)
      .not('status', 'in', '("cancelled")')
      .order('slot_start_time', { ascending: true })
    setCalendarBookings((data as Booking[]) || [])
    setCalendarLoading(false)
  }

  useEffect(() => {
    if (activeTab === 'calendar') loadCalendarBookings(calendarDate)
  }, [activeTab, calendarDate, location])

  useEffect(() => {
    let disposed = false
    const loadDashboard = async () => {
      const supabase = createClient()
      const { data: authData } = await supabase.auth.getSession()
      const user = authData.session?.user

      if (!user) {
        router.push('/login')
        return
      }

      // Support mode: αν ο συνδεδεμένος είναι ADMIN και το URL έχει ?location=<id>,
      // φορτώνουμε ΕΚΕΙΝΟ το πλυντήριο (η DB πρόσβαση ανοίγει από τα RLS policies
      // του supabase/admin_support_access.sql). Αλλιώς: το δικό του σημείο.
      const supportLocationId = new URLSearchParams(window.location.search).get('location')
      const isSupport = isAdminEmail(user.email) && !!supportLocationId
      setSupportMode(isSupport)

      const locationLoad = isSupport
        ? await supabase
            .from('locations')
            .select('*')
            .eq('id', supportLocationId)
            .maybeSingle()
        : await supabase
            .from('locations')
            .select('*')
            .eq('owner_id', user.id)
            .maybeSingle()

      if (locationLoad.error) console.error('Dashboard location load error')
      let ownerLocation = locationLoad.data

      // Fallback με EMAIL: αν δεν βρέθηκε πρατήριο με owner_id, δοκίμασε να το
      // δέσεις μέσω του email onboarding (self-heal), και ξαναφόρτωσε.
      if (!isSupport && !ownerLocation?.id) {
        try {
          const res = await fetch('/api/dashboard/claim', { method: 'POST' })
          const j = await res.json()
          if (j?.locationId) {
            const re = await supabase.from('locations').select('*').eq('id', j.locationId).maybeSingle()
            if (re.data) ownerLocation = re.data
          }
        } catch { /* best-effort */ }
      }

      setLocation(ownerLocation)

      if (!ownerLocation?.id) {
        setLoading(false)
        return
      }

      const locationId = ownerLocation.id
      locationIdRef.current = locationId

      // Μάνικες / θέσεις εξυπηρέτησης του πλυντηρίου.
      setCapacity(Math.max(1, Number((ownerLocation as { capacity?: number }).capacity) || 1))

      // Μόνο τελευταίοι 12 μήνες (όσο και η μεγαλύτερη περίοδος στατιστικών) και
      // έως 5000 γραμμές — πριν: ΟΛΕΣ οι κρατήσεις χωρίς όριο (Supabase κόβει
      // σιωπηλά στις 1000 → λάθος στατιστικά, βαρύ φορτίο κάθε 30'').
      const sinceYmd = (() => { const d = new Date(); d.setMonth(d.getMonth() - 12); return ymdFromLocalDate(d) })()
      const loadBookings = () => supabase.from('bookings')
        .select('id, slot_date, slot_start_time, total_amount, status, service_id, user_id, created_at, stripe_payment_status, source, customer_name, customer_phone, duration_minutes, profiles(full_name, phone, email)')
        .eq('location_id', locationId)
        .gte('slot_date', sinceYmd)
        .order('created_at', { ascending: false })
        .range(0, 4999)

      const [bookingsRes, addonsRes, servicesRes, locationAddonsRes, hoursRes, staffRes, reviewsRes] = await Promise.all([
        loadBookings(),
        supabase.from('addons').select('id, name, price, sort_order').eq('is_active', true).order('sort_order', { ascending: true }),
        supabase.from('services').select('id, name, price, price_moto, price_suv, duration_minutes, is_active, sort_order').eq('location_id', locationId).order('sort_order', { ascending: true }),
        supabase.from('location_addons').select('addon_id, price_override').eq('location_id', locationId),
        supabase.from('location_hours').select('id, day_of_week, is_closed, open_time, close_time').eq('location_id', locationId).order('day_of_week', { ascending: true }),
        supabase.from('staff').select('id, full_name, role, phone').eq('location_id', locationId).order('created_at', { ascending: false }),
        supabase.from('reviews').select('id, rating, comment, created_at').eq('location_id', locationId).order('created_at', { ascending: false }),
      ])

      setBookings((bookingsRes.data as Booking[]) || [])

      const allAddons = (addonsRes.data as any[]) || []
      const locationAddonsMap: Record<string, any> = {}
      ;(locationAddonsRes.data || []).forEach((a: any) => { locationAddonsMap[a.addon_id] = a })
      const activeIds = new Set(Object.keys(locationAddonsMap))

      setServices(allAddons.map((a: any) => ({
        id: a.id,
        service_name: a.name,
        price: a.price,
        price_override: locationAddonsMap[a.id]?.price_override ?? undefined,
        price_moto: (servicesRes.data as any[]).find((s: any) => s.id === a.id)?.price_moto ?? undefined,
        is_active: activeIds.has(a.id),
      })))

      // Βασικές υπηρεσίες του πλυντηρίου (τιμές, ενεργές/ανενεργές, ημερολόγιο).
      setBookableServices(((servicesRes.data as any[]) || []).map(s => ({
        id: s.id,
        name: s.name,
        price: Number(s.price) || 0,
        price_moto: s.price_moto != null ? Number(s.price_moto) : null,
        price_suv: s.price_suv != null ? Number(s.price_suv) : null,
        duration_minutes: Math.max(30, Number(s.duration_minutes) || 30),
        is_active: s.is_active !== false,
      })))

      setStaff((staffRes.data as StaffMember[]) || [])
      setReviews((reviewsRes.data as Review[]) || [])
      if ((hoursRes.data as any[] | null)?.length) {
        const normalizedHours = (hoursRes.data as any[]).map(h => ({
          id: h.id,
          day_of_week: h.day_of_week,
          is_open: !h.is_closed,
          open_time: h.open_time,
          close_time: h.close_time,
        }))
        setHours(normalizedHours)
      }

      const { data: exceptionsData } = await supabase
        .from('location_hours_exceptions')
        .select('id, exception_date, periods, is_closed, closed_from, closed_to')
        .eq('location_id', locationId)
        .order('exception_date', { ascending: true })
      setExceptions((exceptionsData as HourException[]) || [])

      // Κεντρικός κατάλογος βασικών υπηρεσιών (admin-managed).
      const { data: catalogData } = await supabase
        .from('service_catalog')
        .select('name, duration_minutes, vehicles')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (catalogData && catalogData.length > 0) {
        setCatalog(catalogData.map((c: any) => ({
          name: c.name,
          duration_minutes: Math.max(30, Number(c.duration_minutes) || 30),
          vehicles: (Array.isArray(c.vehicles) ? c.vehicles : ['ΙΧ', 'SUV']) as CatalogService['vehicles'],
        })))
      }

      setLoading(false)

      const locationName = ownerLocation.name
      const channel = supabase.channel(`bookings-changes-${locationId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings', filter: `location_id=eq.${locationId}` },
          (payload) => {
            console.log('NEW BOOKING RECEIVED:', payload)
            const nb = payload.new as Booking
            setBookings(prev => [nb, ...prev])
            setNewBookingsCount(prev => prev + 1)
            triggerNewBookingAlert(locationName)
            // Νέα κράτηση → εμφανίζεται ΑΜΕΣΩΣ στο calendar αν αφορά τη μέρα που βλέπει ο πρατηριούχος.
            const viewedDate = ymdFromLocalDate(calendarDateRef.current)
            if ((nb as any).slot_date === viewedDate && nb.status !== 'cancelled' && (nb.status as string) !== 'no_show') {
              setCalendarBookings(prev => {
                if (prev.some(b => b.id === nb.id)) return prev
                return [...prev, nb].sort((a, b) =>
                  ((a as any).slot_start_time || '').localeCompare((b as any).slot_start_time || ''))
              })
            }
          })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `location_id=eq.${locationId}` },
          (payload) => {
            console.log('BOOKING UPDATED:', payload)
            setBookings(prev => prev.map(b => b.id === payload.new.id ? { ...b, ...payload.new } : b))
            // Ακύρωση / no-show → φεύγει ΑΜΕΣΩΣ από το calendar του πρατηριούχου.
            const newStatus = (payload.new as Booking).status
            setCalendarBookings(prev =>
              (newStatus === 'cancelled' || newStatus === 'no_show')
                ? prev.filter(b => b.id !== payload.new.id)
                : prev.map(b => b.id === payload.new.id ? { ...b, ...payload.new } : b)
            )
          })
        .subscribe((status, err) => {
          console.log('Realtime subscription status:', status)
          if (err) console.error('Realtime error:', err)
        })

      const interval = setInterval(async () => {
        // ΙΔΙΟ select με το αρχικό — αλλιώς το auto-refresh έσβηνε τα πεδία
        // πληρωμής (μετρητά/κάρτα, source, customer_name) κάθε 30''.
        const { data } = await loadBookings()
        if (data) setBookings(data as Booking[])
      }, 30000)

      // Αν το component ξε-mount-άρισε όσο φορτώναμε, καθάρισε αμέσως.
      if (disposed) { supabase.removeChannel(channel); clearInterval(interval); return }
      cleanupRef.current = () => { supabase.removeChannel(channel); clearInterval(interval) }
    }
    loadDashboard()
    // ΠΡΑΓΜΑΤΙΚΟ cleanup του effect (πριν, το return ήταν μέσα στην async
    // συνάρτηση και δεν έτρεχε ποτέ → leak channel + interval σε κάθε mount).
    return () => {
      disposed = true
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [router])

  // Chart data based on period and metric
  const chartData = useMemo(() => {
    const now = new Date()

    if (chartPeriod === '7D' || chartPeriod === '30D') {
      const days = chartPeriod === '7D' ? 7 : 30
      const points = Array.from({ length: days }, (_, i) => {
        const d = new Date(now)
        d.setDate(now.getDate() - (days - 1 - i))
        const dateStr = ymdFromLocalDate(d)
        return {
          label: `${d.getDate()}/${d.getMonth() + 1}`,
          dateStr,
          revenue: 0,
          bookings: 0,
        }
      })
      bookings.forEach(b => {
        if (!b.slot_date) return
        const point = points.find(p => p.dateStr === b.slot_date)
        if (!point) return
        if (b.status !== 'cancelled') point.bookings++
        if (b.status === 'completed') point.revenue += Number(b.total_amount || 0)
      })
      return points.map(({ label, revenue, bookings: bCount }) => ({ label, revenue, bookings: bCount }))
    }

    const months = chartPeriod === '3M' ? 3 : chartPeriod === '6M' ? 6 : 12
    const points = Array.from({ length: months }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      return { key, label: d.toLocaleDateString('el-GR', { month: 'short', timeZone: 'Europe/Athens' }), revenue: 0, bookings: 0 }
    })
    bookings.forEach(b => {
      if (!b.slot_date) return
      const d = new Date(b.slot_date)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      const point = points.find(p => p.key === key)
      if (!point) return
      if (b.status !== 'cancelled') point.bookings++
      if (b.status === 'completed') point.revenue += Number(b.total_amount || 0)
    })
    return points.map(({ label, revenue, bookings: bCount }) => ({ label, revenue, bookings: bCount }))
  }, [bookings, chartPeriod])

  const avgRating = useMemo(() => {
    if (!reviews.length) return 0
    return reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / reviews.length
  }, [reviews])

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const monthlyBookings = bookings.filter(b => b.slot_date && new Date(b.slot_date) >= monthStart)
  const monthlyRevenue = monthlyBookings.filter(b => b.status === 'completed').reduce((sum, b) => sum + Number(b.total_amount || 0), 0)
  const todayBookings = bookings.filter(b => b.slot_date === ymdFromLocalDate(new Date()))

  const statusClass = (status?: string) => {
    if (status === 'pending') return 'bg-amber-50 text-amber-600'
    if (status === 'confirmed') return 'bg-blue-50 text-blue-600'
    if (status === 'completed') return 'bg-green-50 text-green-600'
    if (status === 'cancelled') return 'bg-red-50 text-red-500'
    return 'bg-gray-50 text-gray-500'
  }

  const statusLabel = (status?: string) => {
    if (status === 'pending') return 'Εκκρεμεί'
    if (status === 'confirmed') return 'Επιβεβαιώθηκε'
    if (status === 'completed') return 'Ολοκληρώθηκε'
    if (status === 'cancelled') return 'Ακυρώθηκε'
    return status || '—'
  }

  const toggleAddon = async (service: DashboardService) => {
    const supabase = createClient()
    if (service.is_active) {
      await supabase.from('location_addons').delete().eq('location_id', location.id).eq('addon_id', service.id)
      setServices(prev => prev.map(s => s.id === service.id ? { ...s, is_active: false, price_override: undefined } : s))
    } else {
      await supabase.from('location_addons').insert({ location_id: location.id, addon_id: service.id })
      setServices(prev => prev.map(s => s.id === service.id ? { ...s, is_active: true } : s))
    }
  }

  const updatePriceOverride = async (service: DashboardService, val: number) => {
    const supabase = createClient()
    await supabase.from('location_addons').update({ price_override: val }).eq('location_id', location.id).eq('addon_id', service.id)
    setServices(prev => prev.map(s => s.id === service.id ? { ...s, price_override: val } : s))
  }

  const saveHours = async () => {
    if (!location?.id) return
    setSavingHours(true)
    const supabase = createClient()
    // Delete + insert αντί για upsert onConflict — δεν εξαρτάται από unique
    // constraint στον πίνακα (που έλειπε και έσκαγε με 400).
    const { error: delErr } = await supabase.from('location_hours').delete().eq('location_id', location.id)
    if (delErr) { setSavingHours(false); alert('Σφάλμα αποθήκευσης ωραρίου: ' + delErr.message); return }
    const rows = hours.map(row => ({
      location_id: location.id,
      day_of_week: row.day_of_week,
      is_closed: !row.is_open,
      open_time: row.open_time,
      close_time: row.close_time,
    }))
    const { error: insErr } = await supabase.from('location_hours').insert(rows)
    setSavingHours(false)
    if (insErr) { alert('Σφάλμα αποθήκευσης ωραρίου: ' + insErr.message); return }
    alert('Το ωράριο αποθηκεύτηκε ✅')
  }

  const saveException = async () => {
    if (!location?.id || !exceptionDate) return
    if (exceptionMode === 'hours' && exceptionFrom >= exceptionTo) return
    const supabase = createClient()
    await supabase.from('location_hours_exceptions').upsert({
      location_id: location.id,
      exception_date: exceptionDate,
      periods: [],
      is_closed: exceptionMode === 'day',
      closed_from: exceptionMode === 'hours' ? exceptionFrom : null,
      closed_to: exceptionMode === 'hours' ? exceptionTo : null,
    }, { onConflict: 'location_id,exception_date' })

    const { data } = await supabase
      .from('location_hours_exceptions')
      .select('id, exception_date, periods, is_closed, closed_from, closed_to')
      .eq('location_id', location.id)
      .order('exception_date', { ascending: true })
    setExceptions((data as HourException[]) || [])
    setShowExceptionPicker(false)
    setExceptionDate('')
    setExceptionMode('day')
    setExceptionFrom('12:00')
    setExceptionTo('15:00')
  }

  // Ενημέρωση βασικής υπηρεσίας (τιμές ΙΧ/SUV/Μοτο, ενεργή/ανενεργή).
  const updateBaseService = async (id: string, patch: Partial<BookableService>) => {
    const supabase = createClient()
    const { error } = await supabase.from('services').update(patch).eq('id', id)
    if (!error) {
      setBookableServices(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
      selectionHaptic()
    } else {
      errorHaptic()
    }
  }

  // Toggle βασικής υπηρεσίας από τον ΚΕΝΤΡΙΚΟ κατάλογο.
  // Αν το σημείο δεν έχει ακόμα τη συγκεκριμένη υπηρεσία, δημιουργείται server-side.
  // OPTIMISTIC: το toggle γυρνάει ΑΜΕΣΩΣ — αν αποτύχει ο server, επανέρχεται με μήνυμα.
  const toggleCoreService = async (name: string, existingId: string | null, nextActive: boolean) => {
    if (!location?.id) return
    // Υπάρχον row + απενεργοποίηση → απλό update.
    if (existingId && !nextActive) {
      setBookableServices(prev => prev.map(s => s.id === existingId ? { ...s, is_active: false } : s))
      await updateBaseService(existingId, { is_active: false })
      return
    }
    // Optimistic: το toggle ανάβει ΑΜΕΣΩΣ — χωρίς αναμονή server.
    if (existingId) {
      setBookableServices(prev => prev.map(s => s.id === existingId ? { ...s, is_active: nextActive } : s))
    } else {
      // Placeholder με κενό id: ο διακόπτης δείχνει ενεργός, τα πεδία τιμών
      // εμφανίζονται μόλις έρθει το πραγματικό row από τον server.
      setBookableServices(prev => [...prev, {
        id: '',
        name,
        price: 0,
        price_moto: null,
        price_suv: null,
        duration_minutes: catalog.find(c => c.name === name)?.duration_minutes || 30,
        is_active: true,
      }])
    }
    selectionHaptic()

    // Επαναφορά του optimistic state σε αποτυχία.
    const revert = () => setBookableServices(prev => prev
      .filter(s => !(s.id === '' && s.name === name))
      .map(s => s.id === existingId ? { ...s, is_active: !nextActive } : s))

    try {
      const res = await fetch('/api/services/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: location.id, name, active: nextActive }),
      })
      // Ασφαλές parse: αν ο server γυρίσει μη-JSON (crash page), να ΦΑΝΕΙ το σφάλμα.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let json: { service?: any; error?: string } = {}
      try { json = await res.json() } catch { json = { error: `Σφάλμα server (HTTP ${res.status})` } }
      if (!res.ok || !json.service) {
        revert()
        errorHaptic()
        // Το σφάλμα πρέπει να ΦΑΙΝΕΤΑΙ — όχι σιωπηλή δόνηση.
        alert(`Δεν ενεργοποιήθηκε η υπηρεσία: ${json.error || 'άγνωστο σφάλμα'}`)
        return
      }
      const svc = json.service
      setBookableServices(prev => {
        const cleaned = prev.filter(s => !(s.id === '' && s.name === name))
        const exists = cleaned.some(s => s.id === svc.id)
        const mapped: BookableService = {
          id: svc.id,
          name: svc.name,
          price: Number(svc.price) || 0,
          price_moto: svc.price_moto != null ? Number(svc.price_moto) : null,
          price_suv: svc.price_suv != null ? Number(svc.price_suv) : null,
          duration_minutes: Math.max(30, Number(svc.duration_minutes) || 30),
          is_active: !!svc.is_active,
        }
        return exists ? cleaned.map(s => s.id === svc.id ? mapped : s) : [...cleaned, mapped]
      })
    } catch {
      revert()
      errorHaptic()
      alert('Δεν ενεργοποιήθηκε η υπηρεσία: πρόβλημα σύνδεσης. Δοκίμασε ξανά.')
    }
  }

  const saveCapacity = async () => {
    if (!location?.id) return
    setSavingCapacity(true)
    const supabase = createClient()
    const { error } = await supabase.from('locations')
      .update({ capacity })
      .eq('id', location.id)
    setSavingCapacity(false)
    if (!error) {
      setCapacitySaved(true)
      setTimeout(() => setCapacitySaved(false), 2000)
    } else {
      errorHaptic()
    }
  }

  // «Δεν εμφανίστηκε» — μόνο αφού περάσουν 15' από την ώρα του ραντεβού.
  const markNoShow = async (b: Booking) => {
    if (!confirm('Ο πελάτης δεν εμφανίστηκε; Η κράτηση θα σημανθεί ως no-show.')) return
    const supabase = createClient()
    const { error } = await supabase.from('bookings')
      .update({ status: 'no_show' })
      .eq('id', b.id)
    if (!error) {
      setBookings(prev => prev.map(x => x.id === b.id ? { ...x, status: 'no_show' } : x))
      setCalendarBookings(prev => prev.map(x => x.id === b.id ? { ...x, status: 'no_show' } : x))
      selectionHaptic()
    } else {
      errorHaptic()
    }
  }

  const canMarkNoShow = (b: Booking): boolean => {
    if (b.status !== 'confirmed' && b.status !== 'pending') return false
    if (!b.slot_date || !b.slot_start_time) return false
    const start = new Date(`${b.slot_date}T${b.slot_start_time.slice(0, 8) || '00:00:00'}`)
    return Date.now() > start.getTime() + 15 * 60 * 1000
  }

  const openManualForm = () => {
    setManualServiceName(bookableServices.find(s => s.is_active)?.name || '')
    setManualError('')
    setShowManualForm(true)
    lightTap()
  }

  const createManualBooking = async () => {
    if (!location?.id || !manualServiceName || !manualTime || !manualFirstName.trim()) {
      setManualError('Συμπλήρωσε υπηρεσία, ώρα και όνομα.')
      return
    }
    setManualSaving(true)
    setManualError('')
    try {
      const dateStr = ymdFromLocalDate(calendarDate)
      const res = await fetch('/api/bookings/create-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: location.id,
          serviceName: manualServiceName,
          slotDate: dateStr,
          slotStartTime: manualTime,
          customerName: `${manualFirstName.trim()} ${manualLastName.trim()}`.trim(),
          customerPhone: manualPhone.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setManualError(json.error || 'Κάτι πήγε στραβά.')
        setManualSaving(false)
        return
      }
      selectionHaptic()
      setShowManualForm(false)
      setManualFirstName(''); setManualLastName(''); setManualPhone('')
      await loadCalendarBookings(calendarDate)
    } catch {
      setManualError('Κάτι πήγε στραβά. Δοκίμασε ξανά.')
    } finally {
      setManualSaving(false)
    }
  }

  const deleteException = async (date: string) => {
    if (!location?.id) return
    const supabase = createClient()
    await supabase.from('location_hours_exceptions')
      .delete().eq('location_id', location.id).eq('exception_date', date)
    setExceptions(prev => prev.filter(e => e.exception_date !== date))
  }

  const addStaff = async () => {
    if (!location?.id || !newStaffName.trim() || !newStaffPhone.trim()) return
    const supabase = createClient()
    const { data } = await supabase.from('staff')
      .insert({ location_id: location.id, full_name: newStaffName.trim(), role: newStaffRole, phone: newStaffPhone.trim() })
      .select('id, full_name, role, phone').single()
    if (data) setStaff(prev => [data as StaffMember, ...prev])
    setNewStaffName(''); setNewStaffRole('Τεχνικός'); setNewStaffPhone('')
  }

  const deleteStaff = async (id: string) => {
    const supabase = createClient()
    await supabase.from('staff').delete().eq('id', id)
    setStaff(prev => prev.filter(s => s.id !== id))
  }

  const cancelBooking = async (id: string) => {
    // Πάντα μέσω API: κάνει το Stripe refund (αν ήταν κάρτα), ενημερώνει
    // τον πελάτη με email και ανοίγει το slot. Ποτέ απευθείας update.
    try {
      const res = await fetch('/api/bookings/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: id, reason: 'owner_cancelled' }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { alert(json.error || 'Η ακύρωση δεν ολοκληρώθηκε.'); return }
      setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'cancelled' } : b))
    } catch {
      alert('Πρόβλημα σύνδεσης. Η κράτηση ΔΕΝ ακυρώθηκε.')
    }
  }

  if (loading) return <main className="min-h-screen bg-white flex items-center justify-center"><WashioLoader /></main>
  if (!location?.id) return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-sm text-gray-500">Δεν έχεις συνδεδεμένο πλυντήριο.</p>
      <button
        onClick={() => {
          try { localStorage.setItem('washio_mode', 'customer') } catch { /* ignore */ }
          router.push('/')
        }}
        className="h-11 px-5 rounded-xl bg-gray-900 text-white text-[13px] font-semibold"
      >
        Επιστροφή στην εφαρμογή
      </button>
    </main>
  )

  return (
    <main className="min-h-screen bg-gray-50">
      <PushInit />
      <div className="max-w-3xl mx-auto">

        <div className="px-5 pt-[calc(var(--safe-top)+14px)] pb-4 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-[22px] font-bold tracking-tight leading-[1.2] text-gray-900">{location.name}</h1>
              <p className="text-[12px] text-gray-500 mt-1">{location.address}, {location.city}</p>
            </div>
            <button
              onClick={() => {
                try { localStorage.setItem('washio_mode', 'customer') } catch { /* ignore */ }
                router.push('/')
              }}
              title="Επιστροφή στην εφαρμογή πελάτη"
              className="h-[38px] pl-2.5 pr-3 rounded-full bg-gray-900 text-white flex items-center gap-1.5 shrink-0 active:opacity-80"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3 4 7l4 4" />
                <path d="M4 7h16" />
                <path d="m16 21 4-4-4-4" />
                <path d="M20 17H4" />
              </svg>
              <span className="text-[12px] font-semibold">Εφαρμογή</span>
            </button>
          </div>

          {notifPermission === 'granted' ? (
            <div className="inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded-lg" style={{ background: '#E7F6EF', color: '#0F7A5C' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#10B981' }} />
              <span className="text-[11px] font-semibold tracking-tight">Ειδοποιήσεις ενεργές</span>
            </div>
          ) : (
            <button
              onClick={requestNotifications}
              disabled={notifBusy}
              className="mt-3 w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 disabled:opacity-60"
              style={{ background: '#FEF6E6', border: '1px solid #FBE7B8' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A6209" strokeWidth="1.75" strokeLinecap="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/>
                <path d="M10 19a2 2 0 0 0 4 0"/>
              </svg>
              <span className="flex-1 text-left text-[12px] font-medium" style={{ color: '#8A6209' }}>Ενεργοποίησε ειδοποιήσεις</span>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md" style={{ background: '#8A6209', color: '#fff' }}>{notifBusy ? '...' : 'Ενεργοποίηση'}</span>
            </button>
          )}
        </div>

        {/* Support mode banner — ο admin βλέπει ξένο dashboard */}
        {supportMode && (
          <div className="px-5 py-2.5 flex items-center gap-2" style={{ background: '#7C3AED' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
              <path d="M14.7 6.3a5 5 0 0 0-7 7l-4 4 3 3 4-4a5 5 0 0 0 7-7l-3 3-3-3 3-3z"/>
            </svg>
            <p className="flex-1 text-[12px] font-semibold text-white truncate">
              Λειτουργία υποστήριξης — {location?.name || 'πλυντήριο'}
            </p>
            <button
              onClick={() => { window.location.href = '/admin' }}
              className="text-[11px] font-semibold text-white/90 underline underline-offset-2 shrink-0"
            >
              Έξοδος
            </button>
          </div>
        )}

        <div className="sticky top-0 z-20 bg-white border-b border-gray-100">
          <div className="flex overflow-x-auto scrollbar-hide px-5 gap-[22px]">
          {([
            ['overview', 'Overview'],
            ['bookings', `Κρατήσεις${newBookingsCount > 0 ? ` (${newBookingsCount})` : ''}`],
            ['calendar', 'Ημερολόγιο'],
            ['services', 'Υπηρεσίες'],
            ['hours', 'Ωράριο'],
            ['settings', 'Ρυθμίσεις'],
            ['feedback', 'Feedback'],
          ] as [TabKey, string][]).map(([key, label]) => (
            <button key={key}
              onClick={() => { setActiveTab(key); if (key === 'bookings') setNewBookingsCount(0); lightTap() }}
              className={`shrink-0 py-3 text-[13px] tracking-tight transition-all border-b-2 ${
                activeTab === key ? 'border-gray-900 text-gray-900 font-semibold' : 'border-transparent text-gray-400 font-medium'
              } ${key === 'bookings' && newBookingsCount > 0 ? 'text-blue-600' : ''}`}
            >
              {label}
            </button>
          ))}
          </div>
        </div>

        <div className="px-5 py-5">

          {activeTab === 'overview' && (
            <div className="space-y-3">
              {/* Stat cards */}
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: 'Σήμερα', value: todayBookings.length },
                  { label: 'Μήνα', value: monthlyBookings.length },
                  { label: 'Έσοδα μήνα', value: `€${monthlyRevenue.toFixed(0)}` },
                  { label: 'Βαθμολογία', value: avgRating.toFixed(1) },
                ].map(s => (
                  <div key={s.label} className="bg-white border border-gray-100 rounded-2xl p-3.5"
                       style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                    <p className="text-[11px] font-semibold tracking-[1.4px] uppercase text-gray-500">{s.label}</p>
                    <p className="text-[26px] font-bold tracking-tight text-gray-900 mt-2">{s.value}</p>
                  </div>
                ))}
              </div>

              {todayBookings.length > 0 && (
                <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden"
                     style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                  <div className="px-4 py-3.5 flex items-baseline justify-between">
                    <p className="text-[15px] font-semibold tracking-tight text-gray-900">Σήμερα</p>
                    <span className="text-[11px] font-semibold tracking-[1.4px] uppercase text-gray-500">{todayBookings.length} κρατήσεις</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {todayBookings.sort((a, b) => (a.slot_start_time || '').localeCompare(b.slot_start_time || '')).map(b => (
                      <div key={b.id} className="px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-900">{b.slot_start_time?.slice(0, 5)} · {'—'}</p>
                          <p className="text-xs text-gray-400">{b.profiles?.full_name || 'Πελάτης'}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-md ${statusClass(b.status)}`}>{statusLabel(b.status)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden"
                   style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                <div className="px-4 py-3.5 flex items-baseline justify-between">
                  <p className="text-[15px] font-semibold tracking-tight text-gray-900">Πρόσφατες κρατήσεις</p>
                  <span className="text-[12px] font-medium text-blue-600">Όλες →</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {bookings.slice(0, 5).map(b => (
                    <div key={b.id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-900">{b.slot_date} · {'—'}</p>
                        <p className="text-xs text-gray-400">{b.profiles?.full_name || 'Πελάτης'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-900">€{Number(b.total_amount || 0).toFixed(0)}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-md ${statusClass(b.status)}`}>{statusLabel(b.status)}</span>
                      </div>
                    </div>
                  ))}
                  {bookings.length === 0 && <p className="text-xs text-gray-400 px-4 py-6">Δεν υπάρχουν κρατήσεις ακόμα.</p>}
                </div>
              </div>

              {/* Chart card */}
              <div className="bg-white border border-gray-100 rounded-2xl p-4"
                   style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                <div className="flex items-center justify-between mb-3 gap-2">
                  <div className="flex gap-1 bg-gray-50 p-1 rounded-lg">
                    {METRICS.map(m => (
                      <button key={m.key} onClick={() => setChartMetric(m.key)}
                        className={`text-[12px] px-2.5 py-1 rounded-md font-semibold tracking-tight transition-all ${
                          chartMetric === m.key ? 'bg-gray-900 text-white' : 'text-gray-500'
                        }`}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-0.5">
                    {PERIODS.map(p => (
                      <button key={p.key} onClick={() => setChartPeriod(p.key)}
                        className={`text-[11px] px-2 py-1 rounded-md font-semibold transition-all ${
                          chartPeriod === p.key ? 'bg-gray-50 text-gray-900' : 'text-gray-400'
                        }`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Big number + delta */}
                <div className="flex items-baseline gap-2 mb-1">
                  <p className="text-[28px] font-bold tracking-tight text-gray-900">
                    {chartMetric === 'revenue' ? `€${monthlyRevenue.toFixed(0)}` : monthlyBookings.length}
                  </p>
                </div>
                <p className="text-[11px] text-gray-400 mb-3">
                  {chartMetric === 'revenue' ? 'Έσοδα' : 'Κρατήσεις'} · {chartPeriod === '7D' ? 'τελευταίες 7 ημέρες' : chartPeriod === '30D' ? 'τελευταίες 30 ημέρες' : `τελευταίοι ${chartPeriod === '3M' ? '3' : chartPeriod === '6M' ? '6' : '12'} μήνες`}
                </p>

                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }}
                        interval={chartPeriod === '30D' ? 4 : chartPeriod === '7D' ? 0 : 0} />
                      <YAxis tick={{ fontSize: 10 }}
                        tickFormatter={chartMetric === 'revenue' ? (v) => `€${v}` : undefined} />
                      <Tooltip
                        formatter={(value: any) => chartMetric === 'revenue' ? [`€${value}`, 'Έσοδα'] : [value, 'Κρατήσεις']} />
                      <Line
                        type="monotone"
                        dataKey={chartMetric}
                        stroke="#111827"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'bookings' && (() => {
            const filtered = [...bookings]
              .filter(b => filterStatus === 'all' || b.status === filterStatus)
              .sort((a, b) => {
                if (sortBy === 'created_at') {
                  return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
                }
                return new Date(b.slot_date || '').getTime() - new Date(a.slot_date || '').getTime()
              })

            const statusCounts = {
              all: bookings.length,
              confirmed: bookings.filter(b => b.status === 'confirmed').length,
              completed: bookings.filter(b => b.status === 'completed').length,
              cancelled: bookings.filter(b => b.status === 'cancelled').length,
              pending: bookings.filter(b => b.status === 'pending').length,
              no_show: bookings.filter(b => b.status === 'no_show').length,
            }

            const statusPillConfig = (status?: string) => {
              if (status === 'pending') return { bg: '#FEF3C7', fg: '#92400E', label: 'Εκκρεμεί' }
              if (status === 'confirmed') return null // «Επιβεβαιωμένη» = κανονική κατάσταση, χωρίς σήμανση.
              if (status === 'completed') return { bg: '#E7F6EF', fg: '#0F7A5C', label: 'Ολοκλ.' }
              if (status === 'cancelled') return { bg: '#FCEAEA', fg: '#B43C3C', label: 'Ακυρ.' }
              if (status === 'no_show') return { bg: '#F3E8FF', fg: '#7E22CE', label: 'Δεν ήρθε' }
              return { bg: '#F7F7F7', fg: '#666666', label: status || '—' }
            }

            // Τρόπος πληρωμής — ΡΗΤΑ, για να ξέρει ο πλυντηριάς αν εισπράττει.
            const paymentBadge = (b: Booking) => {
              if (b.source === 'manual') return { bg: '#F3F4F6', fg: '#4B5563', label: 'Εκτός πλατφόρμας' }
              if (b.stripe_payment_status === 'pay_at_venue') return { bg: '#FFEDD5', fg: '#C2410C', label: '💵 ΜΕΤΡΗΤΑ — εισπράττεις εσύ' }
              if (b.stripe_payment_status === 'paid') return { bg: '#E7F6EF', fg: '#0F7A5C', label: '💳 Πληρωμένη με κάρτα' }
              return null
            }

            return (
              <div className="space-y-3">
                {/* Status filter chips */}
                <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-5 px-5 pb-1">
                  {[
                    { value: 'all', label: 'Όλες' },
                    { value: 'completed', label: 'Ολοκληρωμένες' },
                    { value: 'no_show', label: 'Δεν ήρθαν' },
                    { value: 'cancelled', label: 'Ακυρωμένες' },
                    { value: 'pending', label: 'Εκκρεμείς' },
                  ].map(opt => {
                    const active = filterStatus === opt.value
                    const count = (statusCounts as any)[opt.value]
                    return (
                      <button
                        key={opt.value}
                        onClick={() => { setFilterStatus(opt.value); lightTap() }}
                        className={`shrink-0 px-3.5 py-2 rounded-full border whitespace-nowrap text-[13px] font-semibold tracking-tight inline-flex items-center gap-1.5 transition-colors ${
                          active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200'
                        }`}
                      >
                        {opt.label}
                        <span className={`px-1.5 rounded-full text-[11px] font-semibold ${
                          active ? 'bg-white/20 text-white' : 'bg-gray-50 text-gray-500'
                        }`}>{count}</span>
                      </button>
                    )
                  })}
                </div>

                {/* Sort row */}
                <div className="flex items-center justify-end gap-2 pb-1">
                  <span className="text-[11px] font-semibold tracking-[1.4px] uppercase text-gray-500">Ταξινόμηση</span>
                  <div className="flex gap-1 bg-white border border-gray-200 p-0.5 rounded-lg">
                    <button
                      onClick={() => { setSortBy('slot_date'); lightTap() }}
                      className={`text-[12px] px-2.5 py-1 rounded-md font-semibold tracking-tight transition-all ${
                        sortBy === 'slot_date' ? 'bg-gray-900 text-white' : 'text-gray-500'
                      }`}
                    >
                      Πλύσιμο
                    </button>
                    <button
                      onClick={() => { setSortBy('created_at'); lightTap() }}
                      className={`text-[12px] px-2.5 py-1 rounded-md font-semibold tracking-tight transition-all ${
                        sortBy === 'created_at' ? 'bg-gray-900 text-white' : 'text-gray-500'
                      }`}
                    >
                      Κλείσιμο
                    </button>
                  </div>
                </div>

                {/* Booking cards */}
                <div className="space-y-2">
                  {filtered.map(b => {
                    const pill = statusPillConfig(b.status)
                    const canCancel = b.status === 'pending' || b.status === 'confirmed'
                    const slotDate = b.slot_date ? new Date(b.slot_date).toLocaleDateString('el-GR', {
                      day: 'numeric', month: 'short', timeZone: 'Europe/Athens'
                    }) : '—'
                    const bookedAt = b.created_at ? new Date(b.created_at).toLocaleDateString('el-GR', {
                      day: 'numeric', month: 'short', timeZone: 'Europe/Athens'
                    }) : '—'

                    const payBadge = paymentBadge(b)

                    return (
                      <div
                        key={b.id}
                        className="bg-white border border-gray-100 rounded-xl p-3 flex items-start gap-3"
                        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold tracking-tight text-gray-900">
                            {b.customer_name || b.profiles?.full_name || 'Πελάτης'}
                          </p>
                          {payBadge && (
                            <span
                              className="inline-flex items-center mt-1 px-2 py-0.5 rounded-md text-[11px] font-bold tracking-tight"
                              style={{ background: payBadge.bg, color: payBadge.fg }}
                            >
                              {payBadge.label}
                            </span>
                          )}
                          {(b.profiles?.phone || b.profiles?.email) && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.6" strokeLinecap="round">
                                <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1"/>
                              </svg>
                              <p className="text-[11px] text-gray-500">{b.profiles?.phone || b.profiles?.email}</p>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 mt-2">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.7" strokeLinecap="round">
                              <path d="M5 13V8a4 4 0 0 1 4-4h2M11 4a3 3 0 0 1 3 3v6"/>
                              <path d="M3 13h18"/>
                              <path d="M8 16v1M12 16v3M16 16v1"/>
                            </svg>
                            <p className="text-[12px] font-medium text-gray-900">
                              {slotDate} · {b.slot_start_time?.slice(0, 5) || '—'}
                            </p>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1">Κλείστηκε: {bookedAt}</p>
                        </div>

                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <p className="text-[16px] font-bold tracking-tight text-gray-900">
                            €{Number(b.total_amount || 0).toFixed(0)}
                          </p>
                          {pill && (
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold tracking-tight"
                              style={{ background: pill.bg, color: pill.fg }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: pill.fg }} />
                              {pill.label}
                            </span>
                          )}
                          {canMarkNoShow(b) && (
                            <button
                              onClick={() => { lightTap(); markNoShow(b) }}
                              className="px-2.5 py-1.5 rounded-lg bg-purple-50 text-purple-700 text-[11px] font-semibold border border-purple-100"
                            >
                              Δεν εμφανίστηκε
                            </button>
                          )}
                          {canCancel && (
                            <button
                              onClick={() => { errorHaptic(); cancelBooking(b.id) }}
                              className="text-[11px] font-medium text-red-500 underline underline-offset-[2px]"
                            >
                              Ακύρωση
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {filtered.length === 0 && (
                  <div className="flex flex-col items-center text-center pt-16">
                    <div
                      className="w-16 h-16 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-gray-400 mb-4"
                      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
                    >
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M3 13l3-8h12l3 8M3 13v6a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6M3 13h5l1 3h6l1-3h5"/>
                      </svg>
                    </div>
                    <p className="text-[15px] font-semibold tracking-tight text-gray-900">
                      {filterStatus === 'all' ? 'Δεν υπάρχουν κρατήσεις' : 'Δεν υπάρχουν κρατήσεις σε αυτή τη κατηγορία'}
                    </p>
                  </div>
                )}
              </div>
            )
          })()}


          {activeTab === 'calendar' && (() => {
            const year = calendarDate.getFullYear()
            const month = calendarDate.getMonth()
            const firstDay = new Date(year, month, 1)
            const lastDay = new Date(year, month + 1, 0)
            const startPad = (firstDay.getDay() + 6) % 7
            const todayStr = new Date().toDateString()
            const selectedStr = calendarDate.toDateString()

            // Count bookings per date for the month
            const dateBookingCount: Record<string, number> = {}
            bookings.forEach(b => {
              if (!b.slot_date || b.status === 'cancelled') return
              const d = new Date(b.slot_date)
              if (d.getFullYear() === year && d.getMonth() === month) {
                const dateNum = d.getDate()
                dateBookingCount[dateNum] = (dateBookingCount[dateNum] || 0) + 1
              }
            })

            const statusPillConfig = (status?: string) => {
              if (status === 'pending') return { bg: '#FEF3C7', fg: '#92400E', label: 'Εκκρεμεί' }
              if (status === 'confirmed') return { bg: '#EAF2FD', fg: '#1A6FD4', label: 'Επιβεβ.' }
              if (status === 'completed') return { bg: '#E7F6EF', fg: '#0F7A5C', label: 'Ολοκλ.' }
              if (status === 'cancelled') return { bg: '#FCEAEA', fg: '#B43C3C', label: 'Ακυρ.' }
              if (status === 'no_show') return { bg: '#F3E8FF', fg: '#7E22CE', label: 'Δεν ήρθε' }
              return { bg: '#F7F7F7', fg: '#666666', label: status || '—' }
            }

            return (
              <div className="space-y-5">
                {/* Month navigation */}
                <div className="flex items-center justify-between mb-1">
                  <button
                    onClick={() => {
                      const d = new Date(calendarDate)
                      d.setMonth(d.getMonth() - 1)
                      setCalendarDate(d)
                    }}
                    className="w-9 h-9 rounded-[10px] bg-gray-50 flex items-center justify-center text-gray-900"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M15 6l-6 6 6 6"/></svg>
                  </button>
                  <p className="text-[17px] font-semibold tracking-tight text-gray-900 capitalize">
                    {calendarDate.toLocaleDateString('el-GR', { month: 'long', year: 'numeric', timeZone: 'Europe/Athens' })}
                  </p>
                  <button
                    onClick={() => {
                      const d = new Date(calendarDate)
                      d.setMonth(d.getMonth() + 1)
                      setCalendarDate(d)
                    }}
                    className="w-9 h-9 rounded-[10px] bg-gray-50 flex items-center justify-center text-gray-900"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M9 6l6 6-6 6"/></svg>
                  </button>
                </div>

                {/* Weekday labels */}
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ'].map(w => (
                    <p key={w} className="text-[10px] font-semibold tracking-[1.4px] uppercase text-gray-400 text-center">
                      {w}
                    </p>
                  ))}
                </div>

                {/* Day grid */}
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: startPad }).map((_, i) => (
                    <div key={`pad-${i}`} className="aspect-square" />
                  ))}
                  {Array.from({ length: lastDay.getDate() }).map((_, idx) => {
                    const d = idx + 1
                    const thisDate = new Date(year, month, d)
                    const isToday = thisDate.toDateString() === todayStr
                    const isSelected = thisDate.toDateString() === selectedStr
                    const count = dateBookingCount[d] || 0

                    return (
                      <button
                        key={d}
                        onClick={() => setCalendarDate(thisDate)}
                        className="aspect-square flex flex-col items-center justify-center gap-1 rounded-[10px] transition-all"
                        style={{
                          background: isSelected ? '#0A0A0A' : 'transparent',
                          border: isToday && !isSelected ? '1.5px solid #0A0A0A' : '1.5px solid transparent',
                          color: isSelected ? '#fff' : '#0A0A0A',
                        }}
                      >
                        <span
                          className="text-[14px]"
                          style={{
                            fontWeight: isSelected ? 600 : 500,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {d}
                        </span>
                        {count > 0 ? (
                          <div className="flex gap-0.5">
                            {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                              <span
                                key={i}
                                className="w-[3px] h-[3px] rounded-full"
                                style={{
                                  background: isSelected ? '#fff' : (count > 4 ? '#0A0A0A' : '#999'),
                                }}
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="h-[3px]" />
                        )}
                      </button>
                    )
                  })}
                </div>

                {/* Separator */}
                <div className="h-px bg-gray-100" />

                {/* Day timeline — 08:00–22:00, τύπου Google Calendar */}
                {(() => {
                  const DAY_START = 8 * 60
                  const DAY_END = 22 * 60
                  const PX_PER_MIN = 44 / 30 // 30' = 44px
                  const timelineHeight = (DAY_END - DAY_START) * PX_PER_MIN

                  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

                  // Lane assignment για επικαλυπτόμενες κρατήσεις (δίπλα-δίπλα).
                  const timed = calendarBookings
                    .filter(b => b.slot_start_time)
                    .map(b => {
                      const s = toMin(b.slot_start_time!)
                      return { b, s, e: s + Math.max(30, b.duration_minutes || 30) }
                    })
                    .sort((a, x) => a.s - x.s || a.e - x.e)

                  const laneEnds: number[] = []
                  const placed = timed.map(item => {
                    let lane = laneEnds.findIndex(end => end <= item.s)
                    if (lane === -1) { lane = laneEnds.length; laneEnds.push(item.e) }
                    else laneEnds[lane] = item.e
                    return { ...item, lane }
                  })
                  const laneCount = Math.max(1, laneEnds.length)

                  const blockStyle = (bk: Booking) => {
                    if (bk.status === 'no_show') return { bg: '#F3E8FF', border: '#C084FC', fg: '#7E22CE' }
                    if (bk.status === 'completed') return { bg: '#E7F6EF', border: '#34C79A', fg: '#0F7A5C' }
                    if (bk.source === 'manual') return { bg: '#F3F4F6', border: '#9CA3AF', fg: '#374151' }
                    if (bk.stripe_payment_status === 'pay_at_venue') return { bg: '#FFEDD5', border: '#FB923C', fg: '#C2410C' }
                    return { bg: '#EAF2FD', border: '#5C9CE6', fg: '#1A6FD4' }
                  }

                  return (
                    <div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[16px] font-semibold tracking-tight text-gray-900 capitalize">
                            {calendarDate.toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Athens' })}
                          </p>
                          <p className="text-[11px] font-semibold tracking-[1.4px] uppercase text-gray-500 mt-1">
                            {calendarLoading ? 'Φόρτωση...' : `${calendarBookings.length} ${calendarBookings.length === 1 ? 'κράτηση' : 'κρατήσεις'}`}
                          </p>
                        </div>
                        <button
                          onClick={openManualForm}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-gray-900 text-white text-[13px] font-semibold"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                          Ραντεβού
                        </button>
                      </div>

                      {/* Υπόμνημα */}
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3">
                        {[
                          { c: '#5C9CE6', l: 'Κάρτα' },
                          { c: '#FB923C', l: 'Μετρητά' },
                          { c: '#9CA3AF', l: 'Εκτός πλατφόρμας' },
                          { c: '#34C79A', l: 'Ολοκληρωμένη' },
                          { c: '#C084FC', l: 'Δεν ήρθε' },
                        ].map(x => (
                          <span key={x.l} className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500">
                            <span className="w-2 h-2 rounded-full" style={{ background: x.c }} />
                            {x.l}
                          </span>
                        ))}
                      </div>

                      {/* Timeline */}
                      <div className="relative mt-3 select-none" style={{ height: timelineHeight }}>
                        {/* Γραμμές ωρών */}
                        {Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }).map((_, i) => {
                          const minutes = DAY_START + i * 60
                          const top = (minutes - DAY_START) * PX_PER_MIN
                          return (
                            <div key={i} className="absolute left-0 right-0 flex items-start" style={{ top }}>
                              <span
                                className="w-[42px] shrink-0 text-[10px] font-semibold text-gray-400 -mt-1.5"
                                style={{ fontVariantNumeric: 'tabular-nums' }}
                              >
                                {String(Math.floor(minutes / 60)).padStart(2, '0')}:00
                              </span>
                              <div className="flex-1 h-px bg-gray-100" />
                            </div>
                          )
                        })}
                        {/* Μισάωρα (αχνές γραμμές) */}
                        {Array.from({ length: (DAY_END - DAY_START) / 60 }).map((_, i) => {
                          const minutes = DAY_START + i * 60 + 30
                          const top = (minutes - DAY_START) * PX_PER_MIN
                          return (
                            <div key={`h-${i}`} className="absolute right-0 h-px bg-gray-50" style={{ top, left: 42 }} />
                          )
                        })}

                        {/* Κρατήσεις */}
                        {placed.map(({ b, s, e, lane }) => {
                          const st = blockStyle(b)
                          const top = Math.max(0, (s - DAY_START) * PX_PER_MIN)
                          const height = Math.max(30, (e - s) * PX_PER_MIN - 3)
                          const areaLeft = 48
                          const widthPct = 100 / laneCount
                          return (
                            <div
                              key={b.id}
                              className="absolute rounded-lg px-2 py-1 overflow-hidden"
                              style={{
                                top,
                                height,
                                left: `calc(${areaLeft}px + (100% - ${areaLeft}px) * ${lane * widthPct / 100})`,
                                width: `calc((100% - ${areaLeft}px) * ${widthPct / 100} - 3px)`,
                                background: st.bg,
                                borderLeft: `3px solid ${st.border}`,
                                opacity: b.status === 'no_show' || b.status === 'cancelled' ? 0.65 : 1,
                              }}
                            >
                              <p className="text-[10px] font-bold leading-tight" style={{ color: st.fg, fontVariantNumeric: 'tabular-nums' }}>
                                {b.slot_start_time?.slice(0, 5)}–{`${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}`}
                              </p>
                              <p className="text-[11px] font-semibold leading-tight truncate mt-0.5" style={{ color: st.fg }}>
                                {b.customer_name || b.profiles?.full_name || 'Πελάτης'}
                              </p>
                              {height > 56 && (
                                <p className="text-[10px] leading-tight truncate mt-0.5" style={{ color: st.fg, opacity: 0.8 }}>
                                  {b.services?.name || ''}
                                </p>
                              )}
                            </div>
                          )
                        })}

                        {!calendarLoading && placed.length === 0 && (
                          <p className="absolute left-[60px] top-6 text-[13px] text-gray-400">
                            Δεν υπάρχουν κρατήσεις αυτή τη μέρα.
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })()}

          {/* Αιωρούμενο κουμπί «+ Ραντεβού» — μόνο στο ημερολόγιο, ακολουθεί
              πάντα την οθόνη ώστε ο πλυντηριάς να προσθέτει ραντεβού από
              οποιοδήποτε σημείο του timeline. */}
          {activeTab === 'calendar' && !showManualForm && (
            <button
              onClick={openManualForm}
              aria-label="Προσθήκη ραντεβού"
              className="fixed z-40 right-5 flex items-center gap-2 px-5 h-14 rounded-full bg-gray-900 text-white text-[15px] font-semibold active:scale-95 transition-transform"
              style={{
                bottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
              Ραντεβού
            </button>
          )}

          {/* Modal χειροκίνητης κράτησης (τηλεφωνική / εκτός πλατφόρμας) */}
          {showManualForm && (
            <div className="fixed inset-0 z-50 flex items-end justify-center">
              <div className="absolute inset-0 bg-black/30" onClick={() => setShowManualForm(false)} />
              {/* max-h + scroll: με ανοιχτό πληκτρολόγιο σκρολάρεις ΠΑΝΤΑ σε όλα τα πεδία/κουμπιά. */}
              <div className="relative bg-white rounded-t-3xl px-5 pt-5 pb-10 w-full max-w-md z-10 max-h-[82vh] overflow-y-auto overscroll-contain">
                <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
                {/* Κουμπί κλεισίματος — ΠΑΝΤΑ ορατό, ακόμα κι αν το backdrop κρύβεται από το πληκτρολόγιο. */}
                <button
                  onClick={() => setShowManualForm(false)}
                  aria-label="Κλείσιμο"
                  className="absolute top-3.5 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
                <p className="text-base font-semibold text-gray-900 mb-1">Προσθήκη ραντεβού</p>
                {/* Η ημερομηνία ΕΜΦΑΝΗΣ — να την επιβεβαιώνει ο πλυντηριάς πριν αποθηκεύσει. */}
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg mb-2"
                  style={{ background: '#EAF2FD', color: '#1A6FD4' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                  </svg>
                  <span className="text-[13px] font-bold tracking-tight capitalize">
                    {calendarDate.toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Athens' })}
                  </span>
                </div>
                <p className="text-[12px] text-gray-400 mb-4">
                  Για κρατήσεις που έρχονται από τηλέφωνο ή από τον πάγκο. Δεσμεύει την ώρα ώστε να μη διπλοκλειστεί.
                  Το ραντεβού θα μπει στην παραπάνω ημερομηνία — αν θες άλλη μέρα, κλείσε και διάλεξέ τη πρώτα στο ημερολόγιο.
                </p>

                <div className="mb-3">
                  <p className="text-xs text-gray-400 mb-1.5">Υπηρεσία</p>
                  <select
                    value={manualServiceName}
                    onChange={e => setManualServiceName(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm bg-white focus:outline-none"
                  >
                    {/* ΜΟΝΟ οι υπηρεσίες που έχει ενεργοποιήσει το σημείο στο Washio —
                        ό,τι προσφέρει στην πλατφόρμα μπορεί να το βάλει και ως δικό του ραντεβού. */}
                    {bookableServices.filter(s => s.is_active).map(s => (
                      <option key={s.id} value={s.name}>
                        {s.name} · {s.duration_minutes}′
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-3">
                  <p className="text-xs text-gray-400 mb-1.5">Ώρα έναρξης</p>
                  <select
                    value={manualTime}
                    onChange={e => setManualTime(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm bg-white focus:outline-none"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {Array.from({ length: 28 }).map((_, i) => {
                      const m = 8 * 60 + i * 30
                      const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
                      return <option key={t} value={t}>{t}</option>
                    })}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <p className="text-xs text-gray-400 mb-1.5">Όνομα</p>
                    <input
                      type="text" value={manualFirstName}
                      onChange={e => setManualFirstName(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none"
                    />
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1.5">Επίθετο</p>
                    <input
                      type="text" value={manualLastName}
                      onChange={e => setManualLastName(e.target.value)}
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-xs text-gray-400 mb-1.5">Κινητό</p>
                  <input
                    type="tel" value={manualPhone}
                    onChange={e => setManualPhone(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-3 text-sm focus:outline-none"
                  />
                </div>

                {manualError && <p className="text-[12px] text-red-500 mb-3">{manualError}</p>}

                <button
                  onClick={() => {
                    // Κλείσε το πληκτρολόγιο πριν την αποθήκευση — αποφεύγει κολλήματα του iOS WebView.
                    ;(document.activeElement as HTMLElement | null)?.blur?.()
                    createManualBooking()
                  }}
                  disabled={manualSaving}
                  className="w-full bg-gray-900 text-white text-sm font-medium py-3.5 rounded-xl disabled:opacity-40"
                >
                  {manualSaving
                    ? 'Αποθήκευση...'
                    : `Αποθήκευση για ${calendarDate.toLocaleDateString('el-GR', { day: 'numeric', month: 'short', timeZone: 'Europe/Athens' })} · ${manualTime}`}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'services' && (
            <div className="space-y-4">
              {/* ───────── ΒΑΣΙΚΕΣ ΥΠΗΡΕΣΙΕΣ ───────── */}
              <p className="text-[11px] font-semibold tracking-[1.6px] uppercase text-gray-500">
                Βασικές υπηρεσίες
              </p>
              <p className="text-[13px] text-gray-500 -mt-2 leading-relaxed">
                Ενεργοποίησε όσες υπηρεσίες προσφέρεις και όρισε τιμή για ΙΧ, SUV και Μοτοσικλέτα.
                Μια υπηρεσία εμφανίζεται στους πελάτες μόνο όταν είναι ενεργή ΚΑΙ έχει τιμή.
              </p>

              <div className="space-y-2.5">
                {(() => {
                  // ΚΕΝΤΡΙΚΟΣ κατάλογος + ό,τι έχει ήδη το σημείο (merge κατά όνομα).
                  const catalogView = catalog.map(c => {
                    const existing = bookableServices.find(s => s.name === c.name)
                    return {
                      key: c.name,
                      id: existing?.id ?? null,
                      name: c.name,
                      duration_minutes: existing?.duration_minutes ?? c.duration_minutes,
                      vehicles: c.vehicles,
                      price: existing?.price ?? 0,
                      price_moto: existing?.price_moto ?? null,
                      price_suv: existing?.price_suv ?? null,
                      is_active: existing?.is_active ?? false,
                    }
                  })
                  // Τυχόν custom υπηρεσίες του σημείου εκτός καταλόγου — εμφανίζονται κι αυτές.
                  const extras = bookableServices
                    .filter(s => !catalog.some(c => c.name === s.name))
                    .map(s => ({
                      key: s.name, id: s.id as string | null, name: s.name,
                      duration_minutes: s.duration_minutes,
                      vehicles: ['ΙΧ', 'SUV', 'Μοτοσικλέτα'] as CatalogService['vehicles'],
                      price: s.price, price_moto: s.price_moto ?? null, price_suv: s.price_suv ?? null,
                      is_active: s.is_active,
                    }))

                  return [...catalogView, ...extras].map(bs => {
                    const forMoto = bs.vehicles.includes('Μοτοσικλέτα')
                    const forCar = bs.vehicles.includes('ΙΧ')
                    const missingPrice = bs.is_active && !(Number(bs.price) > 0) && !(Number(bs.price_moto) > 0)
                    return (
                      <div
                        key={bs.key}
                        className="bg-white border border-gray-100 rounded-2xl p-4"
                        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-[15px] font-semibold tracking-tight text-gray-900">
                              {bs.name}
                              <span className="text-[12px] font-medium text-gray-400 ml-1.5">· {bs.duration_minutes}′</span>
                            </p>
                            <p className={`text-[12px] font-medium mt-0.5 ${bs.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                              {bs.is_active ? '● Ενεργή' : '○ Ανενεργή'}
                              {!forCar && <span className="text-gray-400"> · μόνο μοτοσικλέτα</span>}
                            </p>
                          </div>
                          <button
                            onClick={() => { lightTap(); toggleCoreService(bs.name, bs.id, !bs.is_active) }}
                            className="relative w-[44px] h-[26px] rounded-full transition-colors shrink-0"
                            style={{ background: bs.is_active ? '#34C759' : '#E5E5E5' }}
                          >
                            <div
                              className="absolute top-0.5 w-[22px] h-[22px] rounded-full bg-white transition-all"
                              style={{
                                left: bs.is_active ? 20 : 2,
                                boxShadow: '0 2px 4px rgba(0,0,0,0.15), 0 1px 0 rgba(0,0,0,0.04)',
                              }}
                            />
                          </button>
                        </div>

                        {bs.is_active && bs.id && (
                          <>
                            <div className={`mt-4 pt-4 border-t border-gray-100 grid gap-2 ${forCar && forMoto ? 'grid-cols-3' : forCar ? 'grid-cols-2' : 'grid-cols-1'}`}>
                              {([
                                ...(forCar ? [['ΙΧ', 'price', bs.price] as const, ['SUV', 'price_suv', bs.price_suv] as const] : []),
                                ...(forMoto ? [['Μοτο', 'price_moto', bs.price_moto] as const] : []),
                              ]).map(([label, field, value]) => (
                                <div key={field} className="bg-gray-50 rounded-xl p-2.5">
                                  <p className="text-[10px] font-semibold tracking-[1.2px] uppercase text-gray-500 mb-1">
                                    {label}
                                  </p>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[14px] font-semibold text-gray-500">€</span>
                                    <input
                                      type="number"
                                      defaultValue={value && Number(value) > 0 ? Number(value) : ''}
                                      placeholder="—"
                                      onBlur={e => {
                                        const val = parseFloat(e.target.value)
                                        if (isNaN(val) || val <= 0 || !bs.id) return
                                        updateBaseService(bs.id, { [field]: val } as Partial<BookableService>)
                                      }}
                                      className="w-full bg-transparent text-[17px] font-bold tracking-tight text-gray-900 focus:outline-none"
                                      style={{ fontVariantNumeric: 'tabular-nums' }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                            {missingPrice && (
                              <p className="text-[11px] font-medium text-orange-600 mt-2">
                                ⚠ Βάλε τιμή για να εμφανιστεί η υπηρεσία στους πελάτες.
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })
                })()}
              </div>

              <div className="h-px bg-gray-100" />

              {/* ───────── ΔΕΥΤΕΡΕΥΟΥΣΕΣ ΥΠΗΡΕΣΙΕΣ ───────── */}
              <p className="text-[11px] font-semibold tracking-[1.6px] uppercase text-gray-500">
                Δευτερεύουσες υπηρεσίες
              </p>
              <p className="text-[13px] text-gray-500 -mt-2 leading-relaxed">
                Πρόσθετα που μπορεί να επιλέξει ο πελάτης μαζί με τη βασική υπηρεσία.
              </p>

              <div className="space-y-2.5">
                {services.map(service => (
                  <div
                    key={service.id}
                    className="bg-white border border-gray-100 rounded-2xl p-4"
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-semibold tracking-tight text-gray-900">
                          {service.service_name}
                        </p>
                        <p className={`text-[12px] font-medium mt-0.5 ${service.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                          {service.is_active ? '● Ενεργή' : '○ Ανενεργή'}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleAddon(service)}
                        className="relative w-[44px] h-[26px] rounded-full transition-colors shrink-0"
                        style={{ background: service.is_active ? '#34C759' : '#E5E5E5' }}
                      >
                        <div
                          className="absolute top-0.5 w-[22px] h-[22px] rounded-full bg-white transition-all"
                          style={{
                            left: service.is_active ? 20 : 2,
                            boxShadow: '0 2px 4px rgba(0,0,0,0.15), 0 1px 0 rgba(0,0,0,0.04)',
                          }}
                        />
                      </button>
                    </div>

                    {service.is_active && (
                      <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-2.5">
                        {/* IX price */}
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-[10px] font-semibold tracking-[1.4px] uppercase text-gray-500 mb-1.5">
                            ΙΧ
                          </p>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[16px] font-semibold text-gray-500">€</span>
                            <input
                              type="number"
                              defaultValue={service.price_override ?? ''}
                              placeholder="0"
                              onBlur={async e => {
                                const val = parseFloat(e.target.value)
                                if (isNaN(val)) return
                                await updatePriceOverride(service, val)
                              }}
                              className="w-full bg-transparent text-[20px] font-bold tracking-tight text-gray-900 focus:outline-none"
                              style={{ fontVariantNumeric: 'tabular-nums' }}
                            />
                          </div>
                        </div>

                        {/* Motorcycle price */}
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-[10px] font-semibold tracking-[1.4px] uppercase text-gray-500 mb-1.5">
                            Μοτοσικλέτα
                          </p>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[16px] font-semibold text-gray-500">€</span>
                            <input
                              type="number"
                              defaultValue={service.price_moto ?? ''}
                              placeholder="0"
                              onBlur={async e => {
                                const val = parseFloat(e.target.value)
                                if (isNaN(val)) return
                                const supabase = createClient()
                                await supabase.from('services').update({ price_moto: val }).eq('id', service.id)
                                setServices(prev => prev.map(s => s.id === service.id ? { ...s, price_moto: val } : s))
                              }}
                              className="w-full bg-transparent text-[20px] font-bold tracking-tight text-gray-900 focus:outline-none"
                              style={{ fontVariantNumeric: 'tabular-nums' }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {services.length === 0 && (
                <div className="flex flex-col items-center text-center pt-12">
                  <div
                    className="w-16 h-16 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-gray-400 mb-4"
                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
                  >
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                      <path d="M5 13V8a4 4 0 0 1 4-4h2M11 4a3 3 0 0 1 3 3v6"/>
                      <path d="M3 13h18"/>
                      <path d="M8 16v1M12 16v3M16 16v1"/>
                    </svg>
                  </div>
                  <p className="text-[15px] font-semibold tracking-tight text-gray-900">
                    Δεν υπάρχουν διαθέσιμες υπηρεσίες
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'hours' && (() => {
            const todayDayOfWeek = (() => {
              const d = new Date().getDay()
              return d === 0 ? 7 : d
            })()

            return (
              <div className="space-y-6">
                {/* Weekly hours section */}
                <div>
                  <p className="text-[11px] font-semibold tracking-[1.6px] uppercase text-gray-500 mb-3">
                    Εβδομαδιαίο ωράριο
                  </p>
                  <div className="space-y-2">
                    {hours.map((row, idx) => {
                      const isToday = row.day_of_week === todayDayOfWeek
                      return (
                        <div
                          key={row.day_of_week}
                          className="bg-white border border-gray-100 rounded-[14px] p-3.5"
                          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <p className="text-[15px] font-semibold tracking-tight text-gray-900">{DAYS[idx]}</p>
                              {isToday && (
                                <span className="px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 text-[10px] font-semibold tracking-[0.4px] uppercase">
                                  Σήμερα
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2.5">
                              <button
                                onClick={() => setHours(prev => prev.map(h => h.day_of_week === row.day_of_week ? { ...h, is_open: !h.is_open } : h))}
                                className="relative w-[44px] h-[26px] rounded-full transition-colors"
                                style={{ background: row.is_open ? '#34C759' : '#E5E5E5' }}
                              >
                                <div
                                  className="absolute top-0.5 w-[22px] h-[22px] rounded-full bg-white transition-all"
                                  style={{
                                    left: row.is_open ? 20 : 2,
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.15), 0 1px 0 rgba(0,0,0,0.04)',
                                  }}
                                />
                              </button>
                              <span className={`text-[12px] font-semibold ${row.is_open ? 'text-gray-500' : 'text-gray-400'}`}>
                                {row.is_open ? 'Ανοιχτό' : 'Κλειστό'}
                              </span>
                            </div>
                          </div>
                          {row.is_open && (
                            <div className="flex items-center gap-2.5 mt-3">
                              <select
                                value={row.open_time}
                                onChange={e => setHours(prev => prev.map(h => h.day_of_week === row.day_of_week ? { ...h, open_time: e.target.value } : h))}
                                className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-gray-900 focus:outline-none"
                                style={{ fontVariantNumeric: 'tabular-nums' }}
                              >
                                {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                              </select>
                              <span className="text-[12px] text-gray-400">έως</span>
                              <select
                                value={row.close_time}
                                onChange={e => setHours(prev => prev.map(h => h.day_of_week === row.day_of_week ? { ...h, close_time: e.target.value } : h))}
                                className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-gray-900 focus:outline-none"
                                style={{ fontVariantNumeric: 'tabular-nums' }}
                              >
                                {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                              </select>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <button
                    onClick={saveHours}
                    disabled={savingHours}
                    className="w-full h-12 mt-4 rounded-xl bg-gray-900 text-white text-[14px] font-semibold tracking-tight disabled:opacity-40"
                  >
                    {savingHours ? 'Αποθήκευση...' : 'Αποθήκευση ωραρίου'}
                  </button>
                </div>

                {/* Divider */}
                <div className="h-px bg-gray-100" />

                {/* Exceptions section */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-semibold tracking-[1.6px] uppercase text-gray-500">
                      Εξαιρέσεις ημερών
                    </p>
                    <button
                      onClick={() => setShowExceptionPicker(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-gray-900 text-white text-[12px] font-semibold"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                      Προσθήκη
                    </button>
                  </div>

                  {exceptions.length === 0 ? (
                    <p className="text-[13px] text-gray-400">Δεν υπάρχουν εξαιρέσεις.</p>
                  ) : (
                    <div className="space-y-2">
                      {exceptions.map(ex => (
                        <div
                          key={ex.exception_date}
                          className="bg-white border border-gray-100 rounded-[14px] px-3.5 py-3 flex items-center gap-3"
                          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
                        >
                          <div className="flex-1">
                            <p className="text-[14px] font-semibold text-gray-900">
                              {new Date(ex.exception_date).toLocaleDateString('el-GR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Athens' })}
                            </p>
                            {ex.is_closed ? (
                              <span
                                className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold"
                                style={{ background: '#FCEAEA', color: '#B43C3C' }}
                              >
                                Κλειστά όλη τη μέρα
                              </span>
                            ) : ex.closed_from && ex.closed_to ? (
                              <span
                                className="inline-flex items-center mt-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold"
                                style={{ background: '#FFEDD5', color: '#C2410C', fontVariantNumeric: 'tabular-nums' }}
                              >
                                Κλειστά {ex.closed_from.slice(0, 5)} – {ex.closed_to.slice(0, 5)}
                              </span>
                            ) : (
                              <p className="text-[12px] text-gray-500 mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {(ex.periods || []).map(p => `Ανοιχτά ${p.open} – ${p.close}`).join(' · ') || '—'}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => deleteException(ex.exception_date)}
                            className="text-[11px] font-medium text-red-500 underline underline-offset-[2px]"
                          >
                            Διαγραφή
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              {/* Exception picker modal — Εξαίρεση ημέρας ή Εξαίρεση ώρας */}
              {showExceptionPicker && (
                <div className="fixed inset-0 z-50 flex items-end justify-center">
                  <div className="absolute inset-0 bg-black/30" onClick={() => setShowExceptionPicker(false)} />
                  <div className="relative bg-white rounded-t-3xl px-5 pt-5 pb-10 w-full max-w-md z-10 max-h-[82vh] overflow-y-auto overscroll-contain">
                    <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
                    <button
                      onClick={() => setShowExceptionPicker(false)}
                      aria-label="Κλείσιμο"
                      className="absolute top-3.5 right-4 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                    </button>
                    <p className="text-base font-semibold text-gray-900 mb-1">Προσθήκη εξαίρεσης</p>
                    <p className="text-[12px] text-gray-400 mb-4">Δήλωσε πότε ΔΕΝ θα δουλέψεις — οι ώρες κλείνουν αυτόματα για κρατήσεις.</p>

                    {/* Δύο επιλογές */}
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      <button
                        onClick={() => { setExceptionMode('day'); lightTap() }}
                        className={`rounded-xl border-2 p-3.5 text-left transition-colors ${
                          exceptionMode === 'day' ? 'border-gray-900 bg-gray-900' : 'border-gray-200 bg-white'
                        }`}
                      >
                        <p className={`text-[14px] font-semibold ${exceptionMode === 'day' ? 'text-white' : 'text-gray-900'}`}>
                          Εξαίρεση ημέρας
                        </p>
                        <p className={`text-[11px] mt-1 leading-snug ${exceptionMode === 'day' ? 'text-white/70' : 'text-gray-400'}`}>
                          Κλειστά όλη τη μέρα
                        </p>
                      </button>
                      <button
                        onClick={() => { setExceptionMode('hours'); lightTap() }}
                        className={`rounded-xl border-2 p-3.5 text-left transition-colors ${
                          exceptionMode === 'hours' ? 'border-gray-900 bg-gray-900' : 'border-gray-200 bg-white'
                        }`}
                      >
                        <p className={`text-[14px] font-semibold ${exceptionMode === 'hours' ? 'text-white' : 'text-gray-900'}`}>
                          Εξαίρεση ώρας
                        </p>
                        <p className={`text-[11px] mt-1 leading-snug ${exceptionMode === 'hours' ? 'text-white/70' : 'text-gray-400'}`}>
                          Κλειστά από–έως
                        </p>
                      </button>
                    </div>

                    {/* Ημερομηνία — και στις δύο επιλογές */}
                    <div className="mb-4">
                      <p className="text-xs text-gray-400 mb-1.5">Ημερομηνία</p>
                      <input type="date" value={exceptionDate}
                        onChange={e => setExceptionDate(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none" />
                    </div>

                    {/* Διάστημα — μόνο στην εξαίρεση ώρας */}
                    {exceptionMode === 'hours' && (
                      <div className="mb-4">
                        <p className="text-xs text-gray-400 mb-1.5">Δεν θα δουλέψω από — έως</p>
                        <div className="flex items-center gap-2">
                          <select value={exceptionFrom}
                            onChange={e => setExceptionFrom(e.target.value)}
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white">
                            {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                          <span className="text-gray-400 text-xs">έως</span>
                          <select value={exceptionTo}
                            onChange={e => setExceptionTo(e.target.value)}
                            className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white">
                            {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                        {exceptionFrom >= exceptionTo && (
                          <p className="text-[11px] text-red-500 mt-1.5">Η ώρα «έως» πρέπει να είναι μετά την «από».</p>
                        )}
                      </div>
                    )}

                    <button
                      onClick={saveException}
                      disabled={!exceptionDate || (exceptionMode === 'hours' && exceptionFrom >= exceptionTo)}
                      className="w-full bg-gray-900 text-white text-sm font-medium py-3.5 rounded-xl disabled:opacity-40"
                    >
                      Αποθήκευση
                    </button>
                  </div>
                </div>
              )}
              </div>
            )
          })()}

          {activeTab === 'settings' && (
            <div className="space-y-5">
              <div
                className="bg-white border border-gray-100 rounded-[14px] p-4"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
              >
                <p className="text-[15px] font-semibold tracking-tight text-gray-900">Μάνικες / θέσεις εξυπηρέτησης</p>
                <p className="text-[13px] text-gray-500 mt-1 leading-relaxed">
                  Πόσα αυτοκίνητα μπορείς να εξυπηρετείς <span className="font-semibold text-gray-900">ταυτόχρονα</span>;
                  Αν έχεις 2 μάνικες, η ίδια ώρα μπορεί να κλειστεί 2 φορές.
                </p>

                <div className="flex items-center justify-center gap-5 mt-5">
                  <button
                    onClick={() => { setCapacity(c => Math.max(1, c - 1)); lightTap() }}
                    className="w-12 h-12 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-900 text-xl font-semibold disabled:opacity-30"
                    disabled={capacity <= 1}
                  >
                    −
                  </button>
                  <div className="w-20 text-center">
                    <p className="text-[34px] font-bold tracking-tight text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {capacity}
                    </p>
                    <p className="text-[11px] font-semibold tracking-[1.2px] uppercase text-gray-400 -mt-1">
                      {capacity === 1 ? 'μάνικα' : 'μάνικες'}
                    </p>
                  </div>
                  <button
                    onClick={() => { setCapacity(c => Math.min(10, c + 1)); lightTap() }}
                    className="w-12 h-12 rounded-full bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-900 text-xl font-semibold disabled:opacity-30"
                    disabled={capacity >= 10}
                  >
                    +
                  </button>
                </div>

                <button
                  onClick={saveCapacity}
                  disabled={savingCapacity}
                  className="w-full h-12 mt-5 rounded-xl bg-gray-900 text-white text-[14px] font-semibold tracking-tight disabled:opacity-40"
                >
                  {savingCapacity ? 'Αποθήκευση...' : capacitySaved ? '✓ Αποθηκεύτηκε' : 'Αποθήκευση'}
                </button>
              </div>

              <p className="text-[12px] text-gray-400 leading-relaxed px-1">
                Η αλλαγή ισχύει αμέσως: αν δηλώσεις 2 μάνικες, οι πελάτες στην εφαρμογή θα βλέπουν
                διαθέσιμη μια ώρα μέχρι να έχει 2 κρατήσεις.
              </p>
            </div>
          )}

          {activeTab === 'staff' && (() => {
            const roleConfig = (role: string) => {
              if (role === 'Διευθυντής') return { bg: '#EAF2FD', fg: '#1A6FD4' }
              if (role === 'Ταμίας') return { bg: '#FEF3C7', fg: '#92400E' }
              return { bg: '#F7F7F7', fg: '#666666' } // Τεχνικός / default
            }

            return (
              <div className="space-y-5">
                {/* Existing staff section */}
                <div>
                  <p className="text-[11px] font-semibold tracking-[1.6px] uppercase text-gray-500 mb-3">
                    Ομάδα ({staff.length})
                  </p>

                  {staff.length === 0 ? (
                    <div className="bg-white border border-gray-100 rounded-2xl py-8 flex flex-col items-center text-center"
                         style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                      <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 mb-3">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <circle cx="12" cy="8" r="4"/>
                          <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>
                        </svg>
                      </div>
                      <p className="text-[14px] font-semibold text-gray-900">Δεν υπάρχει προσωπικό</p>
                      <p className="text-[12px] text-gray-500 mt-1">Πρόσθεσε το πρώτο μέλος της ομάδας</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {staff.map(member => {
                        const role = roleConfig(member.role)
                        const initial = (member.full_name || '?')[0].toUpperCase()
                        return (
                          <div
                            key={member.id}
                            className="bg-white border border-gray-100 rounded-2xl px-3.5 py-3 flex items-center gap-3"
                            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
                          >
                            <div className="w-11 h-11 rounded-full bg-gray-900 text-white flex items-center justify-center text-[15px] font-semibold tracking-tight shrink-0">
                              {initial}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-[14px] font-semibold tracking-tight text-gray-900 truncate">
                                  {member.full_name}
                                </p>
                                <span
                                  className="px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-tight shrink-0"
                                  style={{ background: role.bg, color: role.fg }}
                                >
                                  {member.role}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.6" strokeLinecap="round">
                                  <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1"/>
                                </svg>
                                <p className="text-[12px] text-gray-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {member.phone}
                                </p>
                              </div>
                            </div>
                            <button
                              onClick={() => deleteStaff(member.id)}
                              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-400 shrink-0"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                                <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>
                              </svg>
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="h-px bg-gray-100" />

                {/* Add new member */}
                <div>
                  <p className="text-[11px] font-semibold tracking-[1.6px] uppercase text-gray-500 mb-3">
                    Προσθήκη μέλους
                  </p>

                  <div className="bg-white border border-gray-100 rounded-2xl p-4 space-y-3"
                       style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                    <div>
                      <p className="text-[11px] font-semibold tracking-[1.4px] uppercase text-gray-500 mb-1.5">
                        Όνομα
                      </p>
                      <input
                        value={newStaffName}
                        onChange={e => setNewStaffName(e.target.value)}
                        placeholder="π.χ. Γιώργος Παπαδόπουλος"
                        className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-[14px] text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                      />
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold tracking-[1.4px] uppercase text-gray-500 mb-1.5">
                        Ρόλος
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        {['Τεχνικός', 'Ταμίας', 'Διευθυντής'].map(r => {
                          const active = newStaffRole === r
                          return (
                            <button
                              key={r}
                              onClick={() => setNewStaffRole(r)}
                              className={`py-2.5 rounded-xl border text-[13px] font-semibold tracking-tight transition-all ${
                                active
                                  ? 'bg-gray-900 border-gray-900 text-white'
                                  : 'bg-white border-gray-200 text-gray-600'
                              }`}
                            >
                              {r}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold tracking-[1.4px] uppercase text-gray-500 mb-1.5">
                        Τηλέφωνο
                      </p>
                      <input
                        value={newStaffPhone}
                        onChange={e => setNewStaffPhone(e.target.value)}
                        placeholder="69x xxx xxxx"
                        type="tel"
                        className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-[14px] text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                        style={{ fontVariantNumeric: 'tabular-nums' }}
                      />
                    </div>

                    <button
                      onClick={addStaff}
                      disabled={!newStaffName.trim() || !newStaffPhone.trim()}
                      className="w-full h-12 rounded-xl bg-gray-900 text-white text-[14px] font-semibold tracking-tight flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                      Προσθήκη μέλους
                    </button>
                  </div>
                </div>
              </div>
            )
          })()}

          {activeTab === 'feedback' && (() => {
            // Rating distribution
            const distribution = [5, 4, 3, 2, 1].map(stars => {
              const count = reviews.filter(r => Number(r.rating) === stars).length
              const percent = reviews.length > 0 ? (count / reviews.length) * 100 : 0
              return { stars, count, percent }
            })

            const Star = ({ filled, size = 14 }: { filled: boolean; size?: number }) => (
              <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? '#F59E0B' : 'none'} stroke={filled ? '#F59E0B' : '#E5E5E5'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            )

            return (
              <div className="space-y-5">
                {/* Summary card */}
                <div
                  className="bg-white border border-gray-100 rounded-2xl p-5"
                  style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
                >
                  <div className="flex items-start gap-5">
                    {/* Big number */}
                    <div className="text-center">
                      <p className="text-[42px] font-bold tracking-tight text-gray-900 leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {reviews.length > 0 ? avgRating.toFixed(1) : '—'}
                      </p>
                      <div className="flex items-center gap-0.5 mt-1.5 justify-center">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star key={s} filled={s <= Math.round(avgRating)} size={12} />
                        ))}
                      </div>
                      <p className="text-[10px] font-semibold tracking-[1.4px] uppercase text-gray-500 mt-1.5">
                        {reviews.length} {reviews.length === 1 ? 'κριτική' : 'κριτικές'}
                      </p>
                    </div>

                    {/* Distribution bars */}
                    <div className="flex-1 flex flex-col gap-1.5">
                      {distribution.map(d => (
                        <div key={d.stars} className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-gray-500 w-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {d.stars}
                          </span>
                          <Star filled size={10} />
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-400 rounded-full transition-all"
                              style={{ width: `${d.percent}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-medium text-gray-500 w-5 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {d.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Reviews list */}
                {reviews.length > 0 ? (
                  <div>
                    <p className="text-[11px] font-semibold tracking-[1.6px] uppercase text-gray-500 mb-3">
                      Πρόσφατες κριτικές
                    </p>
                    <div className="space-y-2">
                      {reviews.map(review => {
                        const rating = Number(review.rating || 0)
                        return (
                          <div
                            key={review.id}
                            className="bg-white border border-gray-100 rounded-2xl p-4"
                            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-0.5">
                                {[1, 2, 3, 4, 5].map(s => (
                                  <Star key={s} filled={s <= rating} size={14} />
                                ))}
                              </div>
                              <p className="text-[11px] font-medium text-gray-400">
                                {new Date(review.created_at).toLocaleDateString('el-GR', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                  timeZone: 'Europe/Athens',
                                })}
                              </p>
                            </div>
                            {review.comment && (
                              <p className="text-[14px] text-gray-900 mt-2.5 leading-relaxed">
                                {review.comment}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center pt-8">
                    <div
                      className="w-16 h-16 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-gray-400 mb-4"
                      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
                    >
                      <Star filled={false} size={28} />
                    </div>
                    <p className="text-[15px] font-semibold tracking-tight text-gray-900">
                      Δεν υπάρχουν αξιολογήσεις ακόμα
                    </p>
                    <p className="text-[13px] text-gray-500 mt-1.5 max-w-[280px]">
                      Όταν οι πελάτες αξιολογήσουν τις κρατήσεις τους, θα εμφανιστούν εδώ.
                    </p>
                  </div>
                )}
              </div>
            )
          })()}

        </div>
      </div>
    </main>
  )
}