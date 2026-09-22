'use client'

import { useEffect, useState } from 'react'
import { X, Gift } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n'

// Web-only nudge: όποιος έκανε sign-up στο browser και κρατάει κουπόνι (−3€),
// τον σπρώχνουμε στο native app. Το wallet είναι δεμένο στον ΛΟΓΑΡΙΑΣΜΟ (server-side),
// οπότε με το ίδιο login το κουπόνι τον περιμένει μέσα στην εφαρμογή — δεν χάνεται.
const DISMISS_KEY = 'washio_getapp_dismissed'

const T = {
  el: {
    title: 'Το κουπόνι σου −3€ σε περιμένει στην εφαρμογή',
    sub: 'Κατέβασε το app — ίδιο login, το κουπόνι είναι εκεί.',
    cta: 'Κατέβασέ το',
    close: 'Κλείσιμο',
  },
  en: {
    title: 'Your €3 coupon is waiting in the app',
    sub: 'Get the app — same login, your coupon is there.',
    cta: 'Get it',
    close: 'Close',
  },
}

export function GetAppBanner() {
  const t = useT(T)
  const [show, setShow] = useState(false)
  const [storeUrl, setStoreUrl] = useState('')

  useEffect(() => {
    // Μέσα στο native app δεν έχει νόημα.
    const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (cap?.isNativePlatform?.()) return
    if (localStorage.getItem(DISMISS_KEY)) return

    const ua = navigator.userAgent || ''
    const isIOS = /iphone|ipad|ipod/i.test(ua)
    const isAndroid = /android/i.test(ua)
    if (!isIOS && !isAndroid) return // desktop → όχι app nudge
    const url = isIOS
      ? 'https://apps.apple.com/app/id6785925766'
      : 'https://play.google.com/store/apps/details?id=gr.washio.app'

    let alive = true
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const user = session?.user
        if (!user) return
        const { data: prof } = await supabase.from('profiles')
          .select('referral_credit').eq('id', user.id).maybeSingle()
        if (!alive) return
        if ((Number(prof?.referral_credit) || 0) > 0) {
          setStoreUrl(url)
          setShow(true)
        }
      } catch { /* fail-safe: μη δείχνεις τίποτα */ }
    })()
    return () => { alive = false }
  }, [])

  if (!show) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
    setShow(false)
  }

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 w-full max-w-md z-40 px-4"
      style={{ bottom: 'calc(72px + env(safe-area-inset-bottom) + 12px)' }}
    >
      <div className="bg-gray-900 rounded-2xl shadow-xl px-4 py-3.5 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
          <Gift size={20} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-white leading-tight">{t.title}</p>
          <p className="text-[11px] text-white/60 mt-0.5 leading-snug">{t.sub}</p>
        </div>
        <a
          href={storeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 bg-white text-gray-900 text-[12px] font-semibold px-3 py-2 rounded-xl"
        >
          {t.cta}
        </a>
        <button onClick={dismiss} aria-label={t.close} className="shrink-0 text-white/40 -mr-1">
          <X size={16} />
        </button>
      </div>
    </div>
  )
}
