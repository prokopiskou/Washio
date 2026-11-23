'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { APP_ONLY_COUPON, inNativeApp, storeLinkForDevice } from '@/lib/app-coupon'
import { prepareHandoff, goToAppSignedIn } from '@/lib/app-handoff'
import { createClient } from '@/lib/supabase/client'
import { funnel } from '@/lib/funnel'

// Web μόνο: «Το −3€ ισχύει μόνο στην εφαρμογή → Κατέβασε την εφαρμογή» (lib/app-coupon).
// Συνδεδεμένος στο web → το πάτημα ανοίγει την εφαρμογή ΜΕ ΤΟΝ ΙΔΙΟ ΛΟΓΑΡΙΑΣΜΟ (αν υπάρχει),
// αλλιώς πάει στο store· όταν γυρίσει μετά την εγκατάσταση, ξαναπατάει → μπαίνει συνδεδεμένος.
const noop = () => () => {}
export function AppCouponHint({ show, src, locale = 'el', amount = 3 }: { show: boolean; src: string; locale?: string; amount?: number }) {
  const native = useSyncExternalStore(noop, inNativeApp, () => true)
  const href = useSyncExternalStore(noop, storeLinkForDevice, () => '/landing#app')
  const [signedIn, setSignedIn] = useState(false)
  const [tried, setTried] = useState(() => { try { return sessionStorage.getItem('ws_handoff_tried') === '1' } catch { return false } })
  const visible = APP_ONLY_COUPON && !native && show

  useEffect(() => {
    if (!visible) return
    let alive = true
    createClient().auth.getSession().then(({ data }) => {
      if (!alive || !data.session) return
      prepareHandoff().then(ok => { if (alive && ok) setSignedIn(true) })
    }).catch(() => {})
    return () => { alive = false }
  }, [visible])

  if (!visible) return null
  const en = locale === 'en'
  const a = Number.isInteger(amount) ? String(amount) : amount.toFixed(2)
  const title = tried && signedIn
    ? (en ? 'Open the app — you are already signed in' : 'Άνοιξε την εφαρμογή — είσαι ήδη συνδεδεμένος')
    : (en ? `Get the app for −€${a}` : `Κατέβασε την εφαρμογή για το −${a}€`)
  const sub = signedIn
    ? (en ? 'Opens with the same account, no new sign-in. Your −€3 is waiting.' : 'Ανοίγει με τον ίδιο λογαριασμό, χωρίς νέα σύνδεση. Το −3€ σε περιμένει.')
    : (en ? 'The first-wash coupon works only in the Washio app.' : 'Το κουπόνι πρώτου πλυσίματος ισχύει μόνο από την εφαρμογή Washio.')
  return (
    <a href={href} target={signedIn ? undefined : '_blank'} rel="noopener"
      onClick={e => {
        funnel('app_coupon_cta', { meta: { src, signed: signedIn, again: tried } })
        if (!signedIn) return
        e.preventDefault()
        try { sessionStorage.setItem('ws_handoff_tried', '1') } catch { /* ignore */ }
        setTried(true)
        goToAppSignedIn()
      }}
      className="flex items-center gap-3 rounded-2xl px-4 py-3 my-2.5 bg-[#EAF7FB] border border-[#19A8C7]/40 active:opacity-90">
      <span className="shrink-0 w-10 h-10 rounded-xl bg-washio-cyan text-white flex items-center justify-center text-[15px] font-bold">−{a}€</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold text-washio-navy leading-snug">{title}</span>
        <span className="block text-[12px] text-gray-600 leading-snug mt-0.5">{sub}</span>
      </span>
      <span className="shrink-0 text-washio-cyan-dark text-[18px]">›</span>
    </a>
  )
}
