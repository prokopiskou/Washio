'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Home, MapPin, User } from 'lucide-react'
import { useT } from '@/lib/i18n'

const T = {
  el: { home: 'Αρχική', find: 'Εύρεση', profile: 'Προφίλ' },
  en: { home: 'Home', find: 'Find', profile: 'Profile' },
}

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()
  const t = useT(T)
  // Προφόρτωση των tabs + κρατήσεων: ο κώδικας κάθε οθόνης είναι ήδη στη
  // συσκευή πριν το tap (τα Link στο fixed nav δεν «φαίνονται» πάντα στο WebView).
  useEffect(() => {
    for (const href of ['/', '/map', '/profile', '/profile/bookings']) router.prefetch(href)
  }, [router])

  const homeActive = pathname === '/'
  const findActive = pathname.startsWith('/map')
  const profileActive = pathname.startsWith('/profile')

  const side = (active: boolean) =>
    `pointer-events-auto flex flex-1 flex-col items-center justify-center gap-1 py-2 select-none transition-colors ${active ? 'text-washio-navy' : 'text-gray-400 active:text-gray-600'}`

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-30 pointer-events-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div
        className="relative mx-0 bg-white/95 backdrop-blur-xl border-t border-washio-border rounded-t-[26px] pointer-events-auto"
        style={{ boxShadow: '0 -6px 24px rgba(16,24,42,0.06)' }}
      >
        <div className="flex items-end justify-around h-[72px] px-4">
          <Link href="/" className={side(homeActive)}>
            <Home size={24} strokeWidth={homeActive ? 2.2 : 1.8} />
            <span className={`text-[11px] tracking-tight ${homeActive ? 'font-semibold' : 'font-medium'}`}>{t.home}</span>
          </Link>

          {/* Κεντρικό CTA — πάντα ανασηκωμένο cyan κουμπί */}
          <Link href="/map" className="pointer-events-auto flex flex-1 flex-col items-center gap-1 pb-2 select-none">
            <span
              className={`-mt-7 w-[62px] h-[62px] rounded-full flex items-center justify-center text-white ring-[5px] ring-white transition-transform active:scale-95 ${findActive ? 'bg-washio-cyan-dark' : 'bg-washio-cyan'}`}
              style={{ boxShadow: '0 8px 20px rgba(25,168,199,0.35)' }}
            >
              <MapPin size={26} strokeWidth={2} />
            </span>
            <span className="text-[11px] font-semibold tracking-tight text-washio-cyan-dark">{t.find}</span>
          </Link>

          <Link href="/profile" className={side(profileActive)}>
            <User size={24} strokeWidth={profileActive ? 2.2 : 1.8} />
            <span className={`text-[11px] tracking-tight ${profileActive ? 'font-semibold' : 'font-medium'}`}>{t.profile}</span>
          </Link>
        </div>
      </div>
    </nav>
  )
}
