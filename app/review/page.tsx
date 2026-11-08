'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

// Κριτική πλυντηρίου — ανοίγει από push / email / SMS / κάρτα αρχικής.
// Το πάτημα αστεριού ΑΠΟΘΗΚΕΥΕΙ αμέσως (και αν φύγει μετά). Σχόλιο προαιρετικό.

const APP_STORE_URL = 'https://apps.apple.com/app/id6785925766?action=write-review'
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=gr.washio.app'
const storeUrl = () => (typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '')) ? PLAY_STORE_URL : APP_STORE_URL

function ReviewInner() {
  const params = useSearchParams()
  const ref = params.get('ref') || ''
  const t = params.get('t') || ''
  const initial = Math.min(5, Math.max(0, Math.round(Number(params.get('rating')) || 0)))

  const [place, setPlace] = useState('')
  const [rating, setRating] = useState(initial)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [saved, setSaved] = useState(0) // βαθμολογία που αποθηκεύτηκε
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const autoSent = useRef(false)

  const save = async (r: number, text?: string) => {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref, t, rating: r, comment: text }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setError(j.error || 'Κάτι πήγε στραβά'); return false }
      setSaved(r); return true
    } catch { setError('Πρόβλημα σύνδεσης. Δοκίμασε ξανά.'); return false } finally { setBusy(false) }
  }

  useEffect(() => {
    let alive = true
    fetch(`/api/review?ref=${encodeURIComponent(ref)}&t=${encodeURIComponent(t)}`).then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return
        if (!ok) { setError(j.error || 'Το link δεν ισχύει'); return }
        setPlace(j.location || '')
        if (j.comment) setComment(j.comment)
        if (initial && !autoSent.current) { autoSent.current = true; save(initial) }
        else if (j.rating) { setRating(j.rating); setSaved(j.rating) }
      }).catch(() => {})
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, t])

  const pick = (n: number) => { setRating(n); save(n, comment || undefined) }
  const shown = hover || rating
  const high = saved >= 4

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-[400px]">
        <div className="rounded-t-2xl bg-[#10182A] py-7 text-center">
          <h1 className="text-white text-[22px] font-semibold tracking-tight">washio</h1>
        </div>
        <div className="rounded-b-2xl bg-white border border-t-0 border-gray-100 px-6 py-8 text-center">
          {done ? (
            <>
              <div className="text-[40px] mb-2">🙏</div>
              <h2 className="text-[19px] font-bold text-gray-900">Ευχαριστούμε!</h2>
              <p className="text-[14px] text-gray-500 mt-2 leading-relaxed">
                {high ? `Η κριτική σου βοηθάει το ${place || 'πλυντήριο'} και τους επόμενους πελάτες.` : 'Το είδαμε. Θα το κοιτάξουμε με το πλυντήριο.'}
              </p>
              {high && (
                <a href={storeUrl()} className="mt-6 block w-full h-12 leading-[48px] rounded-xl border border-gray-200 text-gray-900 text-[14px] font-semibold">
                  Βαθμολόγησε και την εφαρμογή ⭐
                </a>
              )}
              <Link href="/" className="mt-3 block w-full h-12 leading-[48px] rounded-xl bg-gray-900 text-white text-[14px] font-semibold">Νέα κράτηση →</Link>
            </>
          ) : (
            <>
              <h2 className="text-[19px] font-bold text-gray-900">{place ? `Πώς ήταν το ${place};` : 'Πώς πήγε το πλύσιμο;'}</h2>
              <p className="text-[13px] text-gray-400 mt-1.5">Ένα πάτημα. Μετράει.</p>

              <div className="flex items-center justify-center gap-2.5 mt-6" onMouseLeave={() => setHover(0)}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" onMouseEnter={() => setHover(n)} onClick={() => pick(n)} disabled={busy && !saved}
                    aria-label={`${n} αστέρια`} className="leading-none transition-transform active:scale-90"
                    style={{ fontSize: 42, color: n <= shown ? '#F5A623' : '#E2E5EA' }}>★</button>
                ))}
              </div>

              {saved > 0 && (
                <div className="mt-6 text-left">
                  <p className="text-[13px] font-medium text-gray-500 text-center">
                    {high ? '✓ Αποθηκεύτηκε. Θες να πεις κάτι ακόμα;' : 'Λυπούμαστε. Τι πήγε στραβά;'}
                  </p>
                  <textarea value={comment} onChange={e => setComment(e.target.value.slice(0, 600))} rows={3}
                    placeholder={high ? 'Π.χ. γρήγοροι, προσεκτικοί στο εσωτερικό… (προαιρετικό)' : 'Πες μας — θα το λύσουμε με το πλυντήριο.'}
                    className="w-full mt-2.5 rounded-xl border border-gray-200 px-3.5 py-3 text-[14px] text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400 resize-none" />
                  <button onClick={async () => { if (!comment.trim() || await save(saved, comment)) setDone(true) }} disabled={busy}
                    className="mt-3 w-full h-12 rounded-xl bg-gray-900 text-white text-[14px] font-semibold disabled:opacity-50">
                    {busy ? 'Αποθήκευση…' : comment.trim() ? 'Αποστολή' : 'Τέλος'}
                  </button>
                </div>
              )}
              {error && <p className="text-[12px] text-red-500 mt-3 text-center">{error}</p>}
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
