'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronRight, Heart, Calendar, User, Car, Bell, MessageCircle, LogOut, Star, CheckCircle, Trash2 } from 'lucide-react'

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

export default function ProfilePage() {
  const router = useRouter()
  const [authLoading, setAuthLoading] = useState(true)
  const [notifications, setNotifications] = useState({ email: true, sms: false })
  const [userEmail, setUserEmail] = useState('')
  const [userInitial, setUserInitial] = useState('?')
  const [userId, setUserId] = useState('')
  const [showProfileEdit, setShowProfileEdit] = useState(false)
  const [showCarEdit, setShowCarEdit] = useState(false)
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

  const MONTHS_SHORT = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
  }

  const statusLabel = (status: string) => {
    switch (status) {
      case 'confirmed': return 'Επιβεβαιώθηκε'
      case 'completed': return 'Ολοκληρώθηκε'
      case 'cancelled': return 'Ακυρώθηκε'
      case 'pending': return 'Εκκρεμεί'
      default: return status
    }
  }

  const statusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'text-blue-600 bg-blue-50'
      case 'completed': return 'text-green-600 bg-green-50'
      case 'cancelled': return 'text-red-600 bg-red-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

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
      <main className="min-h-screen bg-white flex flex-col items-center">
        <div className="w-full max-w-md min-h-screen flex items-center justify-center">
          <p className="text-xs text-gray-400">Φόρτωση...</p>
        </div>
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

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md pb-24">

        {/* Header */}
        <div className="bg-white px-5 pt-10 pb-6 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gray-900 rounded-2xl flex items-center justify-center text-white text-xl font-semibold">
              {userInitial}
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900">{fullName || userEmail}</p>
              <p className="text-xs text-gray-400 mt-0.5">{userEmail}</p>
            </div>
          </div>
        </div>

        {/* Favorites */}
        <section className="mt-4 mx-4">
          <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
              <button onClick={() => router.push('/profile/favorites')} className="flex items-center gap-2">
                <Heart size={14} className="text-gray-400" />
                <p className="text-xs font-medium text-gray-900">Αγαπημένα</p>
              </button>
              <button onClick={() => router.push('/profile/favorites')} className="text-xs text-blue-500">Όλα →</button>
            </div>
            {favorites.length === 0 ? (
              <p className="text-xs text-gray-400 px-4 py-3">Δεν υπάρχουν αγαπημένα ακόμα.</p>
            ) : (
              favorites.map((fav, i) => (
                <button
                  key={fav.id}
                  onClick={() => router.push(`/locations/${fav.locations?.slug}`)}
                  className={`w-full flex items-center justify-between px-4 py-3 ${i < favorites.length - 1 ? 'border-b border-gray-50' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-sm">⛽</div>
                    <p className="text-sm text-gray-900">{fav.locations?.name}</p>
                  </div>
                  <ChevronRight size={14} className="text-gray-300" />
                </button>
              ))
            )}
          </div>
        </section>

        {/* Bookings */}
        <section className="mt-3 mx-4">
          <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
              <button onClick={() => router.push('/profile/bookings')} className="flex items-center gap-2">
                <Calendar size={14} className="text-gray-400" />
                <p className="text-xs font-medium text-gray-900">Κρατήσεις</p>
              </button>
              <button onClick={() => router.push('/profile/bookings')} className="text-xs text-blue-500">Όλες →</button>
            </div>
            {bookings.length === 0 ? (
              <p className="text-xs text-gray-400 px-4 py-3">Δεν υπάρχουν κρατήσεις ακόμα.</p>
            ) : (
              bookings.map((b, i) => (
                <button
                  key={b.id}
                  onClick={() => router.push(`/profile/bookings/${b.id}`)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left ${i < bookings.length - 1 ? 'border-b border-gray-50' : ''}`}
                >
                  <div>
                    <p className="text-sm text-gray-900">{(b.locations as any)?.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{(b.services as any)?.name} · {formatDate(b.slot_date)}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-lg ${statusColor(b.status)}`}>
                    {statusLabel(b.status)}
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Profile details */}
        <section className="mt-3 mx-4">
          <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
            <button
              onClick={() => setShowProfileEdit(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3.5 border-b border-gray-50"
            >
              <div className="flex items-center gap-2">
                <User size={14} className="text-gray-400" />
                <p className="text-sm text-gray-900">Στοιχεία προφίλ</p>
              </div>
              <ChevronRight size={14} className="text-gray-300" />
            </button>
            {showProfileEdit && (
              <div className="bg-white px-4 py-3 border-t border-gray-50 flex flex-col gap-2">
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Όνομα"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400" />
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Τηλέφωνο"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400" />
                <button onClick={handleSaveProfile} disabled={profileSaving || savedProfile}
                  className="bg-gray-900 text-white text-xs rounded-lg px-4 py-2 disabled:opacity-40 w-fit">
                  {savedProfile ? <span className="inline-flex items-center gap-1.5"><CheckCircle size={14} className="text-green-500" />Αποθηκεύτηκε</span>
                    : profileSaving ? 'Αποθήκευση...' : 'Αποθήκευση'}
                </button>
              </div>
            )}
            <button onClick={() => setShowCarEdit(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-2">
                <Car size={14} className="text-gray-400" />
                <p className="text-sm text-gray-900">Το όχημά μου</p>
              </div>
              <ChevronRight size={14} className="text-gray-300" />
            </button>
            {showCarEdit && (
              <div className="bg-white px-4 py-3 border-t border-gray-50 flex flex-col gap-2">
                {vehicles.length === 0 ? (
                  <p className="text-xs text-gray-400">Δεν υπάρχουν αποθηκευμένα οχήματα.</p>
                ) : (
                  vehicles.map(vehicle => (
                    <div key={vehicle.id} className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-gray-900">{vehicle.plate}</p>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">{vehicle.type}</span>
                      </div>
                      <button onClick={() => handleDeleteVehicle(vehicle.id)} className="text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))
                )}
                {showVehicleForm ? (
                  <div className="border-t border-gray-50 pt-2 flex flex-col gap-2">
                    <input type="text" value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} placeholder="Πινακίδα"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400" />
                    <select value={vehicleType} onChange={e => setVehicleType(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:border-gray-400">
                      <option value="ΙΧ">ΙΧ</option>
                      <option value="SUV">SUV</option>
                      <option value="Μοτοσυκλέτα">Μοτοσυκλέτα</option>
                      <option value="Φορτηγό">Φορτηγό</option>
                    </select>
                    <button onClick={handleSaveVehicle} disabled={vehicleSaving || savedCar || !userId}
                      className="bg-gray-900 text-white text-xs rounded-lg px-4 py-2 disabled:opacity-40 w-fit">
                      {savedCar ? <span className="inline-flex items-center gap-1.5"><CheckCircle size={14} className="text-green-500" />Αποθηκεύτηκε</span>
                        : vehicleSaving ? 'Αποθήκευση...' : 'Αποθήκευση'}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowVehicleForm(true)}
                    className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-2 w-fit">
                    + Προσθήκη οχήματος
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Notifications */}
        <section className="mt-3 mx-4">
          <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
              <Bell size={14} className="text-gray-400" />
              <p className="text-xs font-medium text-gray-900">Ειδοποιήσεις</p>
            </div>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-50">
              <p className="text-sm text-gray-900">Email</p>
              <button onClick={() => setNotifications(n => ({ ...n, email: !n.email }))}
                className={`w-10 h-6 rounded-full transition-all ${notifications.email ? 'bg-gray-900' : 'bg-gray-200'}`}>
                <div className={`w-4 h-4 bg-white rounded-full mx-1 transition-all ${notifications.email ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between px-4 py-3.5">
              <p className="text-sm text-gray-900">SMS</p>
              <button onClick={() => setNotifications(n => ({ ...n, sms: !n.sms }))}
                className={`w-10 h-6 rounded-full transition-all ${notifications.sms ? 'bg-gray-900' : 'bg-gray-200'}`}>
                <div className={`w-4 h-4 bg-white rounded-full mx-1 transition-all ${notifications.sms ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </section>

        {/* Support */}
        <section className="mt-3 mx-4">
          <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
            <button onClick={() => window.location.href = 'mailto:support@washio.gr'}
              className="w-full flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-2">
                <MessageCircle size={14} className="text-gray-400" />
                <p className="text-sm text-gray-900">Επικοινωνία & Support</p>
              </div>
              <ChevronRight size={14} className="text-gray-300" />
            </button>
          </div>
        </section>

        {/* Logout */}
        <section className="mt-3 mx-4">
          <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
            <button onClick={handleLogout} className="w-full flex items-center gap-2 px-4 py-3.5 text-red-500">
              <LogOut size={14} />
              <p className="text-sm">Έξοδος</p>
            </button>
          </div>
        </section>

        {/* Bottom Nav */}
        <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md flex justify-around items-center py-3 border-t border-gray-100 bg-white">
          <button onClick={() => router.push('/')} className="flex flex-col items-center gap-1 text-gray-300">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
            <span className="text-xs">Αρχική</span>
          </button>
          <button onClick={() => router.push('/map')} className="flex flex-col items-center gap-1 text-gray-300">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
            <span className="text-xs">Εύρεση</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-blue-600">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <span className="text-xs">Προφίλ</span>
          </button>
        </nav>

      </div>
    </main>
  )
}