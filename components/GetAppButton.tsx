'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n'

// Μόνιμο κουμπί «Λήψη εφαρμογής» πάνω δεξιά — ΜΟΝΟ στο web, ΜΟΝΟ για συνδεδεμένους.
// Δεν διακόπτει τη ροή (δεν είναι popup). Εμφανίζεται μόνο σε οθόνες όπου η πάνω
// δεξιά γωνία είναι ελεύθερη (όχι χάρτης / σελίδα πλυντηρίου / checkout).
// Tracking εγκαταστάσεων από αυτό το κουμπί:
//  - iOS: App Store Connect → App Analytics → Sources → Campaigns (ct=web_get_app_button).
//    Χρειάζεται το provider token (pt) του λογαριασμού για να καταγράφεται.
//  - Android: Play Console → Statistics → User acquisition (utm_source / utm_campaign).
const APPLE_PT = '129101712'
const APP_STORE = `https://apps.apple.com/app/apple-store/id6785925766?${APPLE_PT ? `pt=${APPLE_PT}&` : ''}ct=web_get_app_button&mt=8`
const PLAY_STORE = 'https://play.google.com/store/apps/details?id=gr.washio.app&referrer=' +
  encodeURIComponent('utm_source=washio_web&utm_medium=get_app_button&utm_campaign=web_to_app')

const T = {
  el: { label: 'Λήψη εφαρμογής' },
  en: { label: 'Get the app' },
}

const allowed = (p: string) =>
  p === '/' || p === '/profile' || p.startsWith('/profile/') || p.startsWith('/bookings/')

export function GetAppButton() {
  const t = useT(T)
  const pathname = usePathname() || '/'
  const [loggedIn, setLoggedIn] = useState(false)
  const [href, setHref] = useState('')

  useEffect(() => {
    const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (cap?.isNativePlatform?.()) return // μέσα στο app: ποτέ

    const ua = navigator.userAgent || ''
    setHref(/iphone|ipad|ipod/i.test(ua) ? APP_STORE : /android/i.test(ua) ? PLAY_STORE : '/landing#app')

    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => setLoggedIn(!!session?.user))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setLoggedIn(!!session?.user))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!href || !loggedIn || !allowed(pathname)) return null
  const external = href.startsWith('http')

  return (
    <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-40 pointer-events-none">
      <div className="flex justify-end px-4" style={{ paddingTop: 'calc(var(--safe-top, 0px) + 12px)' }}>
        <a
          href={href}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="pointer-events-auto inline-flex items-center gap-1.5 bg-washio-navy/90 backdrop-blur-md text-white text-[12px] font-semibold pl-2.5 pr-3 py-2 rounded-full active:scale-95 transition-transform"
          style={{ boxShadow: '0 6px 18px rgba(16,24,42,0.18)' }}
        >
          <Download size={14} strokeWidth={2.4} className="text-washio-cyan" />
          {t.label}
        </a>
      </div>
    </div>
  )
}
