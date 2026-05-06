'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { createClient } from '@/lib/supabase/client'

type TabKey = 'overview' | 'bookings' | 'services' | 'hours' | 'staff' | 'feedback'

type Booking = {
  id: string
  slot_date?: string
  slot_start_time?: string
  total_amount?: number
  status?: string
  customer_name?: string
  profiles?: { full_name?: string } | null
  services?: { name?: string } | null
}

type DashboardService = {
  id: string
  service_name: string
  price: number
  price_override?: number
  is_active: boolean
}

type LocationHour = {
  id?: string
  day_of_week: number
  is_open: boolean
  open_time: string
  close_time: string
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
  const locationIdRef = useRef<string | null>(null)

  useEffect(() => {
    const loadDashboard = async () => {
      const supabase = createClient()
      const { data: authData } = await supabase.auth.getSession()
      const user = authData.session?.user

      if (!user) {
        router.push('/login')
        return
      }

      const { data: ownerLocation } = await supabase
        .from('locations')
        .select('*')
        .eq('owner_id', user.id)
        .maybeSingle()

      setLocation(ownerLocation)

      if (!ownerLocation?.id) {
        setLoading(false)
        return
      }

      const locationId = ownerLocation.id
      locationIdRef.current = locationId

      const [
        bookingsRes,
        addonsRes,
        locationAddonsRes,
        hoursRes,
        staffRes,
        reviewsRes,
      ] = await Promise.all([
        supabase
          .from('bookings')
          .select('id, slot_date, slot_start_time, total_amount, status, customer_name, profiles(full_name), services(name)')
          .eq('location_id', locationId)
          .order('slot_date', { ascending: false }),
        supabase
          .from('addons')
          .select('id, name, price, sort_order')
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('location_addons')
          .select('addon_id, price_override')
          .eq('location_id', locationId),
        supabase
          .from('location_hours')
          .select('id, day_of_week, is_open, open_time, close_time')
          .eq('location_id', locationId)
          .order('day_of_week', { ascending: true }),
        supabase
          .from('staff')
          .select('id, full_name, role, phone')
          .eq('location_id', locationId)
          .order('created_at', { ascending: false }),
        supabase
          .from('reviews')
          .select('id, rating, comment, created_at')
          .eq('location_id', locationId)
          .order('created_at', { ascending: false }),
      ])

      setBookings((bookingsRes.data as Booking[]) || [])

      const allAddons = (addonsRes.data as any[]) || []
      const locationAddonsMap: Record<string, any> = {}
      ;(locationAddonsRes.data || []).forEach((a: any) => {
        locationAddonsMap[a.addon_id] = a
      })
      const activeIds = new Set(Object.keys(locationAddonsMap))

      setServices(allAddons.map((a: any) => ({
        id: a.id,
        service_name: a.name,
        price: a.price,
        price_override: locationAddonsMap[a.id]?.price_override ?? undefined,
        is_active: activeIds.has(a.id),
      })))

      setStaff((staffRes.data as StaffMember[]) || [])
      setReviews((reviewsRes.data as Review[]) || [])

      if ((hoursRes.data as LocationHour[] | null)?.length) {
        setHours(hoursRes.data as LocationHour[])
      }

      setLoading(false)

      // Real-time subscription
      const channel = supabase
        .channel('bookings-changes')
        .on('postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'bookings', filter: `location_id=eq.${locationId}` },
          (payload) => {
            setBookings(prev => [payload.new as Booking, ...prev])
            setNewBookingsCount(prev => prev + 1)
          }
        )
        .on('postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'bookings', filter: `location_id=eq.${locationId}` },
          (payload) => {
            setBookings(prev => prev.map(b => b.id === payload.new.id ? { ...b, ...payload.new } : b))
          }
        )
        .subscribe()

      // Auto-refresh κάθε 30 δευτερόλεπτα
      const interval = setInterval(async () => {
        const { data } = await supabase
          .from('bookings')
          .select('id, slot_date, slot_start_time, total_amount, status, customer_name, profiles(full_name), services(name)')
          .eq('location_id', locationId)
          .order('slot_date', { ascending: false })
        if (data) setBookings(data as Booking[])
      }, 30000)

      return () => {
        supabase.removeChannel(channel)
        clearInterval(interval)
      }
    }

    loadDashboard()
  }, [router])

  const monthlyRevenueData = useMemo(() => {
    const now = new Date()
    const points = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      return { key, month: d.toLocaleDateString('el-GR', { month: 'short' }), revenue: 0 }
    })
    bookings.forEach(booking => {
      if (!booking.slot_date || booking.status !== 'completed') return
      const d = new Date(booking.slot_date)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      const target = points.find(p => p.key === key)
      if (target) target.revenue += Number(booking.total_amount || 0)
    })
    return points.map(({ month, revenue }) => ({ month, revenue }))
  }, [bookings])

  const avgRating = useMemo(() => {
    if (!reviews.length) return 0
    return reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / reviews.length
  }, [reviews])

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const monthlyBookings = bookings.filter(b => b.slot_date && new Date(b.slot_date) >= monthStart)
  const monthlyRevenue = monthlyBookings
    .filter(b => b.status === 'completed')
    .reduce((sum, b) => sum + Number(b.total_amount || 0), 0)

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
      await supabase.from('location_addons')
        .delete()
        .eq('location_id', location.id)
        .eq('addon_id', service.id)
      setServices(prev => prev.map(s => s.id === service.id ? { ...s, is_active: false, price_override: undefined } : s))
    } else {
      await supabase.from('location_addons')
        .insert({ location_id: location.id, addon_id: service.id })
      setServices(prev => prev.map(s => s.id === service.id ? { ...s, is_active: true } : s))
    }
  }

  const updatePriceOverride = async (service: DashboardService, val: number) => {
    const supabase = createClient()
    await supabase.from('location_addons')
      .update({ price_override: val })
      .eq('location_id', location.id)
      .eq('addon_id', service.id)
    setServices(prev => prev.map(s => s.id === service.id ? { ...s, price_override: val } : s))
  }

  const saveHours = async () => {
    if (!location?.id) return
    setSavingHours(true)
    const supabase = createClient()
    await Promise.all(
      hours.map(row =>
        supabase.from('location_hours').upsert(
          {
            location_id: location.id,
            day_of_week: row.day_of_week,
            is_open: row.is_open,
            open_time: row.open_time,
            close_time: row.close_time,
          },
          { onConflict: 'location_id,day_of_week' }
        )
      )
    )
    setSavingHours(false)
  }

  const addStaff = async () => {
    if (!location?.id || !newStaffName.trim() || !newStaffPhone.trim()) return
    const supabase = createClient()
    const { data } = await supabase
      .from('staff')
      .insert({
        location_id: location.id,
        full_name: newStaffName.trim(),
        role: newStaffRole,
        phone: newStaffPhone.trim(),
      })
      .select('id, full_name, role, phone')
      .single()
    if (data) setStaff(prev => [data as StaffMember, ...prev])
    setNewStaffName('')
    setNewStaffRole('Τεχνικός')
    setNewStaffPhone('')
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

  if (loading) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-xs text-gray-400">Φόρτωση...</p>
      </main>
    )
  }

  if (!location?.id) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-sm text-gray-500">Δεν έχεις συνδεδεμένο πλυντήριο.</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto">

        <div className="px-5 pt-8 pb-4 border-b border-gray-100">
          <h1 className="text-base font-semibold text-gray-900">{location.name}</h1>
          <p className="text-xs text-gray-400 mt-0.5">{location.address}, {location.city}</p>
        </div>

        <div className="flex overflow-x-auto scrollbar-hide border-b border-gray-100">
          {([
            ['overview', 'Overview'],
            ['bookings', `Κρατήσεις${newBookingsCount > 0 ? ` (${newBookingsCount})` : ''}`],
            ['services', 'Υπηρεσίες'],
            ['hours', 'Ωράριο'],
            ['staff', 'Προσωπικό'],
            ['feedback', 'Feedback'],
          ] as [TabKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => {
                setActiveTab(key)
                if (key === 'bookings') setNewBookingsCount(0)
              }}
              className={`shrink-0 px-4 py-3 text-xs font-medium border-b-2 transition-all relative ${
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

              {/* Σήμερα */}
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
                          <p className="text-sm text-gray-900">{b.slot_start_time?.slice(0, 5)} · {b.services?.name || '—'}</p>
                          <p className="text-xs text-gray-400">{b.profiles?.full_name || b.customer_name || 'Πελάτης'}</p>
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
                        <p className="text-sm text-gray-900">{b.slot_date} · {b.services?.name || '—'}</p>
                        <p className="text-xs text-gray-400">{b.profiles?.full_name || b.customer_name || 'Πελάτης'}</p>
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

              <div className="border border-gray-100 rounded-xl p-4">
                <p className="text-sm font-medium text-gray-900 mb-3">Έσοδα 6 μηνών</p>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyRevenueData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="revenue" fill="#111827" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'bookings' && (
            <div className="space-y-2">
              {bookings.map(b => (
                <div key={b.id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{b.profiles?.full_name || b.customer_name || 'Πελάτης'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{b.services?.name || '—'} · {b.slot_date} · {b.slot_start_time?.slice(0, 5) || '—'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-gray-900">€{Number(b.total_amount || 0).toFixed(0)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-md ${statusClass(b.status)}`}>{statusLabel(b.status)}</span>
                      {(b.status === 'pending' || b.status === 'confirmed') && (
                        <button onClick={() => cancelBooking(b.id)} className="block text-xs text-red-500 mt-1">Ακύρωση</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {bookings.length === 0 && <p className="text-xs text-gray-400 py-6">Δεν υπάρχουν κρατήσεις ακόμα.</p>}
            </div>
          )}

          {activeTab === 'services' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-400">Επίλεξε ποιες υπηρεσίες προσφέρεις και όρισε την τιμή σου.</p>
              {services.map(service => (
                <div key={service.id} className="border border-gray-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-medium text-gray-900">{service.service_name}</p>
                    <button
                      onClick={() => toggleAddon(service)}
                      className={`text-xs rounded-xl px-4 py-2 transition-all ${service.is_active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}
                    >
                      {service.is_active ? '✓ Ενεργή' : 'Ανενεργή'}
                    </button>
                  </div>
                  {service.is_active && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">Τιμή:</span>
                      <input
                        type="number"
                        defaultValue={service.price_override ?? ''}
                        placeholder="π.χ. 25"
                        onBlur={async e => {
                          const val = parseFloat(e.target.value)
                          if (isNaN(val)) return
                          await updatePriceOverride(service, val)
                        }}
                        className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-gray-400"
                      />
                      <span className="text-xs text-gray-400">€</span>
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
                    <button
                      onClick={() => setHours(prev => prev.map(h => h.day_of_week === row.day_of_week ? { ...h, is_open: !h.is_open } : h))}
                      className={`text-xs rounded-lg px-3 py-1.5 ${row.is_open ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}
                    >
                      {row.is_open ? 'Ανοιχτό' : 'Κλειστό'}
                    </button>
                  </div>
                  {row.is_open && (
                    <div className="flex gap-2">
                      <select value={row.open_time}
                        onChange={e => setHours(prev => prev.map(h => h.day_of_week === row.day_of_week ? { ...h, open_time: e.target.value } : h))}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                        {HOUR_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <span className="text-gray-400 flex items-center text-xs">έως</span>
                      <select value={row.close_time}
                        onChange={e => setHours(prev => prev.map(h => h.day_of_week === row.day_of_week ? { ...h, close_time: e.target.value } : h))}
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
                <input value={newStaffName} onChange={e => setNewStaffName(e.target.value)}
                  placeholder="Όνομα" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                <select value={newStaffRole} onChange={e => setNewStaffRole(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                  <option value="Τεχνικός">Τεχνικός</option>
                  <option value="Ταμίας">Ταμίας</option>
                  <option value="Διευθυντής">Διευθυντής</option>
                </select>
                <input value={newStaffPhone} onChange={e => setNewStaffPhone(e.target.value)}
                  placeholder="Τηλέφωνο" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm" />
                <button onClick={addStaff}
                  className="w-full bg-gray-900 text-white text-sm rounded-xl px-3 py-2.5">Προσθήκη</button>
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