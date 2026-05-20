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
      return { key, label: d.toLocaleDateString('el-GR', { month: 'short' }), revenue: 0, bookings: 0 }
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
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto">

        <div className="px-5 pt-8 pb-4 border-b border-gray-100">
          <h1 className="text-base font-semibold text-gray-900">{location.name}</h1>
          <p className="text-xs text-gray-400 mt-0.5">{location.address}, {location.city}</p>

          {notifPermission !== 'granted' && (
            <button
              onClick={requestNotifications}
              className="mt-3 w-full flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3"
            >
              <div className="text-left">
                <p className="text-xs font-medium text-amber-800">🔔 Ενεργοποίησε ειδοποιήσεις</p>
                <p className="text-xs text-amber-600 mt-0.5">Μάθε άμεσα για νέες κρατήσεις</p>
              </div>
              <span className="text-xs bg-amber-800 text-white px-3 py-1.5 rounded-lg shrink-0 ml-3">
                Ενεργοποίηση
              </span>
            </button>
          )}

          {notifPermission === 'granted' && (
            <div className="mt-3 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              <p className="text-xs text-gray-400">Ειδοποιήσεις ενεργές</p>
            </div>
          )}
        </div>

        <div className="flex overflow-x-auto scrollbar-hide border-b border-gray-100">
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
              className={`shrink-0 px-4 py-3 text-xs font-medium border-b-2 transition-all ${
                activeTab === key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'
              } ${key === 'bookings' && newBookingsCount > 0 ? 'text-blue-600' : ''}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="px-5 py-5">

          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Κρατήσεις σήμερα', value: todayBookings.length },
                  { label: 'Κρατήσεις μήνα', value: monthlyBookings.length },
                  { label: 'Έσοδα μήνα', value: `€${monthlyRevenue.toFixed(0)}` },
                  { label: 'Μέση βαθμολογία', value: avgRating.toFixed(1) },
                ].map(s => (
                  <div key={s.label} className="border border-gray-100 rounded-xl p-4">
                    <p className="text-xs text-gray-400">{s.label}</p>
                    <p className="text-xl font-semibold text-gray-900">{s.value}</p>
                  </div>
                ))}
              </div>

              {todayBookings.length > 0 && (
                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">Σήμερα</p>
                    <span className="text-xs text-gray-400">{todayBookings.length} κρατήσεις</span>
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

              <div className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50">
                  <p className="text-sm font-medium text-gray-900">Πρόσφατες κρατήσεις</p>
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

              {/* Chart με controls */}
              <div className="border border-gray-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex gap-1">
                    {METRICS.map(m => (
                      <button key={m.key} onClick={() => setChartMetric(m.key)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                          chartMetric === m.key ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-600'
                        }`}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1">
                    {PERIODS.map(p => (
                      <button key={p.key} onClick={() => setChartPeriod(p.key)}
                        className={`text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all ${
                          chartPeriod === p.key ? 'bg-gray-900 text-white' : 'text-gray-400 hover:text-gray-600'
                        }`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

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

          {activeTab === 'bookings' && (
            <div className="space-y-3">
              {/* Filters */}
              <div className="flex gap-2 flex-wrap">
                {/* Status filter */}
                <div className="flex gap-1">
                  {[
                    { value: 'all', label: 'Όλες' },
                    { value: 'confirmed', label: 'Επιβεβαιωμένες' },
                    { value: 'completed', label: 'Ολοκληρωμένες' },
                    { value: 'cancelled', label: 'Ακυρωμένες' },
                    { value: 'pending', label: 'Εκκρεμείς' },
                  ].map(opt => (
                    <button key={opt.value} onClick={() => setFilterStatus(opt.value)}
                      className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                        filterStatus === opt.value ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Sort */}
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-xs text-gray-400">Ταξινόμηση:</span>
                  <button onClick={() => setSortBy('created_at')}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                      sortBy === 'created_at' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                    Κλείσιμο
                  </button>
                  <button onClick={() => setSortBy('slot_date')}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                      sortBy === 'slot_date' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
                    }`}>
                    Πλύσιμο
                  </button>
                </div>
              </div>

              {/* List */}
              {[...bookings]
                .filter(b => filterStatus === 'all' || b.status === filterStatus)
                .sort((a, b) => {
                  if (sortBy === 'created_at') {
                    return new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
                  }
                  return new Date(b.slot_date || '').getTime() - new Date(a.slot_date || '').getTime()
                })
                .map(b => (
                  <div key={b.id} className="border border-gray-100 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {b.profiles?.full_name || 'Πελάτης'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {b.profiles?.phone || b.profiles?.email || '—'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          🚿 {b.slot_date} · {b.slot_start_time?.slice(0, 5) || '—'}
                        </p>
                        <p className="text-xs text-gray-300 mt-0.5">
                          Κλείστηκε: {b.created_at ? new Date(b.created_at).toLocaleDateString('el-GR') : '—'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-gray-900">€{Number(b.total_amount || 0).toFixed(0)}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-md ${statusClass(b.status)}`}>
                          {statusLabel(b.status)}
                        </span>
                        {(b.status === 'pending' || b.status === 'confirmed') && (
                          <button onClick={() => cancelBooking(b.id)} className="block text-xs text-red-500 mt-1">
                            Ακύρωση
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              }
              {bookings.length === 0 && (
                <p className="text-xs text-gray-400 py-6">Δεν υπάρχουν κρατήσεις ακόμα.</p>
              )}
            </div>
          )}


          {activeTab === 'calendar' && (
            <div className="space-y-4">
              {/* Month navigation */}
              <div className="flex items-center justify-between">
                <button onClick={() => {
                  const d = new Date(calendarDate)
                  d.setMonth(d.getMonth() - 1)
                  setCalendarDate(d)
                }} className="text-gray-400 px-2 py-1 rounded-lg hover:bg-gray-50 text-lg">‹</button>
                <p className="text-sm font-medium text-gray-900">
                  {calendarDate.toLocaleDateString('el-GR', { month: 'long', year: 'numeric' })}
                </p>
                <button onClick={() => {
                  const d = new Date(calendarDate)
                  d.setMonth(d.getMonth() + 1)
                  setCalendarDate(d)
                }} className="text-gray-400 px-2 py-1 rounded-lg hover:bg-gray-50 text-lg">›</button>
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {['Δε', 'Τρ', 'Τε', 'Πε', 'Πα', 'Σα', 'Κυ'].map(d => (
                  <p key={d} className="text-xs text-gray-400 font-medium py-1">{d}</p>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {(() => {
                  const year = calendarDate.getFullYear()
                  const month = calendarDate.getMonth()
                  const firstDay = new Date(year, month, 1)
                  const lastDay = new Date(year, month + 1, 0)
                  const startPad = (firstDay.getDay() + 6) % 7
                  const days = []

                  for (let i = 0; i < startPad; i++) {
                    days.push(<div key={`pad-${i}`} />)
                  }

                  for (let d = 1; d <= lastDay.getDate(); d++) {
                    const thisDate = new Date(year, month, d)
                    const isToday = thisDate.toDateString() === new Date().toDateString()
                    const isSelected = thisDate.toDateString() === calendarDate.toDateString()

                    days.push(
                      <button key={d}
                        onClick={() => setCalendarDate(thisDate)}
                        className={`aspect-square rounded-xl text-xs font-medium transition-all ${
                          isSelected ? 'bg-gray-900 text-white' :
                          isToday ? 'border-2 border-gray-900 text-gray-900' :
                          'text-gray-600 hover:bg-gray-50'
                        }`}>
                        {d}
                      </button>
                    )
                  }
                  return days
                })()}
              </div>

              {/* Selected day bookings */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-sm font-medium text-gray-900 mb-3">
                  {calendarDate.toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>

                {calendarLoading ? (
                  <p className="text-xs text-gray-400">Φόρτωση...</p>
                ) : calendarBookings.length === 0 ? (
                  <p className="text-xs text-gray-400">Δεν υπάρχουν κρατήσεις αυτή τη μέρα.</p>
                ) : (
                  <div className="space-y-2">
                    {calendarBookings.map(b => (
                      <div key={b.id} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                        <div className="w-14 shrink-0">
                          <p className="text-sm font-semibold text-gray-900">{b.slot_start_time?.slice(0, 5)}</p>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-gray-900">{b.profiles?.full_name || 'Πελάτης'}</p>
                        </div>
                        <div className="shrink-0">
                          <p className="text-sm font-medium text-gray-900">€{Number(b.total_amount || 0).toFixed(0)}</p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-md shrink-0 ${statusClass(b.status)}`}>
                          {statusLabel(b.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'services' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">Επίλεξε ποιες υπηρεσίες προσφέρεις και όρισε την τιμή σου.</p>
              {services.map(service => (
                <div key={service.id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-gray-900">{service.service_name}</p>
                    <button onClick={() => toggleAddon(service)}
                      className={`text-xs rounded-xl px-4 py-2 transition-all ${service.is_active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
                      {service.is_active ? '✓ Ενεργή' : 'Ανενεργή'}
                    </button>
                  </div>
                  {service.is_active && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-20">ΙΧ:</span>
                        <input
                          type="number"
                          defaultValue={service.price_override ?? ''}
                          placeholder="π.χ. 10"
                          onBlur={async e => {
                            const val = parseFloat(e.target.value)
                            if (isNaN(val)) return
                            await updatePriceOverride(service, val)
                          }}
                          className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-gray-400"
                        />
                        <span className="text-xs text-gray-400">€</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 w-20">Μοτοσικλέτα:</span>
                        <input
                          type="number"
                          defaultValue={service.price_moto ?? ''}
                          placeholder="π.χ. 6"
                          onBlur={async e => {
                            const val = parseFloat(e.target.value)
                            if (isNaN(val)) return
                            const supabase = createClient()
                            await supabase.from('services').update({ price_moto: val }).eq('id', service.id)
                            setServices(prev => prev.map(s => s.id === service.id ? { ...s, price_moto: val } : s))
                          }}
                          className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-gray-400"
                        />
                        <span className="text-xs text-gray-400">€</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {services.length === 0 && <p className="text-xs text-gray-400">Δεν υπάρχουν διαθέσιμες υπηρεσίες.</p>}
            </div>
          )}

          {activeTab === 'hours' && (
            <div className="space-y-3">
              {hours.map((row, idx) => (
                <div key={row.day_of_week} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-gray-900">{DAYS[idx]}</p>
                    <button onClick={() => setHours(prev => prev.map(h => h.day_of_week === row.day_of_week ? { ...h, is_open: !h.is_open } : h))}
                      className={`text-xs rounded-lg px-3 py-1.5 ${row.is_open ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                      {row.is_open ? 'Ανοιχτό' : 'Κλειστό'}
                    </button>
                  </div>
                  {row.is_open && (
                    <div className="flex gap-2">
                      <select value={row.open_time} onChange={e => setHours(prev => prev.map(h => h.day_of_week === row.day_of_week ? { ...h, open_time: e.target.value } : h))}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                        {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <span className="text-gray-400 flex items-center text-xs">έως</span>
                      <select value={row.close_time} onChange={e => setHours(prev => prev.map(h => h.day_of_week === row.day_of_week ? { ...h, close_time: e.target.value } : h))}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                        {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              ))}
              <button onClick={saveHours} disabled={savingHours}
                className="w-full bg-gray-900 text-white text-sm rounded-xl px-4 py-3 disabled:opacity-40">
                {savingHours ? 'Αποθήκευση...' : 'Αποθήκευση ωραρίου'}
              </button>

              {/* Εξαιρέσεις */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-900">Εξαιρέσεις ημερών</p>
                  <button onClick={() => setShowExceptionPicker(true)}
                    className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg">
                    + Προσθήκη
                  </button>
                </div>

                {exceptions.length === 0 && (
                  <p className="text-xs text-gray-400">Δεν υπάρχουν εξαιρέσεις.</p>
                )}

                <div className="space-y-2">
                  {exceptions.map(ex => (
                    <div key={ex.exception_date} className="border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {new Date(ex.exception_date).toLocaleDateString('el-GR', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </p>
                        {ex.is_closed ? (
                          <p className="text-xs text-red-500 mt-0.5">Κλειστό</p>
                        ) : (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {ex.periods.map(p => `${p.open}–${p.close}`).join(' · ')}
                          </p>
                        )}
                      </div>
                      <button onClick={() => deleteException(ex.exception_date)}
                        className="text-xs text-red-400">Διαγραφή</button>
                    </div>
                  ))}
                </div>
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
          )}

          {activeTab === 'staff' && (
            <div className="space-y-3">
              {staff.map(member => (
                <div key={member.id} className="border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-900">{member.full_name}</p>
                    <p className="text-xs text-gray-400">{member.role} · {member.phone}</p>
                  </div>
                  <button onClick={() => deleteStaff(member.id)} className="text-xs text-red-500">Διαγραφή</button>
                </div>
              ))}
              {!staff.length && <p className="text-xs text-gray-400">Δεν υπάρχει προσωπικό.</p>}

              <div className="border border-gray-100 rounded-xl p-4 space-y-2">
                <p className="text-xs font-medium text-gray-700">Νέο μέλος</p>
                <input value={newStaffName} onChange={e => setNewStaffName(e.target.value)} placeholder="Όνομα"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                <select value={newStaffRole} onChange={e => setNewStaffRole(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                  <option value="Τεχνικός">Τεχνικός</option>
                  <option value="Ταμίας">Ταμίας</option>
                  <option value="Διευθυντής">Διευθυντής</option>
                </select>
                <input value={newStaffPhone} onChange={e => setNewStaffPhone(e.target.value)} placeholder="Τηλέφωνο"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                <button onClick={addStaff} className="w-full bg-gray-900 text-white text-sm rounded-xl px-3 py-2.5">Προσθήκη</button>
              </div>
            </div>
          )}

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
                  <p className="text-xs text-gray-400 mt-1">{new Date(review.created_at).toLocaleDateString('el-GR')}</p>
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