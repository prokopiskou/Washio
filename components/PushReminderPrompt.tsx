'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell } from 'lucide-react'
import { isPushSupported, enablePush } from '@/lib/push-client'
import { registerNativePush, nativePushPermission } from '@/lib/native-push'
import { isNativeApp } from '@/lib/native-auth'
import { useT } from '@/lib/i18n'

const APP_STORE_URL = 'https://apps.apple.com/app/id6785925766'

const T = {
  el: {
    title: 'Να σε ειδοποιούμε;',
    sub: 'Υπενθυμίσεις για τα ραντεβού σου και προσφορές. Τίποτα άλλο.',
    yes: 'Ναι, ειδοποίησέ με',
    no: 'Όχι τώρα',
    enabling: 'Ενεργοποίηση...',
    thanks: 'Έγινε! Θα σε ειδοποιήσουμε πριν το ραντεβού.',
    denied: 'Εντάξει. Αν αλλάξεις γνώμη: Ρυθμίσεις → Washio → Ειδοποιήσεις.',
    iosTitle: 'Θες ειδοποίηση πριν το ραντεβού;',
    iosSub: 'Στο iPhone οι ειδοποιήσεις έρχονται μέσα από την εφαρμογή Washio. Θα σου στείλουμε και email.',
    iosCta: 'Κατέβασε την εφαρμογή',
  },
  en: {
    title: 'Want notifications?',
    sub: 'Reminders for your appointments and offers. Nothing else.',
    yes: 'Yes, notify me',
    no: 'Not now',
    enabling: 'Enabling...',
    thanks: "Done! We'll notify you before your appointment.",
    denied: 'OK. If you change your mind: Settings → Washio → Notifications.',
    iosTitle: 'Want a reminder before your appointment?',
    iosSub: "On iPhone, notifications come through the Washio app. We'll also email you.",
    iosCta: 'Get the app',
  },
}

const KEY = 'washio_push_reminder_v2'
const SNOOZE_DAYS = 7

type Mode = 'native' | 'web' | 'ios-web'

// Soft-ask για ειδοποιήσεις ΜΕΤΑ την κράτηση, με λόγο που αφορά τον χρήστη (υπενθύμιση
// ραντεβού). Στο iPhone το παράθυρο του συστήματος εμφανίζεται ΜΙΑ φορά, άρα το
// ζητάμε μόνο αφού πει «Ναι» εδώ. Καλύπτει: εφαρμογή (native), browser με web push,
// και iPhone browser (χωρίς push → πρόταση για την εφαρμογή).
export function PushReminderPrompt() {
  const t = useT(T)
  const [mode, setMode] = useState<Mode | null>(null)
  const [state, setState] = useState<'ask' | 'loading' | 'done' | 'denied'>('ask')
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const v = localStorage.getItem(KEY)
        if (v === 'done') return
        if (v && v.startsWith('snooze:') && Date.now() - Number(v.slice(7)) < SNOOZE_DAYS * 86400000) return
      } catch { /* ignore */ }

      let m: Mode | null = null
      if (isNativeApp()) {
        const perm = await nativePushPermission()
        if (perm === 'prompt') m = 'native'
        // granted → ήδη ενεργό · denied → μόνο από Ρυθμίσεις · unsupported → παλιό build
      } else if (isPushSupported()) {
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') m = 'web'
      } else if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        m = 'ios-web'
      }
      if (!m) return

      const { data } = await createClient().auth.getUser()
      if (cancelled || !data.user?.id) return
      setUserId(data.user.id)
      setMode(m)
    })()
    return () => { cancelled = true }
  }, [])

  if (!mode) return null

  const persist = (v: string) => { try { localStorage.setItem(KEY, v) } catch { /* ignore */ } }

  const enable = async () => {
    if (!userId) return
    setState('loading')
    let ok = false
    if (mode === 'native') ok = (await registerNativePush(userId, { ask: true })).ok
    else if (mode === 'web') ok = await enablePush(userId)
    persist('done')
    setState(ok ? 'done' : 'denied')
  }
  const dismiss = () => { persist('snooze:' + Date.now()); setMode(null) }

  const icon = (dark: boolean) => (
    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${dark ? 'bg-gray-900' : 'bg-gray-100'}`}>
      <Bell size={16} className={dark ? 'text-white' : 'text-gray-900'} />
    </div>
  )

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 mt-2.5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      {state === 'done' || state === 'denied' ? (
        <div className="flex items-center gap-2.5">
          {icon(state === 'done')}
          <p className="text-[13px] font-semibold text-gray-900">{state === 'done' ? t.thanks : t.denied}</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            {icon(false)}
            <div className="min-w-0">
              <p className="text-[14px] font-semibold tracking-tight text-gray-900">{mode === 'ios-web' ? t.iosTitle : t.title}</p>
              <p className="text-[12px] text-gray-500 leading-snug mt-0.5">{mode === 'ios-web' ? t.iosSub : t.sub}</p>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            {mode === 'ios-web' ? (
              <a
                href={APP_STORE_URL}
                onClick={() => persist('snooze:' + Date.now())}
                className="flex-1 bg-gray-900 text-white text-[13px] font-semibold py-2.5 rounded-xl text-center"
              >
                {t.iosCta}
              </a>
            ) : (
              <button
                onClick={enable}
                disabled={state === 'loading'}
                className="flex-1 bg-gray-900 text-white text-[13px] font-semibold py-2.5 rounded-xl disabled:opacity-40"
              >
                {state === 'loading' ? t.enabling : t.yes}
              </button>
            )}
            <button onClick={dismiss} className="px-4 text-[13px] font-medium text-gray-400">
              {t.no}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
