'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell } from 'lucide-react'
import { isPushSupported, enablePush } from '@/lib/push-client'
import { useT } from '@/lib/i18n'

const T = {
  el: {
    title: 'Να σου θυμίζουμε;',
    sub: 'Ένα διακριτικό reminder όταν έρθει η ώρα για το επόμενο πλύσιμο. Χωρίς spam.',
    yes: 'Ναι, θύμισέ μου',
    no: 'Όχι ευχαριστώ',
    enabling: 'Ενεργοποίηση...',
    thanks: 'Έγινε! Θα σου θυμίσουμε όταν έρθει η ώρα.',
  },
  en: {
    title: 'Want a reminder?',
    sub: "A gentle nudge when it's time for your next wash. No spam.",
    yes: 'Yes, remind me',
    no: 'No thanks',
    enabling: 'Enabling...',
    thanks: "Done! We'll remind you when it's time.",
  },
}

const KEY = 'washio_push_reminder_v1'

// Opt-in για push reminders — εμφανίζεται μετά την κράτηση, μόνο αν το push
// υποστηρίζεται και ο χρήστης δεν έχει ήδη αποφασίσει.
export function PushReminderPrompt() {
  const t = useT(T)
  const [show, setShow] = useState(false)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    if (!isPushSupported()) return
    try { if (localStorage.getItem(KEY)) return } catch { /* ignore */ }
    if (typeof Notification !== 'undefined' && Notification.permission === 'denied') return
    createClient().auth.getUser().then(({ data }) => {
      if (data.user?.id) { setUserId(data.user.id); setShow(true) }
    }).catch(() => {})
  }, [])

  if (!show) return null

  const persist = (v: string) => { try { localStorage.setItem(KEY, v) } catch { /* ignore */ } }

  const enable = async () => {
    if (!userId) return
    setLoading(true)
    await enablePush(userId)
    setLoading(false)
    persist('done')
    setDone(true)
  }
  const dismiss = () => { persist('dismissed'); setShow(false) }

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 mt-2.5" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      {done ? (
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-gray-900 flex items-center justify-center shrink-0">
            <Bell size={16} color="white" />
          </div>
          <p className="text-[13px] font-semibold text-gray-900">{t.thanks}</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
              <Bell size={16} className="text-gray-900" />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold tracking-tight text-gray-900">{t.title}</p>
              <p className="text-[12px] text-gray-500 leading-snug mt-0.5">{t.sub}</p>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={enable}
              disabled={loading}
              className="flex-1 bg-gray-900 text-white text-[13px] font-semibold py-2.5 rounded-xl disabled:opacity-40"
            >
              {loading ? t.enabling : t.yes}
            </button>
            <button onClick={dismiss} className="px-4 text-[13px] font-medium text-gray-400">
              {t.no}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
