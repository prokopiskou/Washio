'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronRight, Download, RefreshCw, Check, X, Power } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const ADMIN_EMAILS = ['withinsuccess@gmail.com', 'giwrgos2070@gmail.com']

const MONTHS_SHORT = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']

const statusColors: Record<string, string> = {
  completed: 'bg-green-50 text-green-600',
  confirmed: 'bg-blue-50 text-blue-600',
  pending: 'bg-amber-50 text-amber-600',
  cancelled: 'bg-red-50 text-red-500',
  no_show: 'bg-gray-50 text-gray-500',
}

const statusLabels: Record<string, string> = {
  completed: 'Ολοκληρώθηκε',
  confirmed: 'Επιβεβαιώθηκε',
  pending: 'Εκκρεμεί',
  cancelled: 'Ακυρώθηκε',
  no_show: 'Δεν εμφανίστηκε',
}

export default function AdminPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)
  const [authChecking, setAuthChecking] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings' | 'locations' | 'users' | 'applications' | 'financials' | 'addons' | 'payouts'>('overview')
  const [bookings, setBookings] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [applications, setApplications] = useState<any[]>([])
  const [addons, setAddons] = useState<any[]>([])
  const [payouts, setPayouts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newAddon, setNewAddon] = useState({ name: '', price: '' })
  const [addingAddon, setAddingAddon] = useState(false)
  const [payoutMonth, setPayoutMonth] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const [bookingFilter, setBookingFilter] = useState({ status: '', location: '', date: '' })
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [userBookings, setUserBookings] = useState<any[]>([])
  const [refundModal, setRefundModal] = useState<{ booking: any } | null>(null)
  const [refundType, setRefundType] = useState<'full' | 'partial'>('full')
  const [refundAmount, setRefundAmount] = useState('')
  const [refunding, setRefunding] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      const email = data.session?.user?.email
      if (!email || !ADMIN_EMAILS.includes(email)) { router.replace('/'); return }
      setAuthorized(true)
      setAuthChecking(false)
    }
    checkAuth()
  }, [])

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    setLoading(true)

    const [
      { data: bookingsData },
      { data: locationsData },
      { data: profilesData },
      { data: applicationsData },
      { data: addonsData },
      { data: payoutsData },
    ] = await Promise.all([
      supabase.from('bookings')
        .select('*, locations(name, city), services(name, price), profiles(full_name, phone, email)')
        .order('created_at', { ascending: false }).limit(200),
      supabase.from('locations_checklist').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('applications').select('*').order('created_at', { ascending: false }),
      supabase.from('addons').select('*').order('sort_order', { ascending: true }),
      supabase.from('payouts').select('*, locations(name)').order('created_at', { ascending: false }),
    ])

    setBookings(bookingsData || [])
    setLocations(locationsData || [])
    setUsers(profilesData || [])
    setApplications(applicationsData || [])
    setAddons(addonsData || [])
    setPayouts(payoutsData || [])
    setLoading(false)
  }, [])

  useEffect(() => { if (authorized) fetchData() }, [authorized])

  const totalRevenue = bookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0)
  const totalCommission = bookings.reduce((sum, b) => sum + Number(b.platform_fee || 0), 0)
  const completedBookings = bookings.filter(b => b.status === 'completed').length
  const confirmedBookings = bookings.filter(b => b.status === 'confirmed').length
  const pendingApplications = applications.filter(a => a.status === 'pending').length

  const monthlyRevenue = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - (5 - i))
    const month = d.getMonth()
    const year = d.getFullYear()
    const monthBookings = bookings.filter(b => {
      const bd = new Date(b.created_at)
      return bd.getMonth() === month && bd.getFullYear() === year
    })
    return {
      month: MONTHS_SHORT[month],
      revenue: monthBookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0),
      commission: monthBookings.reduce((sum, b) => sum + Number(b.platform_fee || 0), 0),
    }
  })

  const topLocations = locations.map(loc => ({
    ...loc,
    bookingCount: bookings.filter(b => b.locations?.name === loc.name).length,
    revenue: bookings.filter(b => b.locations?.name === loc.name).reduce((sum, b) => sum + Number(b.total_amount || 0), 0),
    commission: bookings.filter(b => b.locations?.name === loc.name).reduce((sum, b) => sum + Number(b.platform_fee || 0), 0),
  })).sort((a, b) => b.bookingCount - a.bookingCount)

  const filteredBookings = bookings.filter(b => {
    if (bookingFilter.status && b.status !== bookingFilter.status) return false
    if (bookingFilter.location && b.locations?.name !== bookingFilter.location) return false
    if (bookingFilter.date && b.slot_date !== bookingFilter.date) return false
    return true
  })

  // Payouts για επιλεγμένο μήνα
  const payoutData = locations.map(loc => {
    const [year, month] = payoutMonth.split('-').map(Number)
    const monthBookings = bookings.filter(b => {
      if (b.locations?.name !== loc.name) return false
      if (!b.slot_date) return false
      if (b.status === 'cancelled') return false
      const d = new Date(b.slot_date)
      return d.getFullYear() === year && d.getMonth() + 1 === month
    })
    const totalRevenue = monthBookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0)
    const commission = monthBookings.reduce((sum, b) => sum + Number(b.platform_fee || 0), 0)
    const owedAmount = totalRevenue - commission

    const existingPayout = payouts.find(p => p.location_id === loc.id && p.month === payoutMonth)

    return {
      ...loc,
      monthBookings: monthBookings.length,
      totalRevenue,
      commission,
      owedAmount,
      existingPayout,
    }
  }).filter(loc => loc.monthBookings > 0 || loc.existingPayout)

  const markAsPaid = async (locationId: string, amount: number, existingId?: string) => {
    const supabase = createClient()
    if (existingId) {
      await supabase.from('payouts').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', existingId)
    } else {
      await supabase.from('payouts').insert({
        location_id: locationId,
        amount,
        month: payoutMonth,
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
    }
    fetchData()
  }

  const markAsPending = async (existingId: string) => {
    const supabase = createClient()
    await supabase.from('payouts').update({ status: 'pending', paid_at: null }).eq('id', existingId)
    fetchData()
  }

  const updateLocationBankInfo = async (id: string, field: 'iban' | 'bank_name', value: string) => {
    const supabase = createClient()
    await supabase.from('locations').update({ [field]: value }).eq('id', id)
  }

  const getUserDisplay = (profile: any) => profile?.full_name || profile?.email || 'Επισκέπτης'
  const getUserInitial = (profile: any) => (profile?.full_name || profile?.email || '?').charAt(0).toUpperCase()

  const updateBookingStatus = async (id: string, status: string) => {
    const supabase = createClient()
    await supabase.from('bookings').update({ status }).eq('id', id)
    fetchData()
  }

  const handleCancelBooking = (booking: any) => {
    setRefundModal({ booking })
    setRefundType('full')
    setRefundAmount(String(booking.total_amount))
  }

  const confirmRefund = async () => {
    if (!refundModal) return
    const amount = refundType === 'full'
      ? Number(refundModal.booking.total_amount)
      : parseFloat(refundAmount)

    if (!amount || amount <= 0 || amount > Number(refundModal.booking.total_amount)) {
      alert('Μη έγκυρο ποσό επιστροφής')
      return
    }

    setRefunding(true)
    const res = await fetch('/api/bookings/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookingId: refundModal.booking.id,
        refundAmount: amount,
        isPartial: refundType === 'partial',
      }),
    })
    setRefunding(false)

    if (res.ok) {
      setRefundModal(null)
      fetchData()
    } else {
      alert('Σφάλμα ακύρωσης / επιστροφής')
    }
  }

  const toggleLocation = async (id: string, isActive: boolean) => {
    const supabase = createClient()
    await supabase.from('locations').update({ is_active: !isActive }).eq('id', id)
    fetchData()
  }

  const updateApplication = async (id: string, status: 'approved' | 'rejected' | 'pre_approved') => {
    const supabase = createClient()
    await supabase.from('applications').update({ status }).eq('id', id)

    const app = applications.find(a => a.id === id)

    if (status === 'pre_approved' && app?.email) {
      await fetch('/api/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'partner_preapproval',
          to: app.email,
          businessName: app.business_name,
        }),
      })
    }

    // Άμεση ενημέρωση local state χωρίς να περιμένει fetchData
    setApplications(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    fetchData()
  }

  const updateCommissionRate = async (id: string, rate: number) => {
    const supabase = createClient()
    await supabase.from('locations').update({ commission_rate: rate }).eq('id', id)
    fetchData()
  }

  const loadUserBookings = async (userId: string) => {
    const supabase = createClient()
    const { data } = await supabase.from('bookings').select('*, locations(name), services(name)')
      .eq('user_id', userId).order('created_at', { ascending: false })
    setUserBookings(data || [])
  }

  const handleAddAddon = async () => {
    if (!newAddon.name || !newAddon.price) return
    const supabase = createClient()
    await supabase.from('addons').insert({
      name: newAddon.name,
      price: parseFloat(newAddon.price),
      sort_order: addons.length + 1,
      is_active: true,
    })
    setNewAddon({ name: '', price: '' })
    setAddingAddon(false)
    fetchData()
  }

  const exportCSV = () => {
    const headers = ['Ref', 'Χρήστης', 'Email', 'Σημείο', 'Υπηρεσία', 'Ημερομηνία', 'Ώρα', 'Σύνολο', 'Προμήθεια', 'Status']
    const rows = filteredBookings.map(b => [
      b.booking_ref,
      b.profiles?.full_name || '',
      b.profiles?.email || '',
      b.locations?.name || '',
      b.services?.name || '',
      b.slot_date,
      b.slot_start_time?.slice(0, 5),
      b.total_amount,
      b.platform_fee,
      statusLabels[b.status] || b.status,
    ])
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `washio-bookings-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
  }

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number)
    return new Date(year, month - 1).toLocaleDateString('el-GR', { month: 'long', year: 'numeric' })
  }

  if (authChecking) return <div className="min-h-screen flex items-center justify-center"><p className="text-xs text-gray-400">Έλεγχος πρόσβασης...</p></div>
  if (!authorized) return null

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto pb-10">

        {/* Header */}
        <div className="bg-white px-6 pt-14 pb-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div className="w-[22px] h-[22px] rounded-[7px] bg-gray-900 flex items-center justify-center">
                  <div
                    className="w-1.5 h-1.5 bg-white"
                    style={{
                      borderRadius: '50% 50% 50% 0',
                      transform: 'rotate(-45deg)',
                    }}
                  />
                </div>
                <h1 className="text-[20px] font-bold tracking-tight text-gray-900">Washio Admin</h1>
              </div>
              <p className="text-[12px] text-gray-500 mt-1 capitalize">
                {new Date().toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={fetchData}
                className="w-9 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-500"
              >
                <RefreshCw size={14} />
              </button>
              <button
                onClick={() => router.push('/')}
                className="h-8 px-2.5 rounded-lg bg-white border border-gray-200 inline-flex items-center gap-1 text-[12px] font-semibold text-gray-900"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 6l-6 6 6 6"/></svg>
                App
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="sticky top-0 z-20 bg-white border-b border-gray-100 mt-3.5 px-6 py-3">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {[
              { key: 'overview', label: 'Overview' },
              { key: 'bookings', label: 'Κρατήσεις', count: bookings.length },
              { key: 'locations', label: 'Πρατήρια', count: locations.length },
              { key: 'users', label: 'Χρήστες', count: users.length },
              { key: 'applications', label: 'Αιτήσεις', count: pendingApplications, highlight: pendingApplications > 0 },
              { key: 'financials', label: 'Οικονομικά' },
              { key: 'payouts', label: 'Εκκαθαρίσεις' },
              { key: 'addons', label: 'Υπηρεσίες', count: addons.length },
            ].map((tab: any) => {
              const active = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as any)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold tracking-tight transition-all border ${
                    active
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-500 border-gray-200'
                  }`}
                >
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span
                      className="px-1.5 rounded-full text-[10px] font-bold"
                      style={{
                        background: active ? 'rgba(255,255,255,0.22)' : tab.highlight ? '#FEF6E6' : '#F7F7F7',
                        color: active ? '#fff' : tab.highlight ? '#8A6209' : '#666',
                      }}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="px-6 pt-5">
          {loading ? (
            <div className="text-center py-10"><p className="text-xs text-gray-400">Φόρτωση...</p></div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <div className="space-y-3">

                  {/* Dense 4-col stat grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
                    {[
                      { label: 'Έσοδα', value: `€${totalRevenue.toFixed(0)}` },
                      { label: 'Προμήθεια', value: `€${totalCommission.toFixed(0)}` },
                      { label: 'Επιβεβ.', value: confirmedBookings },
                      { label: 'Ολοκλ.', value: completedBookings },
                    ].map(s => (
                      <div key={s.label} className="bg-white rounded-[11px] p-2.5 border border-gray-100">
                        <p className="text-[9px] font-semibold tracking-[1.2px] uppercase text-gray-500 truncate">
                          {s.label}
                        </p>
                        <p className="text-[18px] font-bold tracking-tight text-gray-900 mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {s.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Chart card */}
                  <div className="bg-white rounded-[14px] border border-gray-100 p-4"
                       style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                    <div className="flex items-center justify-between mb-3.5">
                      <p className="text-[13px] font-semibold tracking-tight text-gray-900">
                        Έσοδα τελευταίων 6 μηνών
                      </p>
                      <div className="flex gap-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-sm bg-gray-900" />
                          <span className="text-[10px] font-medium text-gray-500">Έσοδα</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-sm bg-gray-300" />
                          <span className="text-[10px] font-medium text-gray-500">Προμήθεια</span>
                        </div>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={monthlyRevenue}>
                        <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#999' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#999' }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(value) => `€${value}`} cursor={{ fill: 'rgba(0,0,0,0.02)' }} />
                        <Bar dataKey="revenue" fill="#0A0A0A" radius={[2, 2, 0, 0]} name="Έσοδα" />
                        <Bar dataKey="commission" fill="#D1D5DB" radius={[2, 2, 0, 0]} name="Προμήθεια" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Recent bookings */}
                  <div className="bg-white rounded-[14px] border border-gray-100 overflow-hidden"
                       style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                    <div className="flex items-center justify-between px-3.5 pt-3.5 pb-2">
                      <p className="text-[13px] font-semibold tracking-tight text-gray-900">Πρόσφατες κρατήσεις</p>
                      <button onClick={() => setActiveTab('bookings')} className="text-[12px] font-medium text-blue-600">
                        Όλες →
                      </button>
                    </div>
                    {bookings.slice(0, 5).map((b, i) => {
                      const pill = statusColors[b.status]
                      return (
                        <div key={b.id} className={`px-3.5 py-3 flex items-center gap-2.5 ${i < 4 ? 'border-t border-gray-100' : 'border-t border-gray-100'}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-semibold text-gray-900 truncate">{getUserDisplay(b.profiles)}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                              {b.locations?.name} · {new Date(b.slot_date).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' })}
                            </p>
                          </div>
                          <p className="text-[13px] font-semibold text-gray-900 shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            €{Number(b.total_amount).toFixed(0)}
                          </p>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md shrink-0 ${pill || 'bg-gray-50 text-gray-500'}`}>
                            {statusLabels[b.status] || b.status}
                          </span>
                        </div>
                      )
                    })}
                    {bookings.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-6">Δεν υπάρχουν κρατήσεις</p>
                    )}
                  </div>

                  {/* Top locations */}
                  <div className="bg-white rounded-[14px] border border-gray-100 overflow-hidden"
                       style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                    <div className="px-3.5 pt-3.5 pb-2">
                      <p className="text-[13px] font-semibold tracking-tight text-gray-900">Top σημεία</p>
                    </div>
                    {topLocations.slice(0, 5).map((loc, i) => (
                      <div key={loc.id} className="px-3.5 py-2.5 flex items-center gap-3 border-t border-gray-100">
                        <span className="text-[11px] font-bold text-gray-400 w-3.5 shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-gray-900 truncate">{loc.name}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">{loc.bookingCount} κρατήσεις</p>
                        </div>
                        <p className="text-[13px] font-semibold text-gray-900 shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          €{loc.commission.toFixed(0)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'bookings' && (() => {
                const statusPillConfig = (status?: string) => {
                  if (status === 'pending') return { bg: '#FEF6E6', fg: '#8A6209', label: 'Εκκρεμεί' }
                  if (status === 'confirmed') return { bg: '#EAF2FD', fg: '#1A6FD4', label: 'Επιβεβ.' }
                  if (status === 'completed') return { bg: '#E7F6EF', fg: '#0F7A5C', label: 'Ολοκλ.' }
                  if (status === 'cancelled') return { bg: '#FCEAEA', fg: '#B43C3C', label: 'Ακυρ.' }
                  if (status === 'no_show') return { bg: '#F7F7F7', fg: '#666666', label: 'No-show' }
                  return { bg: '#F7F7F7', fg: '#666666', label: status || '—' }
                }

                return (
                  <div>
                    {/* Filters bar */}
                    <div className="bg-white rounded-[14px] border border-gray-100 p-3 mb-3.5"
                         style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                      <div className="flex gap-2 flex-wrap items-center">
                        <select
                          value={bookingFilter.status}
                          onChange={e => setBookingFilter(f => ({ ...f, status: e.target.value }))}
                          className="h-9 px-3 rounded-[9px] bg-white border border-gray-200 text-[12px] font-semibold text-gray-700 focus:outline-none focus:border-gray-400"
                        >
                          <option value="">Όλα τα status</option>
                          {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>

                        <select
                          value={bookingFilter.location}
                          onChange={e => setBookingFilter(f => ({ ...f, location: e.target.value }))}
                          className="h-9 px-3 rounded-[9px] bg-white border border-gray-200 text-[12px] font-semibold text-gray-700 focus:outline-none focus:border-gray-400"
                        >
                          <option value="">Όλα τα σημεία</option>
                          {locations.map(loc => <option key={loc.id} value={loc.name}>{loc.name}</option>)}
                        </select>

                        <input
                          type="date"
                          value={bookingFilter.date}
                          onChange={e => setBookingFilter(f => ({ ...f, date: e.target.value }))}
                          className="h-9 px-3 rounded-[9px] bg-white border border-gray-200 text-[12px] font-semibold text-gray-700 focus:outline-none focus:border-gray-400"
                        />

                        <button
                          onClick={exportCSV}
                          className="ml-auto h-9 px-3 rounded-[9px] bg-gray-900 text-white inline-flex items-center gap-1.5 text-[12px] font-semibold"
                        >
                          <Download size={12} />
                          Export CSV
                        </button>

                        {(bookingFilter.status || bookingFilter.location || bookingFilter.date) && (
                          <button
                            onClick={() => setBookingFilter({ status: '', location: '', date: '' })}
                            className="text-[11px] font-medium text-red-500"
                          >
                            Καθαρισμός
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Result count */}
                    <p className="text-[11px] font-semibold tracking-[1.6px] uppercase text-gray-500 mb-2.5">
                      {filteredBookings.length} αποτελέσματα
                    </p>

                    {/* Booking cards */}
                    <div className="space-y-2">
                      {filteredBookings.map(b => {
                        const pill = statusPillConfig(b.status)
                        const dateStr = b.slot_date
                          ? new Date(b.slot_date).toLocaleDateString('el-GR', { day: 'numeric', month: 'short', timeZone: 'Europe/Athens' })
                          : '—'

                        return (
                          <div
                            key={b.id}
                            className="bg-white rounded-[14px] border border-gray-100 p-3.5"
                            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <p
                                    className="text-[11px] font-bold text-gray-400 truncate"
                                    style={{ fontFamily: 'ui-monospace, "SF Mono", monospace', letterSpacing: '0.6px' }}
                                  >
                                    {b.booking_ref}
                                  </p>
                                  <span
                                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-tight shrink-0"
                                    style={{ background: pill.bg, color: pill.fg }}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: pill.fg }} />
                                    {pill.label}
                                  </span>
                                </div>
                                <p className="text-[14px] font-semibold tracking-tight text-gray-900 truncate">
                                  {getUserDisplay(b.profiles)}
                                </p>
                                <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                                  {b.locations?.name} · {b.services?.name}
                                </p>
                                <p className="text-[11px] text-gray-400 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {dateStr} · {b.slot_start_time?.slice(0, 5)}
                                </p>
                              </div>

                              <div className="flex flex-col items-end gap-1 shrink-0">
                                <p className="text-[16px] font-bold tracking-tight text-gray-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  €{Number(b.total_amount || 0).toFixed(0)}
                                </p>
                                <p className="text-[10px] text-gray-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  +€{Number(b.platform_fee || 0).toFixed(0)} fee
                                </p>

                                <div className="flex flex-col gap-1 mt-1">
                                  {b.status === 'pending' && (
                                    <button
                                      onClick={() => updateBookingStatus(b.id, 'confirmed')}
                                      className="px-2.5 py-1 rounded-lg text-[10px] font-semibold"
                                      style={{ background: '#EAF2FD', color: '#1A6FD4' }}
                                    >
                                      Confirm
                                    </button>
                                  )}
                                  {b.status === 'confirmed' && (
                                    <button
                                      onClick={() => updateBookingStatus(b.id, 'completed')}
                                      className="px-2.5 py-1 rounded-lg text-[10px] font-semibold"
                                      style={{ background: '#E7F6EF', color: '#0F7A5C' }}
                                    >
                                      Complete
                                    </button>
                                  )}
                                  {b.status !== 'cancelled' && b.status !== 'completed' && (
                                    <button
                                      onClick={() => handleCancelBooking(b)}
                                      className="px-2.5 py-1 rounded-lg text-[10px] font-semibold"
                                      style={{ background: '#FCEAEA', color: '#B43C3C' }}
                                    >
                                      Refund
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}

                      {filteredBookings.length === 0 && (
                        <div className="flex flex-col items-center text-center pt-12">
                          <div
                            className="w-16 h-16 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-gray-400 mb-4"
                            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
                          >
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                              <path d="M3 13l3-8h12l3 8M3 13v6a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6M3 13h5l1 3h6l1-3h5"/>
                            </svg>
                          </div>
                          <p className="text-[15px] font-semibold tracking-tight text-gray-900">
                            Δεν υπάρχουν κρατήσεις
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              {activeTab === 'locations' && (
                <div>
                  <div className="flex justify-end mb-4">
                    <button onClick={() => router.push('/admin/locations/new')}
                      className="text-xs bg-gray-900 text-white px-4 py-2 rounded-xl">+ Νέο σημείο</button>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    {locations.map((loc, i) => (
                      <div key={loc.id} className={`px-4 py-3 ${i < locations.length - 1 ? 'border-b border-gray-50' : ''}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-sm">⛽</div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{loc.name}</p>
                              <p className="text-xs text-gray-400">{loc.city} · {loc.address}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-gray-400">Commission:</span>
                                <input type="number" defaultValue={loc.commission_rate}
                                  onBlur={e => updateCommissionRate(loc.id, parseFloat(e.target.value))}
                                  className="w-14 text-xs border border-gray-200 rounded px-1 py-0.5 text-gray-700" />
                                <span className="text-xs text-gray-400">%</span>
                              </div>
                              <div className="flex gap-1.5 mt-2 flex-wrap">
                                {[
                                  { label: 'Ωράριο', done: loc.has_hours },
                                  { label: 'Υπηρεσίες', done: loc.has_services },
                                  { label: 'IBAN', done: !!loc.iban },
                                  { label: 'Έγγραφα', done: loc.has_documents },
                                ].map(item => (
                                  <span key={item.label} className={`text-xs px-2 py-0.5 rounded-md ${
                                    item.done ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'
                                  }`}>
                                    {item.done ? '✓' : '·'} {item.label}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-xs px-2 py-0.5 rounded-lg ${loc.is_active ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                              {loc.is_active ? 'Ενεργό' : 'Ανενεργό'}
                            </span>
                            <button onClick={() => toggleLocation(loc.id, loc.is_active)}
                              className="p-1.5 border border-gray-200 rounded-lg text-gray-500"><Power size={12} /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {locations.length === 0 && <p className="text-xs text-gray-400 text-center py-8">Δεν υπάρχουν σημεία</p>}
                  </div>
                </div>
              )}

              {activeTab === 'users' && (() => {
                const statusPillConfig = (status?: string) => {
                  if (status === 'pending') return { bg: '#FEF6E6', fg: '#8A6209', label: 'Εκκρεμεί' }
                  if (status === 'confirmed') return { bg: '#EAF2FD', fg: '#1A6FD4', label: 'Επιβεβ.' }
                  if (status === 'completed') return { bg: '#E7F6EF', fg: '#0F7A5C', label: 'Ολοκλ.' }
                  if (status === 'cancelled') return { bg: '#FCEAEA', fg: '#B43C3C', label: 'Ακυρ.' }
                  return { bg: '#F7F7F7', fg: '#666666', label: status || '—' }
                }

                return (
                  <div className="grid md:grid-cols-2 gap-3">

                    {/* Users list */}
                    <div>
                      <p className="text-[11px] font-semibold tracking-[1.6px] uppercase text-gray-500 mb-2.5">
                        {users.length} χρήστες
                      </p>

                      <div className="bg-white rounded-[14px] border border-gray-100 overflow-hidden"
                           style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                        {users.map((u, i) => {
                          const userBookingCount = bookings.filter(b => b.user_id === u.id).length
                          const isSelected = selectedUser?.id === u.id

                          return (
                            <button
                              key={u.id}
                              onClick={async () => { setSelectedUser(u); await loadUserBookings(u.id) }}
                              className={`w-full px-3.5 py-3 flex items-center gap-3 text-left transition-colors ${i < users.length - 1 ? 'border-b border-gray-100' : ''} ${isSelected ? 'bg-gray-50' : ''}`}
                            >
                              <div className="w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center text-[14px] font-semibold tracking-tight shrink-0">
                                {getUserInitial(u)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[14px] font-semibold tracking-tight text-gray-900 truncate">
                                  {u.full_name || u.email || 'Χωρίς όνομα'}
                                </p>
                                <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                                  {u.email || u.phone || '—'}
                                </p>
                              </div>
                              {userBookingCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 text-[10px] font-bold shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {userBookingCount}
                                </span>
                              )}
                              <ChevronRight size={14} className="text-gray-300 shrink-0" />
                            </button>
                          )
                        })}

                        {users.length === 0 && (
                          <p className="text-[13px] text-gray-400 text-center py-8">Δεν υπάρχουν χρήστες</p>
                        )}
                      </div>
                    </div>

                    {/* Selected user detail */}
                    {selectedUser && (
                      <div>
                        <p className="text-[11px] font-semibold tracking-[1.6px] uppercase text-gray-500 mb-2.5">
                          Στοιχεία χρήστη
                        </p>

                        <div className="bg-white rounded-[14px] border border-gray-100 overflow-hidden"
                             style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>

                          <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center text-[16px] font-semibold tracking-tight shrink-0">
                              {getUserInitial(selectedUser)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[15px] font-semibold tracking-tight text-gray-900 truncate">
                                {selectedUser.full_name || selectedUser.email || 'Χρήστης'}
                              </p>
                              <p className="text-[11px] text-gray-400 mt-0.5">
                                Εγγραφή: {new Date(selectedUser.created_at).toLocaleDateString('el-GR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Athens' })}
                              </p>
                            </div>
                            <button
                              onClick={() => setSelectedUser(null)}
                              className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-500 shrink-0"
                            >
                              <X size={14} />
                            </button>
                          </div>

                          <div className="px-4 py-3 border-b border-gray-100 space-y-2">
                            <div className="flex items-start gap-2.5">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.7" strokeLinecap="round" className="mt-0.5 shrink-0">
                                <rect x="3" y="5" width="18" height="14" rx="2"/>
                                <path d="M3 7l9 6 9-6"/>
                              </svg>
                              <p className="text-[12px] text-gray-700 break-all">
                                {selectedUser.email || '—'}
                              </p>
                            </div>
                            <div className="flex items-center gap-2.5">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="1.7" strokeLinecap="round" className="shrink-0">
                                <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1"/>
                              </svg>
                              <p className="text-[12px] text-gray-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {selectedUser.phone || '—'}
                              </p>
                            </div>
                          </div>

                          <div className="px-4 pt-3 pb-2 flex items-baseline justify-between">
                            <p className="text-[11px] font-semibold tracking-[1.6px] uppercase text-gray-500">
                              Κρατήσεις
                            </p>
                            <span className="text-[11px] font-bold text-gray-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {userBookings.length}
                            </span>
                          </div>

                          <div className="px-2 pb-2">
                            {userBookings.map((b, i) => {
                              const pill = statusPillConfig(b.status)
                              const dateStr = b.slot_date
                                ? new Date(b.slot_date).toLocaleDateString('el-GR', { day: 'numeric', month: 'short', timeZone: 'Europe/Athens' })
                                : '—'

                              return (
                                <div
                                  key={b.id}
                                  className={`px-2.5 py-2.5 flex items-center gap-2.5 ${i < userBookings.length - 1 ? 'border-b border-gray-50' : ''}`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-semibold text-gray-900 truncate">
                                      {(b.locations as any)?.name}
                                    </p>
                                    <p className="text-[11px] text-gray-400 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                      {dateStr} · {b.slot_start_time?.slice(0, 5)}
                                    </p>
                                  </div>
                                  <p className="text-[13px] font-bold text-gray-900 shrink-0" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    €{Number(b.total_amount || 0).toFixed(0)}
                                  </p>
                                  <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold shrink-0"
                                    style={{ background: pill.bg, color: pill.fg }}
                                  >
                                    <span className="w-1 h-1 rounded-full" style={{ background: pill.fg }} />
                                    {pill.label}
                                  </span>
                                </div>
                              )
                            })}
                            {userBookings.length === 0 && (
                              <p className="text-[12px] text-gray-400 text-center py-4">Δεν υπάρχουν κρατήσεις</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {!selectedUser && (
                      <div className="hidden md:flex flex-col items-center justify-center bg-white rounded-[14px] border border-gray-100 py-16 text-center"
                           style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                        <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 mb-3">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <circle cx="12" cy="8" r="4"/>
                            <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>
                          </svg>
                        </div>
                        <p className="text-[13px] text-gray-400">Επίλεξε χρήστη για λεπτομέρειες</p>
                      </div>
                    )}
                  </div>
                )
              })()}

              {activeTab === 'applications' && (() => {
                const pendingCount = applications.filter(a => a.status === 'pending').length
                const preApprovedCount = applications.filter(a => a.status === 'pre_approved').length

                return (
                  <div className="space-y-2.5">
                    <p className="text-[11px] font-semibold tracking-[1.6px] uppercase text-gray-500 py-1">
                      {pendingCount} εκκρεμείς · {preApprovedCount} σε εξέλιξη
                    </p>

                    {applications.map(app => {
                      const isPending = app.status === 'pending'
                      const isPreApproved = app.status === 'pre_approved'
                      const isApproved = app.status === 'approved'
                      const isRejected = app.status === 'rejected'

                      return (
                        <div
                          key={app.id}
                          className="bg-white rounded-[14px] border border-gray-100 p-3.5"
                          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
                        >
                          {/* Top section */}
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] font-semibold tracking-tight text-gray-900">
                                {app.business_name}
                              </p>
                              <p className="text-[12px] text-gray-500 mt-0.5">{app.owner_name}</p>
                              <p className="text-[12px] text-gray-500 mt-1">{app.address}, {app.city}</p>
                              <p className="text-[11px] text-gray-400 mt-1">{app.phone} · {app.email}</p>

                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {app.hours && (
                                  <span className="px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 text-[11px] font-medium">
                                    {app.hours}
                                  </span>
                                )}
                                {app.lanes && (
                                  <span className="px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 text-[11px] font-medium">
                                    {app.lanes} λάντζες
                                  </span>
                                )}
                                {app.wash_type && (
                                  <span className="px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 text-[11px] font-medium">
                                    {app.wash_type}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Right column — status + actions */}
                            <div className="flex flex-col items-end gap-1.5 shrink-0">
                              {isPending && (
                                <span
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-semibold"
                                  style={{ background: '#FEF6E6', color: '#8A6209' }}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#F59E0B' }} />
                                  Εκκρεμεί
                                </span>
                              )}
                              {isPreApproved && (
                                <span
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-semibold"
                                  style={{ background: '#EAF2FD', color: '#1A6FD4' }}
                                >
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#1A6FD4' }} />
                                  Προεγγραφή
                                </span>
                              )}
                              {isApproved && (
                                <span
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-semibold"
                                  style={{ background: '#E7F6EF', color: '#0F7A5C' }}
                                >
                                  <Check size={10} strokeWidth={2.6} />
                                  Εγκρίθηκε
                                </span>
                              )}
                              {isRejected && (
                                <span
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px] font-semibold"
                                  style={{ background: '#FCEAEA', color: '#B43C3C' }}
                                >
                                  Απορρίφθηκε
                                </span>
                              )}

                              {isPending && (
                                <>
                                  <button
                                    onClick={() => updateApplication(app.id, 'pre_approved')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold"
                                    style={{ background: '#EAF2FD', color: '#1A6FD4' }}
                                  >
                                    Προεγγραφή
                                    <Check size={11} strokeWidth={2.2} />
                                  </button>
                                  <button
                                    onClick={() => updateApplication(app.id, 'rejected')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold"
                                    style={{ background: '#FCEAEA', color: '#B43C3C' }}
                                  >
                                    Απόρριψη
                                    <X size={11} strokeWidth={2.2} />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Pre-approved expansion */}
                          {isPreApproved && (
                            <>
                              <div className="h-px bg-gray-100 my-3.5" />

                              <p className="text-[11px] font-semibold tracking-[1.4px] uppercase text-gray-500 mb-2.5">
                                Στοιχεία εγγραφής
                              </p>

                              <div className="space-y-2">
                                <div>
                                  <p className="text-[10px] font-semibold tracking-[1.2px] uppercase text-gray-400 mb-1">
                                    ΑΦΜ
                                  </p>
                                  <input
                                    defaultValue={app.afm || ''}
                                    placeholder="000000000"
                                    onBlur={async e => {
                                      const supabase = createClient()
                                      const v = e.target.value
                                      await supabase.from('applications').update({ afm: v }).eq('id', app.id)
                                      setApplications(prev => prev.map(a => a.id === app.id ? { ...a, afm: v } : a))
                                    }}
                                    className="w-full h-10 px-3 rounded-lg bg-white border border-gray-200 text-[13px] font-semibold text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                                    style={{ fontVariantNumeric: 'tabular-nums' }}
                                  />
                                </div>

                                <div className="flex gap-2">
                                  <div className="flex-[2]">
                                    <p className="text-[10px] font-semibold tracking-[1.2px] uppercase text-gray-400 mb-1">
                                      IBAN
                                    </p>
                                    <input
                                      defaultValue={app.iban || ''}
                                      placeholder="GR00 0000 0000..."
                                      onBlur={async e => {
                                        const supabase = createClient()
                                        const v = e.target.value
                                        await supabase.from('applications').update({ iban: v }).eq('id', app.id)
                                        setApplications(prev => prev.map(a => a.id === app.id ? { ...a, iban: v } : a))
                                      }}
                                      className="w-full h-10 px-3 rounded-lg bg-white border border-gray-200 text-[13px] font-semibold text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                                      style={{
                                        fontFamily: 'ui-monospace, "SF Mono", monospace',
                                        letterSpacing: '0.4px',
                                      }}
                                    />
                                  </div>
                                  <div className="flex-1">
                                    <p className="text-[10px] font-semibold tracking-[1.2px] uppercase text-gray-400 mb-1">
                                      Τράπεζα
                                    </p>
                                    <input
                                      defaultValue={app.bank_name || ''}
                                      placeholder="NBG"
                                      onBlur={async e => {
                                        const supabase = createClient()
                                        const v = e.target.value
                                        await supabase.from('applications').update({ bank_name: v }).eq('id', app.id)
                                        setApplications(prev => prev.map(a => a.id === app.id ? { ...a, bank_name: v } : a))
                                      }}
                                      className="w-full h-10 px-3 rounded-lg bg-white border border-gray-200 text-[13px] font-semibold text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                                    />
                                  </div>
                                </div>
                              </div>

                              <p className="text-[11px] font-semibold tracking-[1.4px] uppercase text-gray-500 mt-3.5 mb-1">
                                Έγγραφα
                              </p>

                              <div>
                                {([
                                  { key: 'doc_afm_url' as const, label: 'ΑΦΜ' },
                                  { key: 'doc_declaration_url' as const, label: 'Υπ. Δήλωση' },
                                  { key: 'doc_agreement_url' as const, label: 'Συμφωνητικό' },
                                ]).map((doc, idx, arr) => {
                                  const uploaded = !!app[doc.key]
                                  const isLast = idx === arr.length - 1
                                  return (
                                    <div
                                      key={doc.key}
                                      className={`flex items-center gap-2.5 py-2.5 ${isLast ? '' : 'border-b border-gray-100'}`}
                                    >
                                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                                        <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                                        <path d="M14 3v6h6"/>
                                      </svg>
                                      <p className="flex-1 text-[13px] font-medium text-gray-900">{doc.label}</p>

                                      {uploaded ? (
                                        <div className="flex items-center gap-2">
                                          <a
                                            href={app[doc.key]}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[12px] font-medium text-blue-600 underline underline-offset-[2px]"
                                          >
                                            Προβολή PDF
                                          </a>
                                          <label className="text-[11px] text-gray-400 cursor-pointer">
                                            · Αντικατάσταση
                                            <input
                                              type="file"
                                              accept=".pdf"
                                              className="hidden"
                                              onChange={async e => {
                                                const file = e.target.files?.[0]
                                                if (!file) return
                                                const supabase = createClient()
                                                const path = `${app.id}/${doc.key}-${Date.now()}.pdf`
                                                await supabase.storage.from('location-docs').upload(path, file, { upsert: true })
                                                const { data: urlData } = supabase.storage.from('location-docs').getPublicUrl(path)
                                                await supabase.from('applications').update({ [doc.key]: urlData.publicUrl }).eq('id', app.id)
                                                setApplications(prev => prev.map(a => a.id === app.id ? { ...a, [doc.key]: urlData.publicUrl } : a))
                                                await fetchData()
                                              }}
                                            />
                                          </label>
                                          <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                                            <Check size={10} className="text-white" strokeWidth={3} />
                                          </div>
                                        </div>
                                      ) : (
                                        <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-gray-300 text-gray-500 text-[11px] font-semibold cursor-pointer">
                                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3M7 9l5-5 5 5M12 4v12"/>
                                          </svg>
                                          Ανέβασμα PDF
                                          <input
                                            type="file"
                                            accept=".pdf"
                                            className="hidden"
                                            onChange={async e => {
                                              const file = e.target.files?.[0]
                                              if (!file) return
                                              const supabase = createClient()
                                              const path = `${app.id}/${doc.key}-${Date.now()}.pdf`
                                              await supabase.storage.from('location-docs').upload(path, file, { upsert: true })
                                              const { data: urlData } = supabase.storage.from('location-docs').getPublicUrl(path)
                                              await supabase.from('applications').update({ [doc.key]: urlData.publicUrl }).eq('id', app.id)
                                              setApplications(prev => prev.map(a => a.id === app.id ? { ...a, [doc.key]: urlData.publicUrl } : a))
                                              await fetchData()
                                            }}
                                          />
                                        </label>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>

                              {(() => {
                                const allDone = !!(app.afm && app.iban && app.doc_afm_url && app.doc_declaration_url && app.doc_agreement_url)
                                return (
                                  <div className="mt-4">
                                    <button
                                      type="button"
                                      disabled={!allDone}
                                      onClick={() => updateApplication(app.id, 'approved')}
                                      className={`w-full h-[46px] rounded-[11px] text-[13px] font-semibold tracking-tight flex items-center justify-center gap-1.5 transition-all ${
                                        allDone
                                          ? 'bg-gray-900 text-white'
                                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                      }`}
                                    >
                                      {allDone && <Check size={14} strokeWidth={2.2} />}
                                      Τελική Έγκριση & Ενεργοποίηση
                                    </button>
                                    {!allDone && (
                                      <p className="text-[11px] text-gray-400 text-center mt-1.5">
                                        Συμπλήρωσε όλα τα πεδία
                                      </p>
                                    )}
                                  </div>
                                )
                              })()}
                            </>
                          )}
                        </div>
                      )
                    })}

                    {applications.length === 0 && (
                      <div className="flex flex-col items-center text-center pt-12">
                        <div
                          className="w-16 h-16 rounded-2xl bg-white border border-gray-100 flex items-center justify-center text-gray-400 mb-4"
                          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
                        >
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
                            <path d="M14 3v6h6"/>
                          </svg>
                        </div>
                        <p className="text-[15px] font-semibold tracking-tight text-gray-900">
                          Δεν υπάρχουν αιτήσεις
                        </p>
                      </div>
                    )}
                  </div>
                )
              })()}

              {activeTab === 'financials' && (
                <div>
                  <div className="flex justify-end mb-4">
                    <button onClick={exportCSV}
                      className="flex items-center gap-1.5 bg-gray-900 text-white text-xs px-4 py-2 rounded-xl">
                      <Download size={12} /> Export CSV
                    </button>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
                    <p className="text-sm font-medium text-gray-900 mb-4">Μηνιαία ανάλυση</p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={monthlyRevenue}>
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip formatter={(value) => `€${value}`} />
                        <Bar dataKey="revenue" fill="#0A0A0A" radius={[4, 4, 0, 0]} name="Έσοδα σημείων" />
                        <Bar dataKey="commission" fill="#6B7280" radius={[4, 4, 0, 0]} name="Προμήθεια Washio" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-50">
                      <p className="text-sm font-medium text-gray-900">Ανά σημείο</p>
                    </div>
                    {topLocations.map((loc, i) => (
                      <div key={loc.id} className={`px-4 py-3 ${i < topLocations.length - 1 ? 'border-b border-gray-50' : ''}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-900">{loc.name}</p>
                            <p className="text-xs text-gray-400">{loc.bookingCount} κρατήσεις · {loc.commission_rate}% commission</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-900">€{loc.commission.toFixed(0)}</p>
                            <p className="text-xs text-gray-400">από €{loc.revenue.toFixed(0)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                    {topLocations.length === 0 && <p className="text-xs text-gray-400 text-center py-8">Δεν υπάρχουν δεδομένα</p>}
                  </div>
                </div>
              )}

              {activeTab === 'payouts' && (
                <div>
                  {/* Month picker */}
                  <div className="flex items-center gap-2.5 mb-3.5">
                    <p className="text-[11px] font-semibold tracking-[1.4px] uppercase text-gray-500">
                      Μήνας
                    </p>
                    <div className="flex-1 h-9 px-3.5 rounded-[9px] bg-white border border-gray-200 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.75" strokeLinecap="round">
                          <rect x="4" y="5" width="16" height="16" rx="2"/>
                          <path d="M4 10h16M9 3v4M15 3v4"/>
                        </svg>
                        <input
                          type="month"
                          value={payoutMonth}
                          onChange={e => setPayoutMonth(e.target.value)}
                          className="text-[13px] font-semibold text-gray-900 bg-transparent focus:outline-none flex-1"
                        />
                      </div>
                      <span className="text-[11px] text-gray-400 capitalize">{formatMonth(payoutMonth)}</span>
                    </div>
                  </div>

                  {/* Summary — dense 3-col */}
                  <div className="grid grid-cols-3 gap-1.5 mb-3.5">
                    {[
                      { label: 'Έσοδα', value: `€${payoutData.reduce((s, l) => s + l.totalRevenue, 0).toFixed(0)}` },
                      { label: 'Προμήθεια', value: `€${payoutData.reduce((s, l) => s + l.commission, 0).toFixed(0)}` },
                      { label: 'Οφείλεται', value: `€${payoutData.reduce((s, l) => s + (l.existingPayout?.status === 'paid' ? 0 : l.owedAmount), 0).toFixed(0)}` },
                    ].map(s => (
                      <div key={s.label} className="bg-white rounded-[11px] p-2.5 border border-gray-100">
                        <p className="text-[9px] font-semibold tracking-[1.2px] uppercase text-gray-500 truncate">
                          {s.label}
                        </p>
                        <p className="text-[18px] font-bold tracking-tight text-gray-900 mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {s.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Locations list */}
                  <div className="space-y-2.5">
                    {payoutData.length === 0 && (
                      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center"
                           style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                        <p className="text-[14px] text-gray-400">Δεν υπάρχουν κρατήσεις για αυτό τον μήνα</p>
                      </div>
                    )}

                    {payoutData.map(loc => {
                      const isPaid = loc.existingPayout?.status === 'paid'
                      return (
                        <div
                          key={loc.id}
                          className="bg-white rounded-[14px] border border-gray-100 p-3.5"
                          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}
                        >
                          {/* Top row — name + status */}
                          <div className="flex items-start justify-between gap-2.5">
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] font-semibold tracking-tight text-gray-900 truncate">
                                {loc.name}
                              </p>
                              <p className="text-[11px] text-gray-400 mt-0.5">{loc.city}</p>
                            </div>
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold tracking-tight shrink-0"
                              style={{
                                background: isPaid ? '#E7F6EF' : '#FEF6E6',
                                color: isPaid ? '#0F7A5C' : '#8A6209',
                              }}
                            >
                              {isPaid && <Check size={10} strokeWidth={2.6} />}
                              {!isPaid && <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#F59E0B' }} />}
                              {isPaid ? 'Πληρώθηκε' : 'Εκκρεμεί'}
                            </span>
                          </div>

                          {/* Stats — 3-col mini cards */}
                          <div className="grid grid-cols-3 gap-2 mt-3">
                            {[
                              { label: 'Κρατήσεις', value: loc.monthBookings },
                              { label: 'Έσοδα', value: `€${loc.totalRevenue.toFixed(0)}` },
                              { label: 'Να αποδοθεί', value: `€${loc.owedAmount.toFixed(0)}` },
                            ].map(s => (
                              <div key={s.label} className="bg-gray-50 rounded-[9px] px-2.5 py-2">
                                <p className="text-[9px] font-semibold tracking-[1.2px] uppercase text-gray-500 truncate">
                                  {s.label}
                                </p>
                                <p className="text-[14px] font-bold tracking-tight text-gray-900 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {s.value}
                                </p>
                              </div>
                            ))}
                          </div>

                          {/* IBAN + Bank */}
                          <div className="flex gap-2 mt-3">
                            <div className="flex-[2]">
                              <p className="text-[10px] font-semibold tracking-[1.2px] uppercase text-gray-400 mb-1">
                                IBAN
                              </p>
                              <input
                                defaultValue={loc.iban || ''}
                                onBlur={e => updateLocationBankInfo(loc.id, 'iban', e.target.value)}
                                placeholder="GR00 0000 0000..."
                                className="w-full h-10 px-3 rounded-[9px] bg-white border border-gray-200 text-[13px] font-semibold text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                                style={{
                                  fontFamily: 'ui-monospace, "SF Mono", monospace',
                                  letterSpacing: '0.4px',
                                }}
                              />
                            </div>
                            <div className="flex-1">
                              <p className="text-[10px] font-semibold tracking-[1.2px] uppercase text-gray-400 mb-1">
                                Τράπεζα
                              </p>
                              <input
                                defaultValue={loc.bank_name || ''}
                                onBlur={e => updateLocationBankInfo(loc.id, 'bank_name', e.target.value)}
                                placeholder="NBG"
                                className="w-full h-10 px-3 rounded-[9px] bg-white border border-gray-200 text-[13px] font-semibold text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                              />
                            </div>
                          </div>

                          {/* Footer — paid info or action button */}
                          {isPaid ? (
                            <div className="mt-3 px-3 py-2.5 bg-gray-50 rounded-[9px] flex items-center justify-between">
                              <p className="text-[12px] text-gray-500">
                                Πληρώθηκε: {loc.existingPayout?.paid_at
                                  ? new Date(loc.existingPayout.paid_at).toLocaleDateString('el-GR', { day: 'numeric', month: 'long', timeZone: 'Europe/Athens' })
                                  : '—'}
                              </p>
                              <button
                                onClick={() => markAsPending(loc.existingPayout.id)}
                                className="text-[11px] font-medium text-red-500 underline underline-offset-[2px]"
                              >
                                Αναίρεση
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => markAsPaid(loc.id, loc.owedAmount, loc.existingPayout?.id)}
                              className="w-full h-11 mt-3 rounded-[10px] bg-gray-900 text-white text-[13px] font-semibold tracking-tight"
                            >
                              Σήμανση ως Πληρωμένο — €{loc.owedAmount.toFixed(0)}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {activeTab === 'addons' && (
                <div>
                  <div className="flex justify-end mb-4">
                    <button onClick={() => setAddingAddon(v => !v)}
                      className="text-xs bg-gray-900 text-white px-4 py-2 rounded-xl">+ Νέα υπηρεσία</button>
                  </div>

                  {addingAddon && (
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 flex gap-2">
                      <input value={newAddon.name} onChange={e => setNewAddon(n => ({ ...n, name: e.target.value }))}
                        placeholder="Όνομα υπηρεσίας"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
                      <input value={newAddon.price} onChange={e => setNewAddon(n => ({ ...n, price: e.target.value }))}
                        placeholder="€" type="number"
                        className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400" />
                      <button onClick={handleAddAddon} className="bg-gray-900 text-white text-xs px-3 py-2 rounded-lg">Αποθήκευση</button>
                      <button onClick={() => { setAddingAddon(false); setNewAddon({ name: '', price: '' }) }} className="text-gray-400 px-2"><X size={14} /></button>
                    </div>
                  )}

                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">Global Υπηρεσίες</p>
                      <span className="text-xs text-gray-400">{addons.length} σύνολο</span>
                    </div>
                    {addons.map((addon, i) => (
                      <div key={addon.id} className={`px-4 py-3 flex items-center justify-between ${i < addons.length - 1 ? 'border-b border-gray-50' : ''}`}>
                        <p className="text-sm text-gray-900 flex-1">{addon.name}</p>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={async () => { const supabase = createClient(); await supabase.from('addons').update({ is_active: !addon.is_active }).eq('id', addon.id); fetchData() }}
                            className={`text-xs px-2 py-1 rounded-lg ${addon.is_active ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                            {addon.is_active ? 'Ενεργό' : 'Ανενεργό'}
                          </button>
                          <button onClick={async () => { if (!confirm('Διαγραφή υπηρεσίας;')) return; const supabase = createClient(); await supabase.from('addons').delete().eq('id', addon.id); fetchData() }}
                            className="text-xs text-red-400 px-1"><X size={12} /></button>
                        </div>
                      </div>
                    ))}
                    {addons.length === 0 && <p className="text-xs text-gray-400 text-center py-8">Δεν υπάρχουν υπηρεσίες</p>}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Refund modal */}
      {refundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !refunding && setRefundModal(null)} />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-md z-10">
            <div className="mb-5">
              <p className="text-base font-semibold text-gray-900 mb-1">Επιστροφή χρημάτων</p>
              <p className="text-xs text-gray-400">
                {refundModal.booking.booking_ref} · €{Number(refundModal.booking.total_amount).toFixed(0)}
              </p>
            </div>

            <div className="flex gap-2 mb-4">
              <button onClick={() => { setRefundType('full'); setRefundAmount(String(refundModal.booking.total_amount)) }}
                className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-all ${
                  refundType === 'full' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'
                }`}>
                Συνολικό
              </button>
              <button onClick={() => { setRefundType('partial'); setRefundAmount('') }}
                className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-all ${
                  refundType === 'partial' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'
                }`}>
                Μερικό
              </button>
            </div>

            <div className="mb-5">
              <p className="text-xs text-gray-400 mb-1.5">Ποσό επιστροφής</p>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                <input
                  type="number"
                  value={refundAmount}
                  onChange={e => setRefundAmount(e.target.value)}
                  disabled={refundType === 'full'}
                  min="0"
                  max={refundModal.booking.total_amount}
                  step="0.01"
                  className="w-full border border-gray-200 rounded-xl pl-8 pr-4 py-3 text-sm focus:outline-none focus:border-gray-400 disabled:bg-gray-50"
                />
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                Μέγιστο: €{Number(refundModal.booking.total_amount).toFixed(2)}
              </p>
            </div>

            <div className="bg-amber-50 rounded-xl p-3 mb-5">
              <p className="text-xs text-amber-800 leading-relaxed">
                ⚠️ Η κράτηση θα ακυρωθεί και το ποσό θα επιστραφεί αυτόματα στην κάρτα μέσω Stripe (5-7 εργάσιμες ημέρες).
              </p>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setRefundModal(null)} disabled={refunding}
                className="flex-1 border border-gray-200 text-gray-600 text-sm font-medium py-3 rounded-xl">
                Άκυρο
              </button>
              <button onClick={confirmRefund} disabled={refunding}
                className="flex-1 bg-red-500 text-white text-sm font-medium py-3 rounded-xl disabled:opacity-40">
                {refunding ? 'Επιστροφή...' : 'Επιστροφή & Ακύρωση'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}