'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { lightTap, successHaptic, errorHaptic } from '@/lib/haptics'
import { ChevronRight, ChevronDown, ChevronUp, Heart, MapPin, Trash2, Plus, CheckCircle, MessageCircle, LogOut, Home as HomeIcon } from 'lucide-react'

type Vehicle = {
  id: string
  plate: string
  type: string
}

type Booking = {
  id: string
  booking_ref: string
  slot_date: string
  slot_start_time: string
  status: string
  total_amount: number
  locations: { name: string } | null
  services: { name: string } | null
}

type Favorite = {
  id: string
  location_id: string
  locations: { id: string; name: string; slug: string } | null
}

const MONTHS_SHORT = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

function StatusPill({ status }: { status: string }) {
  const config = {
    confirmed: { bg: 'bg-blue-50', fg: 'text-blue-600', dot: 'bg-blue-600', label: 'Επερχόμενη' },
    completed: { bg: 'bg-green-50', fg: 'text-green-700', dot: 'bg-green-700', label: 'Ολοκλ.' },
    cancelled: { bg: 'bg-red-50', fg: 'text-red-600', dot: 'bg-red-600', label: 'Ακυρωμ.' },
    pending: { bg: 'bg-gray-50', fg: 'text-gray-600', dot: 'bg-gray-600', label: 'Εκκρεμεί' },
  }[status] || { bg: 'bg-gray-50', fg: 'text-gray-600', dot: 'bg-gray-600', label: status }

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${config.bg} ${config.fg} text-[11px] font-semibold tracking-tight`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="relative w-[51px] h-[31px] rounded-full transition-colors"
      style={{ background: on ? '#34C759' : '#E5E5E5' }}
    >
      <div
        className="absolute top-0.5 w-[27px] h-[27px] rounded-full bg-white transition-all"
        style={{
          left: on ? 22 : 2,
          boxShadow: '0 2px 4px rgba(0,0,0,0.15), 0 1px 0 rgba(0,0,0,0.04)',
        }}
      />
    </button>
  )
}

export default function ProfilePage() {
  const router = useRouter()
  const [authLoading, setAuthLoading] = useState(true)
  const [notifications, setNotifications] = useState({ email: true, sms: false })
  const [userEmail, setUserEmail] = useState('')
  const [userInitial, setUserInitial] = useState('?')
  const [userId, setUserId] = useState('')
  const [showProfileEdit, setShowProfileEdit] = useState(false)
  const [showCarEdit, setShowCarEdit] = useState(true) // open by default
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [plate, setPlate] = useState('')
  const [vehicleType, setVehicleType] = useState('ΙΧ')
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [showVehicleForm, setShowVehicleForm] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [vehicleSaving, setVehicleSaving] = useState(false)
  const [savedProfile, setSavedProfile] = useState(false)
  const [savedCar, setSavedCar] = useState(false)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [favorites, setFavorites] = useState<Favorite[]>([])

  const loadVehicles = async (id: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('vehicles')
      .select('id, plate, type')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
    setVehicles((data as Vehicle[]) || [])
  }

  const loadBookings = async (id: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('bookings')
      .select('id, booking_ref, slot_date, slot_start_time, status, total_amount, locations(name), services(name)')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(3)
    setBookings((data as unknown as Booking[]) || [])
  }

  const loadFavorites = async (id: string) => {
    const supabase = createClient()
    const { data } = await supabase
      .from('favorites')
      .select('id, location_id, locations(id, name, slug)')
      .eq('user_id', id)
      .limit(3)
    setFavorites((data as unknown as Favorite[]) || [])
  }

  useEffect(() => {
    const loadUser = async () => {
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user
      if (!user) {
        router.push('/login')
        setAuthLoading(false)
        return
      }
      const email = user?.email || ''
      setUserEmail(email)
      setUserInitial(email ? email[0].toUpperCase() : '?')
      setUserId(user?.id || '')
      setFullName((user?.user_metadata?.full_name as string) || '')
      setPhone((user?.user_metadata?.phone as string) || '')

      await Promise.all([
        loadVehicles(user.id),
        loadBookings(user.id),
        loadFavorites(user.id),
      ])
      setAuthLoading(false)
    }
    loadUser()
  }, [router])

  if (authLoading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-xs text-gray-400">Φόρτωση...</p>
      </main>
    )
  }

  const handleSaveProfile = async () => {
    setProfileSaving(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName.trim(), phone: phone.trim() },
    })
    setProfileSaving(false)
    if (!error) {
      setSavedProfile(true)
      setTimeout(() => setSavedProfile(false), 2000)
      setShowProfileEdit(false)
    }
  }

  const handleSaveVehicle = async () => {
    if (!userId || !plate.trim()) return
    setVehicleSaving(true)
    const supabase = createClient()
    const { error } = await supabase.from('vehicles').insert({
      user_id: userId,
      plate: plate.trim().toUpperCase(),
      type: vehicleType,
    })
    setVehicleSaving(false)
    if (!error) {
      await loadVehicles(userId)
      setPlate('')
      setVehicleType('ΙΧ')
      setSavedCar(true)
      setTimeout(() => setSavedCar(false), 2000)
      setShowVehicleForm(false)
      successHaptic()
    }
  }

  const handleDeleteVehicle = async (vehicleId: string) => {
    const supabase = createClient()
    const { error } = await supabase.from('vehicles').delete().eq('id', vehicleId)
    if (!error && userId) await loadVehicles(userId)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const handleDeleteAccount = async () => {
    if (!confirm('Διαγραφή λογαριασμού; Η ενέργεια είναι οριστική και θα διαγράψει τα στοιχεία σου (οχήματα, αγαπημένα, προφίλ).')) return
    if (!confirm('Είσαι σίγουρος/η; Δεν μπορεί να αναιρεθεί.')) return
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Η διαγραφή απέτυχε. Δοκίμασε ξανά.')
        return
      }
      const supabase = createClient()
      await supabase.auth.signOut()
      router.push('/welcome')
    } catch {
      alert('Η διαγραφή απέτυχε. Δοκίμασε ξανά.')
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center">
      <div className="w-full max-w-md md:max-w-2xl pb-28">
        <div className="px-5 pt-4 flex flex-col gap-3.5">

          {/* Logo */}
          <div className="flex justify-center -my-6">
            <img src="/washio-logo.png" alt="Washio" className="h-32 w-auto" />
          </div>

          {/* Avatar + identity */}
          <div className="flex items-center gap-3.5 px-1 py-2">
            <div className="w-16 h-16 rounded-full bg-gray-900 text-white flex items-center justify-center text-[24px] font-semibold tracking-tight">
              {userInitial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[18px] font-semibold tracking-tight text-gray-900 truncate">
                {fullName || 'Καλωσήρθες'}
              </p>
              <p className="text-[13px] text-gray-500 mt-0.5 truncate">{userEmail}</p>
            </div>
          </div>

          {/* Favorites */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
               style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div className="flex items-center justify-between px-[18px] pt-4 pb-2.5">
              <p className="text-[11px] font-semibold tracking-[1.6px] uppercase text-gray-500">
                Αγαπημένα
              </p>
              <button onClick={() => router.push('/profile/favorites')}
                className="text-[13px] font-medium text-blue-600">
                Όλα →
              </button>
            </div>
            <div className="px-2 pb-2">
              {favorites.length === 0 ? (
                <p className="text-xs text-gray-400 px-3 py-2">Δεν υπάρχουν αγαπημένα ακόμα.</p>
              ) : (
                favorites.map((fav, i) => (
                  <button
                    key={fav.id}
                    onClick={() => router.push(`/locations/${fav.locations?.slug}`)}
                    className={`w-full flex items-center gap-3 px-2.5 py-2.5 ${i < favorites.length - 1 ? 'border-b border-gray-50' : ''}`}
                  >
                    <div className="w-9 h-9 rounded-[10px] bg-gray-50 flex items-center justify-center text-gray-900">
                      <MapPin size={16} strokeWidth={1.6} />
                    </div>
                    <p className="flex-1 text-[14px] font-semibold text-gray-900 text-left truncate">
                      {fav.locations?.name}
                    </p>
                    <ChevronRight size={14} className="text-gray-300" />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Bookings */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
               style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div className="flex items-center justify-between px-[18px] pt-4 pb-2.5">
              <p className="text-[11px] font-semibold tracking-[1.6px] uppercase text-gray-500">
                Κρατήσεις
              </p>
              <button onClick={() => router.push('/profile/bookings')}
                className="text-[13px] font-medium text-blue-600">
                Όλες →
              </button>
            </div>
            <div className="px-2 pb-2">
              {bookings.length === 0 ? (
                <p className="text-xs text-gray-400 px-3 py-2">Δεν υπάρχουν κρατήσεις ακόμα.</p>
              ) : (
                bookings.map((b, i) => (
                  <button
                    key={b.id}
                    onClick={() => router.push(`/profile/bookings/${b.id}`)}
                    className={`w-full flex items-center justify-between px-2.5 py-3 text-left ${i < bookings.length - 1 ? 'border-b border-gray-50' : ''}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-gray-900 truncate">
                        {(b.locations as any)?.name}
                      </p>
                      <p className="text-[12px] text-gray-500 mt-0.5 truncate">
                        {formatDate(b.slot_date)} · {b.slot_start_time?.slice(0, 5)}
                      </p>
                    </div>
                    <StatusPill status={b.status} />
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Profile details — collapsed */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
               style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <button
              onClick={() => { setShowProfileEdit(v => !v); lightTap() }}
              className="w-full flex items-center px-[18px] py-[18px]"
            >
              <p className="flex-1 text-[15px] font-medium text-gray-900 text-left">Στοιχεία προφίλ</p>
              {showProfileEdit ? <ChevronUp size={18} className="text-gray-900" /> : <ChevronDown size={18} className="text-gray-400" />}
            </button>
            {showProfileEdit && (
              <div className="px-[18px] pb-4 pt-1 flex flex-col gap-2">
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Όνομα"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="Τηλέφωνο"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                />
                <button
                  onClick={handleSaveProfile}
                  disabled={profileSaving || savedProfile}
                  className="bg-gray-900 text-white text-xs rounded-lg px-4 py-2.5 disabled:opacity-40 w-fit"
                >
                  {savedProfile ? (
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle size={14} className="text-green-400" />
                      Αποθηκεύτηκε
                    </span>
                  ) : profileSaving ? 'Αποθήκευση...' : 'Αποθήκευση'}
                </button>
              </div>
            )}
          </div>

          {/* Vehicle */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
               style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <button
              onClick={() => { setShowCarEdit(v => !v); lightTap() }}
              className="w-full flex items-center px-[18px] py-[18px]"
            >
              <p className="flex-1 text-[15px] font-medium text-gray-900 text-left">Το όχημά μου</p>
              {showCarEdit ? <ChevronUp size={18} className="text-gray-900" /> : <ChevronDown size={18} className="text-gray-400" />}
            </button>
            {showCarEdit && (
              <div className="px-[18px] pb-4 pt-1 flex flex-col gap-2">
                {vehicles.length === 0 ? (
                  <p className="text-xs text-gray-400">Δεν υπάρχουν αποθηκευμένα οχήματα.</p>
                ) : (
                  vehicles.map((vehicle, i) => (
                    <div
                      key={vehicle.id}
                      className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-gray-50"
                    >
                      <span className="font-mono text-[14px] font-semibold tracking-wider text-gray-900">
                        {vehicle.plate}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-white border border-gray-200 text-[11px] font-semibold text-gray-500">
                        {vehicle.type}
                      </span>
                      {i === 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-gray-900 text-white text-[10px] font-semibold tracking-wider">
                          ΚΥΡΙΟ
                        </span>
                      )}
                      <div className="flex-1" />
                      <button
                        onClick={() => { handleDeleteVehicle(vehicle.id); errorHaptic() }}
                        className="text-gray-400"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
                {showVehicleForm ? (
                  <div className="flex flex-col gap-2 pt-1">
                    <input
                      type="text"
                      value={plate}
                      onChange={e => setPlate(e.target.value.toUpperCase())}
                      placeholder="Πινακίδα"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400 font-mono tracking-wider"
                    />
                    <select
                      value={vehicleType}
                      onChange={e => setVehicleType(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:outline-none focus:border-gray-400"
                    >
                      <option value="ΙΧ">ΙΧ</option>
                      <option value="Μοτοσικλέτα">Μοτοσικλέτα</option>
                    </select>
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveVehicle}
                        disabled={vehicleSaving || savedCar || !userId}
                        className="bg-gray-900 text-white text-xs rounded-lg px-4 py-2.5 disabled:opacity-40"
                      >
                        {savedCar ? (
                          <span className="inline-flex items-center gap-1.5">
                            <CheckCircle size={14} className="text-green-400" />
                            Αποθηκεύτηκε
                          </span>
                        ) : vehicleSaving ? 'Αποθήκευση...' : 'Αποθήκευση'}
                      </button>
                      <button
                        onClick={() => { setShowVehicleForm(false); setPlate('') }}
                        className="text-xs text-gray-500 px-3"
                      >
                        Άκυρο
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setShowVehicleForm(true); lightTap() }}
                    className="h-11 rounded-xl border border-dashed border-gray-300 text-[13px] font-semibold text-gray-500 flex items-center justify-center gap-1.5"
                  >
                    <Plus size={16} /> Προσθήκη οχήματος
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
               style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <div className="px-[18px] pt-4 pb-2.5">
              <p className="text-[11px] font-semibold tracking-[1.6px] uppercase text-gray-500">
                Ειδοποιήσεις
              </p>
            </div>
            <div className="px-2 pb-2">
              <div className="flex items-center px-2.5 py-2.5 border-b border-gray-50">
                <p className="flex-1 text-[15px] font-medium text-gray-900">Email</p>
                <Toggle on={notifications.email} onChange={() => setNotifications(n => ({ ...n, email: !n.email }))} />
              </div>
              <div className="flex items-center px-2.5 py-2.5">
                <p className="flex-1 text-[15px] font-medium text-gray-900">SMS</p>
                <Toggle on={notifications.sms} onChange={() => setNotifications(n => ({ ...n, sms: !n.sms }))} />
              </div>
            </div>
          </div>

          {/* Support */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
               style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <button
              onClick={() => window.location.href = 'mailto:support@washio.gr'}
              className="w-full flex items-center gap-3 px-[18px] py-[18px]"
            >
              <MessageCircle size={18} className="text-gray-500" strokeWidth={1.6} />
              <p className="flex-1 text-[15px] font-medium text-gray-900 text-left">Επικοινωνία & Support</p>
              <ChevronRight size={16} className="text-gray-300" />
            </button>
          </div>

          {/* Logout */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
               style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
            <button
              onClick={() => { lightTap(); handleLogout() }}
              className="w-full flex items-center gap-3 px-[18px] py-[18px] text-red-500"
            >
              <LogOut size={18} strokeWidth={1.6} />
              <p className="flex-1 text-[15px] font-medium text-left">Έξοδος</p>
            </button>
          </div>

          {/* Διαγραφή λογαριασμού (απαίτηση App Store) */}
          <button
            onClick={() => { lightTap(); handleDeleteAccount() }}
            className="w-full flex items-center justify-center gap-2 px-[18px] py-3.5 text-gray-400"
          >
            <Trash2 size={15} strokeWidth={1.6} />
            <span className="text-[13px] font-medium">Διαγραφή λογαριασμού</span>
          </button>
        </div>

        {/* Bottom Nav */}
        <nav
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md flex justify-around items-center py-3 border-t border-gray-100 bg-white z-20"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
        >
          <button onClick={() => router.push('/')} className="flex flex-col items-center gap-1 text-gray-300">
            <HomeIcon size={18} />
            <span className="text-[11px] font-medium">Αρχική</span>
          </button>
          <button onClick={() => router.push('/map')} className="flex flex-col items-center gap-1 text-gray-300">
            <MapPin size={18} />
            <span className="text-[11px] font-medium">Εύρεση</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-blue-600 relative">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span className="text-[11px] font-semibold">Προφίλ</span>
            <span className="absolute -bottom-1 w-1 h-1 rounded-full bg-blue-600" />
          </button>
        </nav>
      </div>
    </main>
  )
}