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

        <div className="bg-white border-b border-gray-100 px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Washio Admin</h1>
              <p className="text-xs text-gray-400">{new Date().toLocaleDateString('el-GR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={fetchData} className="p-2 text-gray-400 hover:text-gray-600"><RefreshCw size={16} /></button>
              <button onClick={() => router.push('/')} className="text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-full">← App</button>
            </div>
          </div>

          <div className="flex gap-1 overflow-x-auto">
            {[
              { key: 'overview', label: 'Overview' },
              { key: 'bookings', label: `Κρατήσεις (${bookings.length})` },
              { key: 'locations', label: `Πρατήρια (${locations.length})` },
              { key: 'users', label: `Χρήστες (${users.length})` },
              { key: 'applications', label: `Αιτήσεις${pendingApplications > 0 ? ` (${pendingApplications})` : ''}` },
              { key: 'financials', label: 'Οικονομικά' },
              { key: 'payouts', label: 'Εκκαθαρίσεις' },
              { key: 'addons', label: `Υπηρεσίες (${addons.length})` },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.key ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 pt-5">
          {loading ? (
            <div className="text-center py-10"><p className="text-xs text-gray-400">Φόρτωση...</p></div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    {[
                      { label: 'Συνολικά Έσοδα', value: `€${totalRevenue.toFixed(0)}` },
                      { label: 'Προμήθειες Washio', value: `€${totalCommission.toFixed(0)}` },
                      { label: 'Επιβεβαιωμένες', value: confirmedBookings },
                      { label: 'Ολοκληρωμένες', value: completedBookings },
                    ].map(s => (
                      <div key={s.label} className="bg-white rounded-2xl p-4 border border-gray-100">
                        <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                        <p className="text-2xl font-semibold text-gray-900">{s.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
                    <p className="text-sm font-medium text-gray-900 mb-4">Έσοδα τελευταίων 6 μηνών</p>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={monthlyRevenue}>
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="revenue" fill="#0A0A0A" radius={[4, 4, 0, 0]} name="Έσοδα" />
                        <Bar dataKey="commission" fill="#D1D5DB" radius={[4, 4, 0, 0]} name="Προμήθεια" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-4">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                      <p className="text-sm font-medium text-gray-900">Πρόσφατες κρατήσεις</p>
                      <button onClick={() => setActiveTab('bookings')} className="text-xs text-blue-500">Όλες →</button>
                    </div>
                    {bookings.slice(0, 5).map((b, i) => (
                      <div key={b.id} className={`px-4 py-3 ${i < 4 ? 'border-b border-gray-50' : ''}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-gray-900">{getUserDisplay(b.profiles)}</p>
                            <p className="text-xs text-gray-400">{b.locations?.name} · {b.slot_date}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-gray-900">€{b.total_amount}</p>
                            <span className={`text-xs px-1.5 py-0.5 rounded-md ${statusColors[b.status] || 'bg-gray-50 text-gray-500'}`}>
                              {statusLabels[b.status] || b.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-50">
                      <p className="text-sm font-medium text-gray-900">Top Σημεία</p>
                    </div>
                    {topLocations.slice(0, 5).map((loc, i) => (
                      <div key={loc.id} className={`px-4 py-3 flex items-center justify-between ${i < 4 ? 'border-b border-gray-50' : ''}`}>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                          <div>
                            <p className="text-sm text-gray-900">{loc.name}</p>
                            <p className="text-xs text-gray-400">{loc.bookingCount} κρατήσεις</p>
                          </div>
                        </div>
                        <p className="text-sm font-medium text-gray-900">€{loc.commission.toFixed(0)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'bookings' && (
                <div>
                  <div className="flex gap-2 mb-4 flex-wrap">
                    <select value={bookingFilter.status}
                      onChange={e => setBookingFilter(f => ({ ...f, status: e.target.value }))}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white text-gray-700 focus:outline-none">
                      <option value="">Όλα τα status</option>
                      {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select value={bookingFilter.location}
                      onChange={e => setBookingFilter(f => ({ ...f, location: e.target.value }))}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white text-gray-700 focus:outline-none">
                      <option value="">Όλα τα σημεία</option>
                      {locations.map(loc => <option key={loc.id} value={loc.name}>{loc.name}</option>)}
                    </select>
                    <input type="date" value={bookingFilter.date}
                      onChange={e => setBookingFilter(f => ({ ...f, date: e.target.value }))}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white text-gray-700 focus:outline-none" />
                    <button onClick={exportCSV}
                      className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-700 bg-white">
                      <Download size={12} /> Export CSV
                    </button>
                    {(bookingFilter.status || bookingFilter.location || bookingFilter.date) && (
                      <button onClick={() => setBookingFilter({ status: '', location: '', date: '' })}
                        className="text-xs text-red-500 px-2">Καθαρισμός</button>
                    )}
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">Κρατήσεις</p>
                      <span className="text-xs text-gray-400">{filteredBookings.length} αποτελέσματα</span>
                    </div>
                    {filteredBookings.map((b, i) => (
                      <div key={b.id} className={`px-4 py-3 ${i < filteredBookings.length - 1 ? 'border-b border-gray-50' : ''}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                              <p className="text-xs font-mono text-gray-400">{b.booking_ref}</p>
                              <span className={`text-xs px-1.5 py-0.5 rounded-md ${statusColors[b.status] || 'bg-gray-50 text-gray-500'}`}>
                                {statusLabels[b.status] || b.status}
                              </span>
                            </div>
                            <p className="text-sm text-gray-900">{getUserDisplay(b.profiles)}</p>
                            <p className="text-xs text-gray-400">{b.locations?.name} · {b.services?.name} · {b.slot_date} {b.slot_start_time?.slice(0, 5)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-gray-900">€{b.total_amount}</p>
                            <p className="text-xs text-gray-400">+€{b.platform_fee} fee</p>
                            <div className="flex gap-1 mt-1 justify-end">
                              {b.status === 'pending' && (
                                <button onClick={() => updateBookingStatus(b.id, 'confirmed')}
                                  className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md">Confirm</button>
                              )}
                              {b.status === 'confirmed' && (
                                <button onClick={() => updateBookingStatus(b.id, 'completed')}
                                  className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-md">Complete</button>
                              )}
                              {b.status !== 'cancelled' && b.status !== 'completed' && (
                                <button onClick={() => handleCancelBooking(b)}
                                  className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-md">Refund</button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredBookings.length === 0 && <p className="text-xs text-gray-400 text-center py-8">Δεν υπάρχουν κρατήσεις</p>}
                  </div>
                </div>
              )}

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

              {activeTab === 'users' && (
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">Χρήστες</p>
                      <span className="text-xs text-gray-400">{users.length} συνολικά</span>
                    </div>
                    {users.map((u, i) => (
                      <button key={u.id}
                        onClick={async () => { setSelectedUser(u); await loadUserBookings(u.id) }}
                        className={`w-full px-4 py-3 flex items-center justify-between text-left ${i < users.length - 1 ? 'border-b border-gray-50' : ''} ${selectedUser?.id === u.id ? 'bg-gray-50' : ''}`}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gray-900 rounded-xl flex items-center justify-center text-white text-xs font-semibold">
                            {getUserInitial(u)}
                          </div>
                          <div>
                            <p className="text-sm text-gray-900">{u.full_name || u.email || 'Χωρίς όνομα'}</p>
                            <p className="text-xs text-gray-400">{u.email || u.phone || '—'}</p>
                          </div>
                        </div>
                        <ChevronRight size={14} className="text-gray-300" />
                      </button>
                    ))}
                  </div>

                  {selectedUser && (
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">{selectedUser.full_name || selectedUser.email || 'Χρήστης'}</p>
                        <button onClick={() => setSelectedUser(null)} className="text-gray-400"><X size={14} /></button>
                      </div>
                      <div className="px-4 py-3 border-b border-gray-50">
                        <p className="text-xs text-gray-400">Email: {selectedUser.email || '—'}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Τηλέφωνο: {selectedUser.phone || '—'}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Εγγραφή: {new Date(selectedUser.created_at).toLocaleDateString('el-GR')}</p>
                      </div>
                      <div className="px-4 py-3">
                        <p className="text-xs font-medium text-gray-700 mb-2">Κρατήσεις ({userBookings.length})</p>
                        {userBookings.map((b, i) => (
                          <div key={b.id} className={`py-2 ${i < userBookings.length - 1 ? 'border-b border-gray-50' : ''}`}>
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-gray-900">{(b.locations as any)?.name}</p>
                                <p className="text-xs text-gray-400">{b.slot_date}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-medium text-gray-900">€{b.total_amount}</p>
                                <span className={`text-xs px-1.5 py-0.5 rounded-md ${statusColors[b.status] || ''}`}>
                                  {statusLabels[b.status] || b.status}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                        {userBookings.length === 0 && <p className="text-xs text-gray-400">Δεν υπάρχουν κρατήσεις</p>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'applications' && (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900">Αιτήσεις πλυντηρίων</p>
                    <span className="text-xs text-gray-400">{applications.length} συνολικά</span>
                  </div>
                  {applications.map((app, i) => (
                    <div key={app.id} className={`px-4 py-4 ${i < applications.length - 1 ? 'border-b border-gray-50' : ''}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{app.business_name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{app.owner_name}</p>
                          <p className="text-xs text-gray-400">{app.address}, {app.city}</p>
                          <p className="text-xs text-gray-400">{app.phone} · {app.email}</p>
                          <div className="flex gap-2 mt-1.5 flex-wrap">
                            {app.hours && (
                              <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded-md">
                                🕐 {app.hours}
                              </span>
                            )}
                            {app.lanes && (
                              <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded-md">
                                🚗 {app.lanes} lanes
                              </span>
                            )}
                            {app.wash_type && (
                              <span className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded-md">
                                💧 {app.wash_type}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 items-end shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-md ${
                            app.status === 'approved' ? 'bg-green-50 text-green-600' : app.status === 'rejected' ? 'bg-red-50 text-red-500' : app.status === 'pre_approved' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
                          }`}>
                            {app.status === 'approved' ? 'Εγκρίθηκε' : app.status === 'rejected' ? 'Απορρίφθηκε' : app.status === 'pre_approved' ? 'Προεγγραφή' : 'Εκκρεμεί'}
                          </span>
                          {app.status === 'pending' && (
                            <div className="flex gap-1 mt-1">
                              <button onClick={() => updateApplication(app.id, 'pre_approved')}
                                className="flex items-center gap-1 bg-blue-50 text-blue-600 text-xs px-2 py-1 rounded-lg">
                                <Check size={10} /> Προεγγραφή
                              </button>
                              <button onClick={() => updateApplication(app.id, 'rejected')}
                                className="flex items-center gap-1 bg-red-50 text-red-500 text-xs px-2 py-1 rounded-lg">
                                <X size={10} /> Απόρριψη
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      {app.status === 'pre_approved' && (
                        <div className="mt-3 border-t border-gray-50 pt-3 space-y-2">
                          <p className="text-xs font-medium text-gray-700 mb-2">Στοιχεία εγγραφής</p>

                          <div>
                            <p className="text-xs text-gray-400 mb-1">ΑΦΜ</p>
                            <input
                              defaultValue={app.afm || ''}
                              placeholder="π.χ. 123456789"
                              onBlur={async e => {
                                const supabase = createClient()
                                const v = e.target.value
                                await supabase.from('applications').update({ afm: v }).eq('id', app.id)
                                setApplications(prev => prev.map(a => a.id === app.id ? { ...a, afm: v } : a))
                              }}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-gray-400"
                            />
                          </div>

                          <div className="flex gap-2">
                            <div className="flex-1">
                              <p className="text-xs text-gray-400 mb-1">IBAN</p>
                              <input
                                defaultValue={app.iban || ''}
                                placeholder="GR00 0000..."
                                onBlur={async e => {
                                  const supabase = createClient()
                                  const v = e.target.value
                                  await supabase.from('applications').update({ iban: v }).eq('id', app.id)
                                  setApplications(prev => prev.map(a => a.id === app.id ? { ...a, iban: v } : a))
                                }}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-gray-400"
                              />
                            </div>
                            <div className="w-28">
                              <p className="text-xs text-gray-400 mb-1">Τράπεζα</p>
                              <input
                                defaultValue={app.bank_name || ''}
                                placeholder="π.χ. Eurobank"
                                onBlur={async e => {
                                  const supabase = createClient()
                                  const v = e.target.value
                                  await supabase.from('applications').update({ bank_name: v }).eq('id', app.id)
                                  setApplications(prev => prev.map(a => a.id === app.id ? { ...a, bank_name: v } : a))
                                }}
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-gray-400"
                              />
                            </div>
                          </div>

                          <div className="space-y-2 pt-1">
                            {([
                              { key: 'doc_afm_url' as const, label: 'ΑΦΜ' },
                              { key: 'doc_declaration_url' as const, label: 'Υπ. Δήλωση' },
                              { key: 'doc_agreement_url' as const, label: 'Συμφωνητικό' },
                            ]).map(doc => (
                              <div key={doc.key} className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 w-24 shrink-0">{doc.label}</span>
                                {app[doc.key] ? (
                                  <div className="flex items-center gap-2 flex-1">
                                    <a href={app[doc.key]} target="_blank" rel="noopener noreferrer"
                                      className="text-xs text-blue-600 underline truncate flex-1">
                                      Προβολή PDF
                                    </a>
                                    <label className="text-xs text-gray-400 cursor-pointer border border-gray-200 px-2 py-1 rounded-lg hover:bg-gray-50">
                                      Αντικατάσταση
                                      <input type="file" accept=".pdf" className="hidden"
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
                                  </div>
                                ) : (
                                  <label className="flex items-center gap-1.5 text-xs text-gray-500 border border-dashed border-gray-300 px-3 py-1.5 rounded-lg cursor-pointer hover:bg-gray-50 flex-1">
                                    <span>+ Ανέβασμα PDF</span>
                                    <input type="file" accept=".pdf" className="hidden"
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
                                <span className={`text-xs w-4 ${app[doc.key] ? 'text-green-500' : 'text-gray-300'}`}>
                                  {app[doc.key] ? '✓' : '·'}
                                </span>
                              </div>
                            ))}
                          </div>

                          {(() => {
                            const allDone = !!(app.afm && app.iban && app.doc_afm_url && app.doc_declaration_url && app.doc_agreement_url)
                            return (
                              <button
                                type="button"
                                disabled={!allDone}
                                onClick={() => updateApplication(app.id, 'approved')}
                                className={`w-full text-xs font-medium py-2.5 rounded-xl mt-1 transition-all ${
                                  allDone
                                    ? 'bg-gray-900 text-white'
                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                }`}
                              >
                                {allDone ? '✓ Τελική Έγκριση & Ενεργοποίηση' : 'Συμπλήρωσε όλα τα πεδία'}
                              </button>
                            )
                          })()}
                        </div>
                      )}
                    </div>
                  ))}
                  {applications.length === 0 && <p className="text-xs text-gray-400 text-center py-8">Δεν υπάρχουν αιτήσεις</p>}
                </div>
              )}

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
                  {/* Month selector */}
                  <div className="flex items-center gap-3 mb-5">
                    <p className="text-sm font-medium text-gray-700">Μήνας:</p>
                    <input type="month" value={payoutMonth}
                      onChange={e => setPayoutMonth(e.target.value)}
                      className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none" />
                    <p className="text-xs text-gray-400">{formatMonth(payoutMonth)}</p>
                  </div>

                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    {[
                      { label: 'Συνολικά έσοδα', value: `€${payoutData.reduce((s, l) => s + l.totalRevenue, 0).toFixed(0)}` },
                      { label: 'Προμήθεια Washio', value: `€${payoutData.reduce((s, l) => s + l.commission, 0).toFixed(0)}` },
                      { label: 'Οφείλεται', value: `€${payoutData.reduce((s, l) => s + (l.existingPayout?.status === 'paid' ? 0 : l.owedAmount), 0).toFixed(0)}` },
                    ].map(s => (
                      <div key={s.label} className="bg-white rounded-2xl p-4 border border-gray-100">
                        <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                        <p className="text-xl font-semibold text-gray-900">{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Locations list */}
                  <div className="space-y-3">
                    {payoutData.length === 0 && (
                      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                        <p className="text-sm text-gray-400">Δεν υπάρχουν κρατήσεις για αυτό τον μήνα</p>
                      </div>
                    )}
                    {payoutData.map(loc => {
                      const isPaid = loc.existingPayout?.status === 'paid'
                      return (
                        <div key={loc.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{loc.name}</p>
                              <p className="text-xs text-gray-400">{loc.city}</p>
                            </div>
                            <span className={`text-xs px-2 py-1 rounded-lg font-medium ${isPaid ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'}`}>
                              {isPaid ? '✓ Πληρώθηκε' : 'Εκκρεμεί'}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-2 mb-3">
                            <div className="bg-gray-50 rounded-xl p-3">
                              <p className="text-xs text-gray-400">Κρατήσεις</p>
                              <p className="text-sm font-semibold text-gray-900">{loc.monthBookings}</p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-3">
                              <p className="text-xs text-gray-400">Έσοδα</p>
                              <p className="text-sm font-semibold text-gray-900">€{loc.totalRevenue.toFixed(0)}</p>
                            </div>
                            <div className="bg-gray-50 rounded-xl p-3">
                              <p className="text-xs text-gray-400">Να αποδοθεί</p>
                              <p className="text-sm font-semibold text-gray-900">€{loc.owedAmount.toFixed(0)}</p>
                            </div>
                          </div>

                          {/* IBAN */}
                          <div className="flex gap-2 mb-3">
                            <div className="flex-1">
                              <p className="text-xs text-gray-400 mb-1">IBAN</p>
                              <input
                                defaultValue={loc.iban || ''}
                                onBlur={e => updateLocationBankInfo(loc.id, 'iban', e.target.value)}
                                placeholder="GR00 0000 0000 0000 0000 0000 000"
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-gray-400"
                              />
                            </div>
                            <div className="w-32">
                              <p className="text-xs text-gray-400 mb-1">Τράπεζα</p>
                              <input
                                defaultValue={loc.bank_name || ''}
                                onBlur={e => updateLocationBankInfo(loc.id, 'bank_name', e.target.value)}
                                placeholder="π.χ. Eurobank"
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-gray-400"
                              />
                            </div>
                          </div>

                          {isPaid ? (
                            <div className="flex items-center justify-between">
                              <p className="text-xs text-gray-400">
                                Πληρώθηκε: {loc.existingPayout?.paid_at ? new Date(loc.existingPayout.paid_at).toLocaleDateString('el-GR') : '—'}
                              </p>
                              <button onClick={() => markAsPending(loc.existingPayout.id)}
                                className="text-xs text-red-500 border border-red-100 px-3 py-1.5 rounded-lg">
                                Αναίρεση
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => markAsPaid(loc.id, loc.owedAmount, loc.existingPayout?.id)}
                              className="w-full bg-gray-900 text-white text-xs font-medium py-2.5 rounded-xl">
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