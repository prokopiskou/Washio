'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isNativeApp } from '@/lib/native-auth'
import { nativePushPermission, registerNativePush, requestNativePushPermission } from '@/lib/native-push'
import { useT } from '@/lib/i18n'

// Ερώτηση για ειδοποιήσεις στο ΠΡΩΤΟ άνοιγμα της εφαρμογής (iOS/Android), με λόγο που αφορά
// τον χρήστη. Το παράθυρο του συστήματος εμφανίζεται ΜΟΝΟ αφού πει «Ναι» εδώ (στο iPhone
// το σύστημα ρωτά μία φορά). Επισκέπτες: δίνουν άδεια τώρα, το token καταχωρείται όταν συνδεθούν.
// Επίσης: σε κάθε άνοιγμα/σύνδεση με ήδη δοσμένη άδεια → ανανέωση token (σιωπηλά).

const T = {
  el: {
    title: 'Να σε ειδοποιούμε;',
    sub: 'Υπενθυμίσεις για τα ραντεβού σου και προσφορές. Τίποτα άλλο.',
    yes: 'Ναι, ειδοποίησέ με',
    no: 'Όχι τώρα',
    enabling: 'Ενεργοποίηση...',
  },
  en: {
    title: 'Want notifications?',
    sub: 'Reminders for your appointments and offers. Nothing else.',
    yes: 'Yes, notify me',
    no: 'Not now',
    enabling: 'Enabling...',
  },
}

const KEY = 'washio_push_onboard_v1'
const SNOOZE_DAYS = 7
const DELAY_MS = 4000 // πρώτα βλέπει τον χάρτη, μετά ρωτάμε
// Όχι σε σελίδες όπου ρωτάμε ήδη ή δεν ταιριάζει (πλυντήριο/admin/σύνδεση/επιβεβαίωση κράτησης).
const SKIP = ['/dashboard', '/admin', '/login', '/auth', '/booking/confirmed', '/onboarding']

export function NativePushOnboard() {
  const t = useT(T)
  const pathname = usePathname() || '/'
  const [show, setShow] = useState(false)
  const [loading, setLoading] = useState(false)

  // Σιωπηλή εγγραφή token όποτε υπάρχει σύνδεση + άδεια (και μετά από login επισκέπτη).
  useEffect(() => {
    if (!isNativeApp()) return
    const supabase = createClient()
    const sync = (uid?: string | null) => { if (uid) registerNativePush(uid, { ask: false }).catch(() => null) }
    supabase.auth.getSession().then(({ data }) => sync(data.session?.user?.id))
    const { data: sub } = supabase.auth.onAuthStateChange((ev, session) => {
      if (ev === 'SIGNED_IN') sync(session?.user?.id)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!isNativeApp() || SKIP.some(p => pathname.startsWith(p))) return
    try {
      const v = localStorage.getItem(KEY)
      if (v === 'done') return
      if (v && v.startsWith('snooze:') && Date.now() - Number(v.slice(7)) < SNOOZE_DAYS * 86400000) return
    } catch { /* ignore */ }
    let cancelled = false
    const tm = setTimeout(async () => {
      if ((await nativePushPermission()) === 'prompt' && !cancelled) setShow(true)
    }, DELAY_MS)
    return () => { cancelled = true; clearTimeout(tm) }
  }, [pathname])

  if (!show) return null

  const persist = (v: string) => { try { localStorage.setItem(KEY, v) } catch { /* ignore */ } }

  const accept = async () => {
    setLoading(true)
    const { data } = await createClient().auth.getSession()
    const uid = data.session?.user?.id
    if (uid) await registerNativePush(uid, { ask: true })
    else await requestNativePushPermission()
    persist('done')
    setShow(false)
  }
  const dismiss = () => { persist('snooze:' + Date.now()); setShow(false) }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40" onClick={dismiss}>
      <div
        className="w-full max-w-md bg-white rounded-t-3xl px-6 pt-6"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="w-12 h-12 rounded-full bg-gray-900 flex items-center justify-center mx-auto mb-4">
          <Bell size={22} className="text-white" />
        </div>
        <p className="text-[19px] font-bold tracking-tight text-gray-900 text-center">{t.title}</p>
        <p className="text-[14px] text-gray-500 leading-snug text-center mt-1.5">{t.sub}</p>
        <button
          onClick={accept}
          disabled={loading}
          className="w-full mt-5 bg-gray-900 text-white text-[15px] font-semibold py-3.5 rounded-2xl disabled:opacity-40"
        >
          {loading ? t.enabling : t.yes}
        </button>
        <button onClick={dismiss} className="w-full mt-2 py-2.5 text-[14px] font-medium text-gray-400">
          {t.no}
        </button>
      </div>
    </div>
  )
}
