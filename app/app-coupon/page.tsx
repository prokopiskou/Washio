'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { prepareHandoff, goToAppSignedIn } from '@/lib/app-handoff'
import { inNativeApp } from '@/lib/app-coupon'
import { funnel } from '@/lib/funnel'

// B τεστ (lp=app): μόλις γραφτεί στο web από διαφήμιση → «Το −3€ σου είναι στην εφαρμογή».
// Πάτημα → εφαρμογή ΣΥΝΔΕΔΕΜΕΝΗ (αν υπάρχει) ή store με το κλειδί σύνδεσης (lib/app-handoff).
// Υπολογιστής / μέσα στην εφαρμογή → χάρτης.
export default function AppCouponPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [tapped, setTapped] = useState(false)

  useEffect(() => {
    if (inNativeApp()) { router.replace('/map'); return }
    const mobile = /iphone|ipad|ipod|android/i.test(navigator.userAgent || '')
    if (!mobile) { router.replace('/map'); return }
    createClient().auth.getSession().then(({ data }) => {
      if (!data.session) { router.replace('/login?welcome=1&redirect=%2Fapp-coupon'); return }
      funnel('app_coupon_screen')
      prepareHandoff().finally(() => setReady(true))
    })
  }, [router])

  const go = () => {
    funnel('app_coupon_cta', { meta: { src: 'after_signup', again: tapped } })
    setTapped(true)
    goToAppSignedIn()
  }

  return (
    <main className="min-h-[100dvh] bg-[#10182A] text-white flex flex-col px-6" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 48px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
      <img src="/washio-logo-dark.png" alt="Washio" className="h-10 w-auto self-start" />
      <div className="flex-1 flex flex-col justify-center">
        <p className="text-[13px] font-bold tracking-[1.6px] uppercase text-[#D4AF37]">Βήμα 2 από 2</p>
        <h1 className="text-[30px] font-extrabold leading-tight mt-2">Το −3€ σου είναι<br />στην εφαρμογή.</h1>
        <p className="text-[15px] text-white/70 mt-3 leading-relaxed">Κατέβασε το Washio. Ανοίγει με τον λογαριασμό σου, χωρίς νέα εγγραφή.</p>
        <ul className="mt-6 space-y-2.5 text-[15px] text-white/85">
          <li>✓ −3€ στο πρώτο πλύσιμο</li>
          <li>✓ Κλείνεις σε 10 δευτερόλεπτα</li>
          <li>✓ Ειδοποίηση πριν το ραντεβού</li>
        </ul>
      </div>
      <button onClick={go} disabled={!ready}
        className="w-full h-14 rounded-2xl bg-[#19A8C7] text-white text-[17px] font-bold disabled:opacity-60 active:opacity-90">
        {tapped ? 'Άνοιξε την εφαρμογή →' : 'Κατέβασε την εφαρμογή →'}
      </button>
      <button onClick={() => { funnel('app_coupon_skip'); router.replace('/map') }} className="w-full text-[13px] text-white/50 py-4">
        Συνέχεια στο web (χωρίς −3€)
      </button>
    </main>
  )
}
