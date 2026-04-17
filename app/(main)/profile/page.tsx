'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ChevronRight, Heart, Calendar, User, Car, Bell, MessageCircle, LogOut, Star } from 'lucide-react'

const favorites = [
  { id: 1, name: 'Avin Γλυφάδα', distance: '0.4 km', rating: 4.8 },
  { id: 2, name: 'BP Ελληνικό', distance: '2.1 km', rating: 4.5 },
]

const recentBookings = [
  { id: 1, location: 'Avin Γλυφάδα', service: 'Μέσα & Έξω', date: '28 Μαρ', status: 'completed' },
  { id: 2, location: 'Shell Άλιμος', service: 'Έξω', date: '15 Μαρ', status: 'completed' },
]

export default function ProfilePage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState({
    email: true,
    sms: false,
  })

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center">
      <div className="w-full max-w-md pb-24">

        {/* Header */}
        <div className="bg-white px-5 pt-10 pb-6 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gray-900 rounded-2xl flex items-center justify-center text-white text-xl font-semibold">
              Π
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900">Προκόπης</p>
              <p className="text-xs text-gray-400 mt-0.5">withinsuccess@gmail.com</p>
            </div>
          </div>
        </div>

        {/* Favorites */}
        <section className="mt-4 mx-4">
          <div className="bg-white rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <Heart size={14} className="text-gray-400" />
                <p className="text-xs font-medium text-gray-900">Αγαπημένα</p>
              </div>
            </div>
            {favorites.map((fav, i) => (
              <button
                key={fav.id}
                onClick={() => router.push(`/locations/${fav.id}`)}
                className={`w-full flex items-center justify-between px-4 py-3 ${i < favorites.length - 1 ? 'border-b border-gray-50' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-sm">
                    ⛽
                  </div>
                  <div className="text-left">
                    <p className="text-sm text-gray-900">{fav.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Star size={9} className="text-amber-400 fill-amber-400" />
                      <span className="text-xs text-gray-400">{fav.rating} · {fav.distance}</span>
                    </div>
                  </div>
                </div>
                <ChevronRight size={14} className="text-gray-300" />
              </button>
            ))}
          </div>
        </section>

        {/* Bookings */}
        <section className="mt-3 mx-4">
          <div className="bg-white rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <Calendar size={14} className="text-gray-400" />
                <p className="text-xs font-medium text-gray-900">Κρατήσεις</p>
              </div>
              <button className="text-xs text-blue-500">Όλες →</button>
            </div>
            {recentBookings.map((b, i) => (
              <div
                key={b.id}
                className={`flex items-center justify-between px-4 py-3 ${i < recentBookings.length - 1 ? 'border-b border-gray-50' : ''}`}
              >
                <div>
                  <p className="text-sm text-gray-900">{b.location}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{b.service} · {b.date}</p>
                </div>
                <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-lg">
                  Ολοκληρώθηκε
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Profile details */}
        <section className="mt-3 mx-4">
          <div className="bg-white rounded-2xl overflow-hidden">
            <button
              onClick={() => router.push('/profile/edit')}
              className="w-full flex items-center justify-between px-4 py-3.5 border-b border-gray-50"
            >
              <div className="flex items-center gap-2">
                <User size={14} className="text-gray-400" />
                <p className="text-sm text-gray-900">Στοιχεία προφίλ</p>
              </div>
              <ChevronRight size={14} className="text-gray-300" />
            </button>
            <button
              onClick={() => router.push('/profile/car')}
              className="w-full flex items-center justify-between px-4 py-3.5"
            >
              <div className="flex items-center gap-2">
                <Car size={14} className="text-gray-400" />
                <p className="text-sm text-gray-900">Το αμάξι μου</p>
              </div>
              <ChevronRight size={14} className="text-gray-300" />
            </button>
          </div>
        </section>

        {/* Notifications */}
        <section className="mt-3 mx-4">
          <div className="bg-white rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-50">
              <Bell size={14} className="text-gray-400" />
              <p className="text-xs font-medium text-gray-900">Ειδοποιήσεις</p>
            </div>
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-50">
              <p className="text-sm text-gray-900">Email</p>
              <button
                onClick={() => setNotifications(n => ({ ...n, email: !n.email }))}
                className={`w-10 h-6 rounded-full transition-all ${notifications.email ? 'bg-gray-900' : 'bg-gray-200'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full mx-1 transition-all ${notifications.email ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between px-4 py-3.5">
              <p className="text-sm text-gray-900">SMS</p>
              <button
                onClick={() => setNotifications(n => ({ ...n, sms: !n.sms }))}
                className={`w-10 h-6 rounded-full transition-all ${notifications.sms ? 'bg-gray-900' : 'bg-gray-200'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full mx-1 transition-all ${notifications.sms ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
          </div>
        </section>

        {/* Support */}
        <section className="mt-3 mx-4">
          <div className="bg-white rounded-2xl overflow-hidden">
            <button
              onClick={() => window.location.href = 'mailto:support@washio.gr'}
              className="w-full flex items-center justify-between px-4 py-3.5"
            >
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
          <div className="bg-white rounded-2xl overflow-hidden">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-3.5 text-red-500"
            >
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