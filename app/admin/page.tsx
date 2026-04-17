'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BarChart3, Users, MapPin, Calendar, ChevronRight, ArrowUpRight } from 'lucide-react'

export default function AdminPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings' | 'locations' | 'users' | 'applications'>('overview')
  const [bookings, setBookings] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [applications, setApplications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    const supabase = createClient()
    setLoading(true)

    const [{ data: bookingsData }, { data: locationsData }, { data: profilesData }, { data: applicationsData }] = await Promise.all([
      supabase.from('bookings').select('*, locations(name), services(name, price), profiles(full_name)').order('created_at', { ascending: false }).limit(50),
      supabase.from('locations').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('applications').select('*').order('created_at', { ascending: false }),
    ])

    setBookings(bookingsData || [])
    setLocations(locationsData || [])
    setUsers(profilesData || [])
    setApplications(applicationsData || [])
    setLoading(false)
  }

  const totalRevenue = bookings.filter(b => b.status === 'completed').reduce((sum, b) => sum + Number(b.total_amount || 0), 0)
  const totalCommission = totalRevenue * 0.10
  const completedBookings = bookings.filter(b => b.status === 'completed').length
  const totalUsers = users.length

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

  const applicationStatusColors: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-600',
    approved: 'bg-green-50 text-green-600',
    rejected: 'bg-red-50 text-red-500',
  }

  const applicationStatusLabels: Record<string, string> = {
    pending: 'Εκκρεμεί',
    approved: 'Εγκρίθηκε',
    rejected: 'Απορρίφθηκε',
  }
  const handleCancel = async (bookingId: string, paymentIntentId: string) => {
    if (!confirm('Ακύρωση κράτησης και επιστροφή χρημάτων;')) return
  
    const res = await fetch('/api/bookings/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, paymentIntentId }),
    })
  
    if (res.ok) {
      fetchData()
    } else {
      alert('Σφάλμα ακύρωσης')
    }
  }
  return (
    <main className="min-h-screen bg-gray-50 max-w-2xl mx-auto pb-10">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Washio Admin</h1>
            <p className="text-xs text-gray-400 mt-0.5">{new Date().toLocaleDateString('el-GR', { month: 'long', year: 'numeric' })}</p>
          </div>
          <button onClick={() => router.push('/')} className="text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-full">
            ← App
          </button>
        </div>

        <div className="flex gap-1 mt-4">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'bookings', label: 'Κρατήσεις' },
            { key: 'locations', label: 'Πρατήρια' },
            { key: 'users', label: 'Χρήστες' },
            { key: 'applications', label: 'Αιτήσεις πλυντηρίων' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeTab === tab.key ? 'bg-gray-900 text-white' : 'text-gray-500'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 pt-5">

        {loading && (
          <div className="text-center py-10">
            <p className="text-xs text-gray-400">Φόρτωση...</p>
          </div>
        )}

        {!loading && activeTab === 'overview' && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {[
                { label: 'Έσοδα', value: `€${totalRevenue.toFixed(0)}` },
                { label: 'Προμήθειες (10%)', value: `€${totalCommission.toFixed(0)}` },
                { label: 'Κρατήσεις', value: completedBookings },
                { label: 'Χρήστες', value: totalUsers },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-2xl p-4 border border-gray-100">
                  <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                  <p className="text-xl font-semibold text-gray-900">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden mb-6">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
                <p className="text-sm font-medium text-gray-900">Πρόσφατες κρατήσεις</p>
                <button onClick={() => setActiveTab('bookings')} className="text-xs text-blue-500">Όλες →</button>
              </div>
              {bookings.slice(0, 5).map((b, i) => (
                <div key={b.id} className={`px-4 py-3 ${i < 4 ? 'border-b border-gray-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-900">{b.profiles?.full_name || 'Επισκέπτης'}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{b.locations?.name} · {b.services?.name}</p>
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
              {bookings.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6">Δεν υπάρχουν κρατήσεις ακόμα</p>
              )}
            </div>
          </>
        )}

        {!loading && activeTab === 'bookings' && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">Κρατήσεις</p>
              <span className="text-xs text-gray-400">{bookings.length} συνολικά</span>
            </div>
            {bookings.map((b, i) => (
              <div key={b.id} className={`px-4 py-3 ${i < bookings.length - 1 ? 'border-b border-gray-50' : ''}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-mono text-gray-400">{b.booking_ref}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-md ${statusColors[b.status] || 'bg-gray-50 text-gray-500'}`}>
                        {statusLabels[b.status] || b.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-900 mt-0.5">{b.profiles?.full_name || 'Επισκέπτης'}</p>
                    <p className="text-xs text-gray-400">{b.locations?.name} · {b.services?.name} · {b.slot_date}</p>
                  </div>
                  <div className="text-right">
  <p className="text-sm font-semibold text-gray-900">€{b.total_amount}</p>
  {b.status !== 'cancelled' && b.status !== 'completed' && (
    <button
      onClick={() => handleCancel(b.id, b.stripe_payment_intent_id)}
      className="text-xs text-red-500 mt-1"
    >
      Ακύρωση
    </button>
  )}
</div>
                </div>
              </div>
            ))}
            {bookings.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">Δεν υπάρχουν κρατήσεις ακόμα</p>
            )}
          </div>
        )}

        {!loading && activeTab === 'locations' && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
              <p className="text-sm font-medium text-gray-900">Πρατήρια</p>
              <button
                onClick={() => router.push('/admin/locations/new')}
                className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg"
              >
                + Προσθήκη
              </button>
            </div>
            {locations.map((loc, i) => (
              <div key={loc.id} className={`px-4 py-3 flex items-center justify-between ${i < locations.length - 1 ? 'border-b border-gray-50' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-sm">⛽</div>
                  <div>
                    <p className="text-sm text-gray-900">{loc.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{loc.city} · {loc.address}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-lg ${loc.is_active ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
                    {loc.is_active ? 'Ενεργό' : 'Ανενεργό'}
                  </span>
                  <ChevronRight size={14} className="text-gray-300" />
                </div>
              </div>
            ))}
            {locations.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">Δεν υπάρχουν πρατήρια ακόμα</p>
            )}
          </div>
        )}

        {!loading && activeTab === 'users' && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">Χρήστες</p>
              <span className="text-xs text-gray-400">{users.length} συνολικά</span>
            </div>
            {users.map((u, i) => (
              <div key={u.id} className={`px-4 py-3 flex items-center justify-between ${i < users.length - 1 ? 'border-b border-gray-50' : ''}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-900 rounded-xl flex items-center justify-center text-white text-xs font-semibold">
                    {u.full_name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <p className="text-sm text-gray-900">{u.full_name || 'Χωρίς όνομα'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{u.phone || '—'} · {u.role}</p>
                  </div>
                </div>
                <ChevronRight size={14} className="text-gray-300" />
              </div>
            ))}
            {users.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">Δεν υπάρχουν χρήστες ακόμα</p>
            )}
          </div>
        )}

        {!loading && activeTab === 'applications' && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">Αιτήσεις πλυντηρίων</p>
              <span className="text-xs text-gray-400">{applications.length} συνολικά</span>
            </div>
            {applications.map((app, i) => (
              <div key={app.id} className={`px-4 py-3 ${i < applications.length - 1 ? 'border-b border-gray-50' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-gray-900">{app.business_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{app.city} · {app.owner_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{app.phone} · {app.email}</p>
                  </div>
                  <span className={`text-xs px-1.5 py-0.5 rounded-md ${applicationStatusColors[app.status] || 'bg-gray-50 text-gray-500'}`}>
                    {applicationStatusLabels[app.status] || app.status}
                  </span>
                </div>
              </div>
            ))}
            {applications.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-6">Δεν υπάρχουν αιτήσεις ακόμα</p>
            )}
          </div>
        )}

      </div>
    </main>
  )
}