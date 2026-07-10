'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Star } from 'lucide-react'
import { useT } from '@/lib/i18n'

const T = {
  el: {
    title: 'Πώς σου φαίνεται το Washio;',
    sub: 'Βαθμολόγησε την εμπειρία σου.',
    lowTitle: 'Λυπόμαστε που δεν ήταν τέλεια.',
    lowSub: 'Πες μας τι πήγε στραβά — το διαβάζουμε προσωπικά και το διορθώνουμε.',
    placeholder: 'Το σχόλιό σου...',
    send: 'Αποστολή',
    sending: 'Αποστολή...',
    thanks: 'Ευχαριστούμε για το feedback!',
    later: 'Όχι τώρα',
  },
  en: {
    title: 'How do you like Washio?',
    sub: 'Rate your experience.',
    lowTitle: 'Sorry it wasn’t perfect.',
    lowSub: 'Tell us what went wrong — we read it personally and fix it.',
    placeholder: 'Your comment...',
    send: 'Send',
    sending: 'Sending...',
    thanks: 'Thanks for the feedback!',
    later: 'Not now',
  },
}

const STORAGE_KEY = 'washio_app_rating_v1'
const APPLE_ID = '6785925766'
const ANDROID_PKG = 'gr.washio.app'
const RENAG_MS = 14 * 24 * 60 * 60 * 1000 // 14 μέρες πριν ξαναρωτήσουμε

function storeReviewUrl(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  if (/android/i.test(ua)) return `https://play.google.com/store/apps/details?id=${ANDROID_PKG}`
  return `https://apps.apple.com/app/id${APPLE_ID}?action=write-review`
}

/**
 * Prompt αξιολόγησης — εμφανίζεται σε repeat users (≥2 κρατήσεις).
 * GATED REVIEW: μέσα στο popup ο χρήστης βαθμολογεί.
 *  - 4-5★  → τον στέλνουμε στο πραγματικό review στο App Store / Google Play.
 *  - 1-3★  → ΔΕΝ πάει στο store· ζητάμε εσωτερικό feedback (email σε εμάς).
 * Δεν ξαναενοχλεί αν ολοκληρωθεί (done) ή για 14 μέρες μετά το «Όχι τώρα».
 */
export function AppRatingPrompt() {
  const t = useT(T)
  const [show, setShow] = useState(false)
  const [view, setView] = useState<'stars' | 'low' | 'thanks'>('stars')
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)
  const emailRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'done') return
      if (stored && stored.startsWith('later:')) {
        const ts = Number(stored.slice(6))
        if (!isNaN(ts) && Date.now() - ts < RENAG_MS) return
      }
    } catch { /* localStorage μη διαθέσιμο — συνέχισε */ }

    const check = async () => {
      const supabase = createClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData.session?.user
      if (!user) return
      emailRef.current = user.email ?? null

      // Repeat user: έχει κλείσει ≥2 φορές (χωρίς τις ακυρωμένες).
      const { count } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .neq('status', 'cancelled')

      if ((count ?? 0) >= 2 && !cancelled) {
        setTimeout(() => { if (!cancelled) setShow(true) }, 1400)
      }
    }
    check()

    return () => { cancelled = true }
  }, [])

  if (!show) return null

  const persist = (v: string) => { try { localStorage.setItem(STORAGE_KEY, v) } catch { /* ignore */ } }
  const later = () => { persist('later:' + Date.now()); setShow(false) }

  const handleStar = (n: number) => {
    setRating(n)
    if (n >= 4) {
      // Happy → πραγματικό review στο store.
      persist('done')
      window.open(storeReviewUrl(), '_blank', 'noopener,noreferrer')
      setShow(false)
    } else {
      // 1-3★ → εσωτερικά, ΟΧΙ store.
      setView('low')
    }
  }

  const submitLow = async () => {
    persist('done')
    setSending(true)
    try {
      await fetch('/api/app-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, comment: comment.trim() || null, email: emailRef.current }),
      })
    } catch { /* ignore — έχουμε ήδη κλείσει το prompt */ }
    setSending(false)
    setView('thanks')
    setTimeout(() => setShow(false), 1600)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={later} />
      <div className="relative bg-white rounded-t-3xl px-6 pt-7 pb-10 w-full max-w-md z-10 text-center">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-6" />

        {view === 'stars' && (
          <>
            <p className="text-[18px] font-bold tracking-tight text-gray-900">{t.title}</p>
            <p className="text-[13px] text-gray-500 leading-relaxed mt-2 mb-6 px-2">{t.sub}</p>

            <div className="flex items-center justify-center gap-2 mb-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" onClick={() => handleStar(n)} className="p-1">
                  <Star
                    size={36}
                    strokeWidth={1.75}
                    className={n <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'}
                  />
                </button>
              ))}
            </div>

            <button onClick={later} className="mt-5 text-[13px] font-medium text-gray-400">
              {t.later}
            </button>
          </>
        )}

        {view === 'low' && (
          <>
            <p className="text-[18px] font-bold tracking-tight text-gray-900">{t.lowTitle}</p>
            <p className="text-[13px] text-gray-500 leading-relaxed mt-2 mb-5 px-2">{t.lowSub}</p>

            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={t.placeholder}
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-gray-400 text-left"
            />

            <button
              onClick={submitLow}
              disabled={sending}
              className="w-full bg-gray-900 text-white text-[15px] font-semibold py-3.5 rounded-xl mt-4 disabled:opacity-40"
            >
              {sending ? t.sending : t.send}
            </button>
            <button onClick={later} className="mt-3 text-[13px] font-medium text-gray-400">
              {t.later}
            </button>
          </>
        )}

        {view === 'thanks' && (
          <div className="py-6">
            <div className="flex items-center justify-center gap-1.5 mb-4">
              <Star size={28} className="text-amber-400 fill-amber-400" />
            </div>
            <p className="text-[16px] font-semibold text-gray-900">{t.thanks}</p>
          </div>
        )}
      </div>
    </div>
  )
}
