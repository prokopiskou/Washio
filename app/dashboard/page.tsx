'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LineChart, Line, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { createClient } from '@/lib/supabase/client'

type TabKey = 'overview' | 'bookings' | 'calendar' | 'services' | 'hours' | 'staff' | 'feedback'
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
  profiles?: { full_name?: string; phone?: string; email?: string } | null
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

const defaultHours: LocationHour[] = DAYS.map((_, idx) => ({
  day_of_week: idx + 1,
  is_open: idx < 6,
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
  const [notifPermission, setNotifPermission] = useState<string>('default')
  const [chartPeriod, setChartPeriod] = useState<Period>('6M')
  const [chartMetric, setChartMetric] = useState<Metric>('revenue')
  const locationIdRef = useRef<string | null>(null)

  useEffect(() => {
    if ('Notification' in window) {
      setNotifPermission(Notification.permission)
    }
  }, [])

  const requestNotifications = async () => {
    const permission = await Notification.requestPermission()
    setNotifPermission(permission)
  }

  const loadCalendarBookings = async (date: Date) => {
    if (!location?.id) return
    setCalendarLoading(true)
    const supabase = createClient()
    const dateStr = date.toISOString().split('T')[0]
    const { data } = await supabase
      .from('bookings')
      .select('id, slot_start_time, total_amount, status, profiles(full_name)')
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
    const loadDashboard = async () => {
      const supabase = createClient()
      const { data: authData } = await supabase.auth.getSession()
      const user = authData.session?.user

      if (!user) {
        router.push('/login')
        return
      }

      const { data: ownerLocation, error: locationError } = await supabase
        .from('locations')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle()

      console.log('User ID:', user.id)
      console.log('Location data:', ownerLocation)
      console.log('Location error:', locationError)

      setLocation(ownerLocation)

      if (!ownerLocation?.id) {
        setLoading(false)
        return
      }

      const locationId = ownerLocation.id
      locationIdRef.current = locationId

      const [bookingsRes, addonsRes, servicesRes, locationAddonsRes, hoursRes, staffRes, reviewsRes] = await Promise.all([
        supabase.from('bookings')
          .select('id, slot_date, slot_start_time, total_amount, status, service_id, user_id, created_at, profiles(full_name, phone, email)')
          .eq('location_id', locationId)
          .order('created_at', { ascending: false }),
        supabase.from('addons').select('id, name, price, sort_order').eq('is_active', true).order('sort_order', { ascending: true }),
        supabase.from('services').select('id, price_moto').eq('location_id', locationId),
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
        .select('id, exception_date, periods, is_closed')
        .eq('location_id', locationId)
        .order('exception_date', { ascending: true })
      setExceptions((exceptionsData as HourException[]) || [])

      setLoading(false)

      const locationName = ownerLocation.name
      const channel = supabase.channel(`bookings-changes-${locationId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings', filter: `location_id=eq.${locationId}` },
          (payload) => {
            console.log('NEW BOOKING RECEIVED:', payload)
            setBookings(prev => [payload.new as Booking, ...prev])
            setNewBookingsCount(prev => prev + 1)
            triggerNewBookingAlert(locationName)
          })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `location_id=eq.${locationId}` },
          (payload) => {
            console.log('BOOKING UPDATED:', payload)
            setBookings(prev => prev.map(b => b.id === payload.new.id ? { ...b, ...payload.new } : b))
          })
        .subscribe((status, err) => {
          console.log('Realtime subscription status:', status)
          if (err) console.error('Realtime error:', err)
        })

      const interval = setInterval(async () => {
        const { data } = await supabase.from('bookings')
          .select('id, slot_date, slot_start_time, total_amount, status, service_id, user_id, created_at, profiles(full_name, phone, email)')
          .eq('location_id', locationId).order('created_at', { ascending: false })
        if (data) setBookings(data as Booking[])
      }, 30000)

      return () => { supabase.removeChannel(channel); clearInterval(interval) }
    }
    loadDashboard()
  }, [router])

  // Chart data based on period and metric
  const chartData = useMemo(() => {
    const now = new Date()

    if (chartPeriod === '7D' || chartPeriod === '30D') {
      const days = chartPeriod === '7D' ? 7 : 30
      const points = Array.from({ length: days }, (_, i) => {
        const d = new Date(now)
        d.setDate(now.getDate() - (days - 1 - i))
        const dateStr = d.toISOString().split('T')[0]
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
  const todayBookings = bookings.filter(b => b.slot_date === new Date().toISOString().split('T')[0])

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
    await Promise.all(hours.map(row =>
      supabase.from('location_hours').upsert(
        { location_id: location.id, day_of_week: row.day_of_week, is_closed: !row.is_open, open_time: row.open_time, close_time: row.close_time },
        { onConflict: 'location_id,day_of_week' }
      )
    ))
    setSavingHours(false)
  }

  const saveException = async () => {
    if (!location?.id || !exceptionDate) return
    const supabase = createClient()
    await supabase.from('location_hours_exceptions').upsert({
      location_id: location.id,
      exception_date: exceptionDate,
      periods: exceptionClosed ? [] : exceptionPeriods,
      is_closed: exceptionClosed,
    }, { onConflict: 'location_id,exception_date' })

    const { data } = await supabase
      .from('location_hours_exceptions')
      .select('id, exception_date, periods, is_closed')
      .eq('location_id', location.id)
      .order('exception_date', { ascending: true })
    setExceptions((data as HourException[]) || [])
    setShowExceptionPicker(false)
    setExceptionDate('')
    setExceptionPeriods([{ open: '09:00', close: '17:00' }])
    setExceptionClosed(false)
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
    const supabase = createClient()
    await supabase.from('bookings').update({ status: 'cancelled' }).eq('id', id)
    setBookings(prev => prev.map(b => b.id === id ? { ...b, status: 'cancelled' } : b))
  }

  if (loading) return <main className="min-h-screen bg-white flex items-center justify-center"><p className="text-xs text-gray-400">Φόρτωση...</p></main>
  if (!location?.id) return <main className="min-h-screen bg-white flex items-center justify-center"><p className="text-sm text-gray-500">Δεν έχεις συνδεδεμένο πλυντήριο.</p></main>

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto">

        <div className="px-5 pt-14 pb-4 bg-white">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-[22px] font-bold tracking-tight leading-[1.2] text-gray-900">{location.name}</h1>
              <p className="text-[12px] text-gray-500 mt-1">{location.address}, {location.city}</p>
            </div>
            <div className="w-[38px] h-[38px] rounded-full bg-gray-50 flex items-center justify-center text-gray-900 shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
              </svg>
            </div>
          </div>

          {notifPermission === 'granted' ? (
            <div className="inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded-lg" style={{ background: '#E7F6EF', color: '#0F7A5C' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#10B981' }} />
              <span className="text-[11px] font-semibold tracking-tight">Ειδοποιήσεις ενεργές</span>
            </div>
          ) : (
            <button
              onClick={requestNotifications}
              className="mt-3 w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5"
              style={{ background: '#FEF6E6', border: '1px solid #FBE7B8' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8A6209" strokeWidth="1.75" strokeLinecap="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6"/>
                <path d="M10 19a2 2 0 0 0 4 0"/>
              </svg>
              <span className="flex-1 text-left text-[12px] font-medium" style={{ color: '#8A6209' }}>Ενεργοποίησε ειδοποιήσεις</span>
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md" style={{ background: '#8A6209', color: '#fff' }}>Ενεργοποίηση</span>
            </button>
          )}
        </div>

        <div className="sticky top-0 z-20 bg-white border-b border-gray-100">
          <div className="flex overflow-x-auto scrollbar-hide px-5 gap-[22px]">
          {([
            ['overview', 'Overview'],
            ['bookings', `Κρατήσεις${newBookingsCount > 0 ? ` (${newBookingsCount})` : ''}`],
            ['calendar', 'Ημερολόγιο'],
            ['services', 'Υπηρεσίες'],
            ['hours', 'Ωράριο'],
            ['staff', 'Προσωπικό'],
            ['feedback', 'Feedback'],
          ] as [TabKey, string][]).map(([key, label]) => (
            <button key={key}
              onClick={() => { setActiveTab(key); if (key === 'bookings') setNewBookingsCount(0) }}
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
            }

            const statusPillConfig = (status?: string) => {
              if (status === 'pending') return { bg: '#FEF3C7', fg: '#92400E', label: 'Εκκρεμεί' }
              if (status === 'confirmed') return { bg: '#EAF2FD', fg: '#1A6FD4', label: 'Επιβεβ.' }
              if (status === 'completed') return { bg: '#E7F6EF', fg: '#0F7A5C', label: 'Ολοκλ.' }
              if (status === 'cancelled') return { bg: '#FCEAEA', fg: '#B43C3C', label: 'Ακυρ.' }
              return { bg: '#F7F7F7', fg: '#666666', label: status || '—' }
            }

            return (
              <div className="space-y-3">
                {/* Status filter chips */}
                <div className="flex gap-2 overflow-x-auto scrollbar-hide -mx-5 px-5 pb-1">
                  {[
                    { value: 'all', label: 'Όλες' },
                    { value: 'confirmed', label: 'Επιβεβαιωμένες' },
                    { value: 'completed', label: 'Ολοκληρωμένες' },
                    { value: 'cancelled', label: 'Ακυρωμένες' },
                    { value: 'pending', label: 'Εκκρεμείς' },
                  ].map(opt => {
                    const active = filterStatus === opt.value
                    const count = (statusCounts as any)[opt.value]
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setFilterStatus(opt.value)}
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
                      onClick={() => setSortBy('slot_date')}
                      className={`text-[12px] px-2.5 py-1 rounded-md font-semibold tracking-tight transition-all ${
                        sortBy === 'slot_date' ? 'bg-gray-900 text-white' : 'text-gray-500'
                      }`}
                    >
                      Πλύσιμο
                    </button>
                    <button
                      onClick={() => setSortBy('created_at')}
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

                    return (
                      <div
                        key={b.id}
                        className="bg-white border border-gray-100 rounded-xl p-3 flex items-start gap-3"
                        style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-semibold tracking-tight text-gray-900">
                            {b.profiles?.full_name || 'Πελάτης'}
                          </p>
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
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold tracking-tight"
                            style={{ background: pill.bg, color: pill.fg }}
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: pill.fg }} />
                            {pill.label}
                          </span>
                          {canCancel && (
                            <button
                              onClick={() => cancelBooking(b.id)}
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

                {/* Selected day list */}
                <div>
                  <p className="text-[16px] font-semibold tracking-tight text-gray-900 capitalize">
                    {calendarDate.toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Athens' })}
                  </p>
                  <p className="text-[11px] font-semibold tracking-[1.4px] uppercase text-gray-500 mt-1">
                    {calendarLoading ? 'Φόρτωση...' : `${calendarBookings.length} ${calendarBookings.length === 1 ? 'κράτηση' : 'κρατήσεις'}`}
                  </p>

                  {calendarBookings.length > 0 && !calendarLoading && (
                    <div className="flex flex-col gap-1.5 mt-3.5">
                      {calendarBookings.map(b => {
                        const pill = statusPillConfig(b.status)
                        return (
                          <div
                            key={b.id}
                            className="flex items-center gap-3 px-3.5 py-3 rounded-[10px] bg-gray-50"
                          >
                            <span
                              className="text-[14px] font-bold tracking-tight text-gray-900 w-[52px] shrink-0"
                              style={{ fontVariantNumeric: 'tabular-nums' }}
                            >
                              {b.slot_start_time?.slice(0, 5)}
                            </span>
                            <span className="flex-1 text-[13px] font-medium text-gray-900 truncate">
                              {b.profiles?.full_name || 'Πελάτης'}
                            </span>
                            <span className="text-[13px] font-semibold text-gray-900">
                              €{Number(b.total_amount || 0).toFixed(0)}
                            </span>
                            <span
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-tight shrink-0"
                              style={{ background: pill.bg, color: pill.fg }}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: pill.fg }} />
                              {pill.label}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {!calendarLoading && calendarBookings.length === 0 && (
                    <p className="text-[13px] text-gray-400 mt-4">Δεν υπάρχουν κρατήσεις αυτή τη μέρα.</p>
                  )}
                </div>
              </div>
            )
          })()}

          {activeTab === 'services' && (
            <div className="space-y-4">
              <p className="text-[11px] font-semibold tracking-[1.6px] uppercase text-gray-500">
                Διαθέσιμες υπηρεσίες
              </p>
              <p className="text-[13px] text-gray-500 -mt-2 leading-relaxed">
                Επίλεξε τις υπηρεσίες που προσφέρεις στο σημείο σου και όρισε τις τιμές ξεχωριστά για ΙΧ και Μοτοσικλέτα.
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
                                Κλειστό
                              </span>
                            ) : (
                              <p className="text-[12px] text-gray-500 mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {ex.periods.map(p => `${p.open} – ${p.close}`).join(' · ')}
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

              {/* Exception picker modal */}
              {showExceptionPicker && (
                <div className="fixed inset-0 z-50 flex items-end justify-center">
                  <div className="absolute inset-0 bg-black/30" onClick={() => setShowExceptionPicker(false)} />
                  <div className="relative bg-white rounded-t-3xl px-5 pt-5 pb-10 w-full max-w-md z-10">
                    <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
                    <p className="text-base font-semibold text-gray-900 mb-4">Εξαίρεση ημέρας</p>

                    <div className="mb-4">
                      <p className="text-xs text-gray-400 mb-1.5">Ημερομηνία</p>
                      <input type="date" value={exceptionDate}
                        onChange={e => setExceptionDate(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none" />
                    </div>

                    <div className="flex items-center gap-2 mb-4">
                      <button onClick={() => setExceptionClosed(!exceptionClosed)}
                        className={`text-xs px-3 py-1.5 rounded-lg ${exceptionClosed ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-500'}`}>
                        {exceptionClosed ? '✗ Κλειστό' : 'Ανοιχτό'}
                      </button>
                    </div>

                    {!exceptionClosed && (
                      <div className="space-y-2 mb-4">
                        <p className="text-xs text-gray-400">Ώρες λειτουργίας</p>
                        {exceptionPeriods.map((period, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <select value={period.open}
                              onChange={e => setExceptionPeriods(prev => prev.map((p, i) => i === idx ? { ...p, open: e.target.value } : p))}
                              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                              {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                            <span className="text-gray-400 text-xs">έως</span>
                            <select value={period.close}
                              onChange={e => setExceptionPeriods(prev => prev.map((p, i) => i === idx ? { ...p, close: e.target.value } : p))}
                              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                              {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                            </select>
                            {exceptionPeriods.length > 1 && (
                              <button onClick={() => setExceptionPeriods(prev => prev.filter((_, i) => i !== idx))}
                                className="text-red-400 text-xs px-1">✕</button>
                            )}
                          </div>
                        ))}
                        <button onClick={() => setExceptionPeriods(prev => [...prev, { open: '15:00', close: '20:00' }])}
                          className="text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg px-3 py-2 w-full">
                          + Προσθήκη περιόδου
                        </button>
                      </div>
                    )}

                    <button onClick={saveException} disabled={!exceptionDate}
                      className="w-full bg-gray-900 text-white text-sm font-medium py-3.5 rounded-xl disabled:opacity-40">
                      Αποθήκευση
                    </button>
                  </div>
                </div>
              )}
              </div>
            )
          })()}

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

          {activeTab === 'feedback' && (
            <div className="space-y-3">
              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-xs text-gray-400">Μέση βαθμολογία</p>
                <p className="text-2xl font-semibold text-gray-900">{avgRating.toFixed(1)}</p>
              </div>
              {reviews.map(review => (
                <div key={review.id} className="border border-gray-100 rounded-xl px-4 py-3">
                  <p className="text-amber-500 text-sm">{'★'.repeat(Number(review.rating || 0))}{'☆'.repeat(5 - Number(review.rating || 0))}</p>
                  <p className="text-sm text-gray-900 mt-1">{review.comment || '—'}</p>
                  <p className="text-xs text-gray-400 mt-1">{new Date(review.created_at).toLocaleDateString('el-GR', { timeZone: 'Europe/Athens' })}</p>
                </div>
              ))}
              {!reviews.length && <p className="text-xs text-gray-400">Δεν υπάρχουν αξιολογήσεις ακόμα.</p>}
            </div>
          )}

        </div>
      </div>
    </main>
  )
}