'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronRight, Download, RefreshCw, Check, X, Power } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

const ADMIN_EMAIL = 'withinsuccess@gmail.com'

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
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings' | 'locations' | 'users' | 'applications' | 'financials' | 'addons'>('overview')
  const [bookings, setBookings] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [applications, setApplications] = useState<any[]>([])
  const [addons, setAddons] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [newAddon, setNewAddon] = useState({ name: '', price: '' })
  const [addingAddon, setAddingAddon] = useState(false)

  const [bookingFilter, setBookingFilter] = useState({ status: '', location: '', date: '' })
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [userBookings, setUserBookings] = useState<any[]>([])

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      const email = data.session?.user?.email
      if (email !== ADMIN_EMAIL) {
        router.replace('/')
        return
      }
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
    ] = await Promise.all([
      supabase.from('bookings')
        .select('*, locations(name, city), services(name, price), profiles(full_name, phone, email)')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('locations')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('profiles')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('applications')
        .select('*')
        .order('created_at', { ascending: false }),
      supabase.from('addons')
        .select('*')
        .order('sort_order', { ascending: true }),
    ])

    setBookings(bookingsData || [])
    setLocations(locationsData || [])
    setUsers(profilesData || [])
    setApplications(applicationsData || [])
    setAddons(addonsData || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (authorized) fetchData()
  }, [authorized])

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
    const revenue = monthBookings.reduce((sum, b) => sum + Number(b.total_amount || 0), 0)
    const commission = monthBookings.reduce((sum, b) => sum + Number(b.platform_fee || 0), 0)
    return { month: MONTHS_SHORT[month], revenue, commission }
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

  const getUserDisplay = (profile: any) => profile?.full_name || profile?.email || 'Επισκέπτης'
  const getUserInitial = (profile: any) => (profile?.full_name || profile?.email || '?').charAt(0).toUpperCase()

  const updateBookingStatus = async (id: string, status: string) => {
    const supabase = createClient()
    await supabase.from('bookings').update({ status }).eq('id', id)
    fetchData()
  }

  const handleCancelBooking = async (bookingId: string, paymentIntentId: string) => {
    if (!confirm('Ακύρωση κράτησης και επιστροφή χρημάτων;')) return
    const res = await fetch('/api/bookings/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, paymentIntentId }),
    })
    if (res.ok) fetchData()
    else alert('Σφάλμα ακύρωσης')
  }

  const toggleLocation = async (id: string, isActive: boolean) => {
    const supabase = createClient()
    await supabase.from('locations').update({ is_active: !isActive }).eq('id', id)
    fetchData()
  }

  const updateApplication = async (id: string, status: 'approved' | 'rejected') => {
    const supabase = createClient()
    await supabase.from('applications').update({ status }).eq('id', id)
    fetchData()
  }

  const updateCommissionRate = async (id: string, rate: number) => {
    const supabase = createClient()
    await supabase.from('locations').update({ commission_rate: rate }).eq('id', id)
    fetchData()
  }

  const loadUserBookings = async (userId: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('bookings')
      .select('*, locations(name), services(name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
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

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xs text-gray-400">Έλεγχος πρόσβασης...</p>
      </div>
    )
  }

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
              <button onClick={fetchData} className="p-2 text-gray-400 hover:text-gray-600">
                <RefreshCw size={16} />
              </button>
              <button onClick={() => router.push('/')} className="text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-full">
                ← App
              </button>
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
              { key: 'addons', label: `Υπηρεσίες (${addons.length})` },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.key ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 pt-5">
          {loading ? (
            <div className="text-center py-10">
              <p className="text-xs text-gray-400">Φόρτωση...</p>
            </div>
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
                      {Object.entries(statusLabels).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                    <select value={bookingFilter.location}
                      onChange={e => setBookingFilter(f => ({ ...f, location: e.target.value }))}
                      className="border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white text-gray-700 focus:outline-none">
                      <option value="">Όλα τα σημεία</option>
                      {locations.map(loc => (
                        <option key={loc.id} value={loc.name}>{loc.name}</option>
                      ))}
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
                                <button onClick={() => handleCancelBooking(b.id, b.stripe_payment_intent_id)}
                                  className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-md">Ακύρωση</button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {filteredBookings.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-8">Δεν υπάρχουν κρατήσεις</p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'locations' && (
                <div>
                  <div className="flex justify-end mb-4">
                    <button onClick={() => router.push('/admin/locations/new')}
                      className="text-xs bg-gray-900 text-white px-4 py-2 rounded-xl">
                      + Νέο σημείο
                    </button>
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
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-xs px-2 py-0.5 rounded-lg ${loc.is_active ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                              {loc.is_active ? 'Ενεργό' : 'Ανενεργό'}
                            </span>
                            <button onClick={() => toggleLocation(loc.id, loc.is_active)}
                              className="p-1.5 border border-gray-200 rounded-lg text-gray-500">
                              <Power size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {locations.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-8">Δεν υπάρχουν σημεία</p>
                    )}
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
                        <p className="text-xs text-gray-400 mt-0.5">Role: {selectedUser.role}</p>
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
                        {userBookings.length === 0 && (
                          <p className="text-xs text-gray-400">Δεν υπάρχουν κρατήσεις</p>
                        )}
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
                          <p className="text-xs text-gray-400 mt-0.5">{app.city} · {app.owner_name}</p>
                          <p className="text-xs text-gray-400">{app.phone} · {app.email}</p>
                          {app.notes && <p className="text-xs text-gray-500 mt-1 italic">"{app.notes}"</p>}
                        </div>
                        <div className="flex flex-col gap-1 items-end shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-md ${
                            app.status === 'approved' ? 'bg-green-50 text-green-600' :
                            app.status === 'rejected' ? 'bg-red-50 text-red-500' :
                            'bg-amber-50 text-amber-600'
                          }`}>
                            {app.status === 'approved' ? 'Εγκρίθηκε' : app.status === 'rejected' ? 'Απορρίφθηκε' : 'Εκκρεμεί'}
                          </span>
                          {app.status === 'pending' && (
                            <div className="flex gap-1 mt-1">
                              <button onClick={() => updateApplication(app.id, 'approved')}
                                className="flex items-center gap-1 bg-green-50 text-green-600 text-xs px-2 py-1 rounded-lg">
                                <Check size={10} /> Έγκριση
                              </button>
                              <button onClick={() => updateApplication(app.id, 'rejected')}
                                className="flex items-center gap-1 bg-red-50 text-red-500 text-xs px-2 py-1 rounded-lg">
                                <X size={10} /> Απόρριψη
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {applications.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-8">Δεν υπάρχουν αιτήσεις</p>
                  )}
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
                    {topLocations.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-8">Δεν υπάρχουν δεδομένα</p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'addons' && (
                <div>
                  <div className="flex justify-end mb-4">
                    <button onClick={() => setAddingAddon(v => !v)}
                      className="text-xs bg-gray-900 text-white px-4 py-2 rounded-xl">
                      + Νέα υπηρεσία
                    </button>
                  </div>

                  {addingAddon && (
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 flex gap-2">
                      <input
                        value={newAddon.name}
                        onChange={e => setNewAddon(n => ({ ...n, name: e.target.value }))}
                        placeholder="Όνομα υπηρεσίας"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                      />
                      <input
                        value={newAddon.price}
                        onChange={e => setNewAddon(n => ({ ...n, price: e.target.value }))}
                        placeholder="€"
                        type="number"
                        className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
                      />
                      <button onClick={handleAddAddon}
                        className="bg-gray-900 text-white text-xs px-3 py-2 rounded-lg">
                        Αποθήκευση
                      </button>
                      <button onClick={() => { setAddingAddon(false); setNewAddon({ name: '', price: '' }) }}
                        className="text-gray-400 px-2">
                        <X size={14} />
                      </button>
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
                          <input
                            type="number"
                            defaultValue={addon.price}
                            onBlur={async e => {
                              const supabase = createClient()
                              await supabase.from('addons').update({ price: parseFloat(e.target.value) }).eq('id', addon.id)
                              fetchData()
                            }}
                            className="w-16 text-xs border border-gray-200 rounded px-2 py-1 text-gray-700"
                          />
                          <span className="text-xs text-gray-400">€</span>
                          <button
                            onClick={async () => {
                              const supabase = createClient()
                              await supabase.from('addons').update({ is_active: !addon.is_active }).eq('id', addon.id)
                              fetchData()
                            }}
                            className={`text-xs px-2 py-1 rounded-lg ${addon.is_active ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}
                          >
                            {addon.is_active ? 'Ενεργό' : 'Ανενεργό'}
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm('Διαγραφή υπηρεσίας;')) return
                              const supabase = createClient()
                              await supabase.from('addons').delete().eq('id', addon.id)
                              fetchData()
                            }}
                            className="text-xs text-red-400 px-1"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {addons.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-8">Δεν υπάρχουν υπηρεσίες</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}