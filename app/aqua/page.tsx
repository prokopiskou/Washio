'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isNativeApp } from '@/lib/native-auth'

// QR του αρωματικού Aqua × Washio (washio.gr/aqua).
//  • Συνδεδεμένος → κατευθείαν «Κάλεσε φίλους» (κοινοποίηση του προσωπικού link).
//  • Μη συνδεδεμένος → 2 επιλογές: «Έχω λογαριασμό» (login → link) · «Πρώτη φορά» (χάρτης με −3€).
//  • Κινητό browser → και «Άνοιξε στην εφαρμογή» (custom scheme → η εφαρμογή ανοίγει το ίδιο path).
const REWARDS = '/profile/rewards?tab=referral&do=share&utm_source=aqua&utm_medium=print&utm_campaign=airfreshener'
const NEW_CUSTOMER = '/?ref=FLYER&utm_source=flyer&utm_medium=print&utm_campaign=aqua'
const APP_LINK = `gr.washio.app://auth-callback?open=${encodeURIComponent('/aqua')}`

export default function AquaPage() {
  const [state, setState] = useState<'loading' | 'guest'>('loading')
  const [mobileWeb, setMobileWeb] = useState(false)

  useEffect(() => {
    let alive = true
    setMobileWeb(!isNativeApp() && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent))
    createClient().auth.getSession().then(({ data }) => {
      if (!alive) return
      if (data.session?.user) window.location.replace(REWARDS)
      else setState('guest')
    }).catch(() => { if (alive) setState('guest') })
    return () => { alive = false }
  }, [])

  if (state === 'loading') {
    return <main className="min-h-screen bg-white flex items-center justify-center text-[13px] text-gray-400">Φόρτωση…</main>
  }

  return (
    <main className="min-h-screen bg-white flex justify-center">
      <div className="w-full max-w-md px-6 pt-[calc(var(--safe-top,0px)+36px)] pb-10 flex flex-col">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/washio-logo-h.png" alt="Washio" className="w-[130px] mx-auto" />
        <p className="text-center text-[11px] font-semibold tracking-[1.6px] uppercase text-gray-400 mt-3">Aqua × Washio</p>

        <h1 className="text-center text-[26px] font-bold tracking-tight text-gray-900 leading-[1.15] mt-7">
          Φέρε έναν φίλο.<br />Κερδίστε και οι δύο <span style={{ color: '#19A8C7' }}>−3€</span>
        </h1>
        <p className="text-center text-[14px] text-gray-500 mt-3 leading-relaxed">
          Ο φίλος σου παίρνει −3€ στο πρώτο του πλύσιμο — κι εσύ −3€ μόλις το ολοκληρώσει.
        </p>

        <div className="mt-9 flex flex-col gap-3">
          {mobileWeb && (
            <a href={APP_LINK} className="h-14 rounded-2xl text-white text-[15px] font-semibold flex items-center justify-center gap-2 active:opacity-85" style={{ background: '#19A8C7' }}>
              Άνοιξε στην εφαρμογή Washio
            </a>
          )}
          <a href={`/login?redirect=${encodeURIComponent(REWARDS)}`} className="h-14 rounded-2xl bg-gray-900 text-white text-[15px] font-semibold flex items-center justify-center active:opacity-85">
            Έχω λογαριασμό → πάρε το link σου
          </a>
          <a href={NEW_CUSTOMER} className="rounded-2xl border border-gray-200 px-4 py-3.5 text-center active:bg-gray-50">
            <span className="block text-[15px] font-semibold text-gray-900">Πρώτη φορά στο Washio;</span>
            <span className="block text-[13px] text-gray-500 mt-0.5">Κλείσε πλύσιμο με <b style={{ color: '#19A8C7' }}>−3€</b> → δες πλυντήρια κοντά σου</span>
          </a>
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-auto pt-10">washio.gr · πλύσιμο αυτοκινήτου με ένα tap</p>
      </div>
    </main>
  )
}
