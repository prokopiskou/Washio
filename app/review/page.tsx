'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'

const APP_STORE_URL = 'https://apps.apple.com/app/id6785925766?action=write-review'
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=gr.washio.app'

function storeUrl(): string {
  if (typeof navigator === 'undefined') return APP_STORE_URL
  const ua = navigator.userAgent || ''
  if (/Android/i.test(ua)) return PLAY_STORE_URL
  return APP_STORE_URL // iOS + default (το iOS app είναι live)
}

function ReviewInner() {
  const params = useSearchParams()
  const bookingRef = params.get('ref') || ''
  const initial = Math.min(5, Math.max(0, Math.round(Number(params.get('rating')) || 0)))

  const [rating, setRating] = useState(initial)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sentLow, setSentLow] = useState(false)

  const shown = hover || rating
  const high = rating >= 4
  const low = rating > 0 && rating <= 3

  const goStore = async () => {
    // Καταγραφή (best-effort) και redirect στο store.
    setLoading(true)
    try {
      fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: bookingRef, rating }),
      }).catch(() => null)
    } finally {
      window.location.href = storeUrl()
    }
  }

  const submitLow = async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: bookingRef, rating, comment }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Κάτι πήγε στραβά'); return }
      setSentLow(true)
    } catch {
      setError('Πρόβλημα σύνδεσης. Δοκίμασε ξανά.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-[400px]">
        <div className="rounded-t-2xl bg-[#0A0A0A] py-7 text-center">
          <h1 className="text-white text-[22px] font-semibold tracking-tight">washio</h1>
        </div>

        <div className="rounded-b-2xl bg-white border border-t-0 border-gray-100 px-6 py-8 text-center">
          {sentLow ? (
            <>
              <div className="text-[40px] mb-2">🙏</div>
              <h2 className="text-[19px] font-bold text-gray-900">Ευχαριστούμε!</h2>
              <p className="text-[14px] text-gray-500 mt-2 leading-relaxed">
                Το feedback σου πάει κατευθείαν στην ομάδα μας και θα το φροντίσουμε.
              </p>
              <a href="https://www.washio.gr" className="mt-6 inline-block w-full h-12 leading-[48px] rounded-xl bg-gray-900 text-white text-[14px] font-semibold">
                Νέα κράτηση →
              </a>
            </>
          ) : (
            <>
              <div className="text-[34px] mb-2">✨</div>
              <h2 className="text-[19px] font-bold text-gray-900">Πώς πήγε το πλύσιμο;</h2>
              <p className="text-[13px] text-gray-400 mt-1.5">Η γνώμη σου μετράει.</p>

              {/* Αστέρια — κεντραρισμένα, μεγάλα, editable */}
              <div className="flex items-center justify-center gap-2.5 mt-6" onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    onMouseEnter={() => setHover(n)}
                    onClick={() => setRating(n)}
                    aria-label={`${n} αστέρια`}
                    className="leading-none transition-transform active:scale-90"
                    style={{ fontSize: 40, color: n <= shown ? '#F5A623' : '#E2E5EA' }}
                  >
                    ★
                  </button>
                ))}
              </div>

              {/* 4-5★ → store review */}
              {high && (
                <div className="mt-6">
                  <p className="text-[14px] text-gray-600 leading-relaxed">
                    Χαιρόμαστε που το απόλαυσες! 🎉<br />Βοήθησέ μας με μια αξιολόγηση — παίρνει 10 δευτερόλεπτα.
                  </p>
                  <button
                    onClick={goStore}
                    disabled={loading}
                    className="mt-4 w-full h-12 rounded-xl bg-gray-900 text-white text-[14px] font-semibold disabled:opacity-50"
                  >
                    {loading ? 'Μεταφορά...' : 'Αξιολόγησε το Washio ⭐'}
                  </button>
                </div>
              )}

              {/* 1-3★ → ιδιωτικό feedback */}
              {low && (
                <div className="mt-5 text-left">
                  <p className="text-[13px] font-medium text-gray-500 text-center">Λυπούμαστε — τι πήγε στραβά;</p>
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    rows={4}
                    placeholder="Πες μας τι δεν πήγε καλά — θα το διορθώσουμε."
                    className="w-full mt-2.5 rounded-xl border border-gray-200 px-3.5 py-3 text-[14px] text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400 resize-none"
                  />
                  {error && <p className="text-[12px] text-red-500 mt-2 text-center">{error}</p>}
                  <button
                    onClick={submitLow}
                    disabled={loading}
                    className="mt-3 w-full h-12 rounded-xl bg-gray-900 text-white text-[14px] font-semibold disabled:opacity-50"
                  >
                    {loading ? 'Αποστολή...' : 'Στείλε το feedback'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  )
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-gray-50" />}>
      <ReviewInner />
    </Suspense>
  )
}
