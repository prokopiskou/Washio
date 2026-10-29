'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { successHaptic, errorHaptic } from '@/lib/haptics'

// Σκάνερ QR για το dashboard του πλυντηρίου.
// Σκανάρει → POST /api/bookings/checkin → η κράτηση περνάει ΑΜΕΣΩΣ «Ήρθε» (χωρίς κουμπί).
// Κάμερα: getUserMedia + jsQR. Μέσα στις εφαρμογές χρειάζεται άδεια κάμερας στο build
// (iOS ≥ build 8, Android ≥ versionCode 7) — στα παλιά builds μόνο πληκτρολόγηση κωδικού.

export type CheckinBooking = {
  bookingId: string; ref: string; status: string; date: string; time: string; duration: number
  service: string; addons: string[]; plate: string; car: string; name: string; phone: string
  pay: 'card' | 'cash' | 'manual' | 'other'; collect: number; location: string; checkedInAt?: string
}
export type CheckinResult = { ok: boolean; already?: boolean; wasNoShow?: boolean; error?: string; booking?: CheckinBooking }

const IOS_MIN_BUILD = 8
const ANDROID_MIN_BUILD = 7

async function cameraAllowedHere(): Promise<boolean> {
  if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor
  if (!cap?.isNativePlatform?.()) return true
  try {
    const { App } = await import('@capacitor/app')
    const info = await App.getInfo()
    const build = parseInt(String(info.build), 10) || 0
    return cap.getPlatform?.() === 'ios' ? build >= IOS_MIN_BUILD : build >= ANDROID_MIN_BUILD
  } catch { return false }
}

export async function submitCheckin(code: string): Promise<CheckinResult> {
  try {
    const r = await fetch('/api/bookings/checkin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
    })
    return await r.json() as CheckinResult
  } catch {
    return { ok: false, error: 'Δεν υπάρχει σύνδεση. Δοκίμασε ξανά.' }
  }
}

export function CheckinResultCard({ res, onNext, nextLabel = 'Σκάναρε επόμενο' }: { res: CheckinResult; onNext?: () => void; nextLabel?: string }) {
  const b = res.booking
  const good = res.ok
  return (
    <div className="w-full">
      <div className="rounded-2xl p-4 text-center" style={{ background: good ? '#E7F6EF' : '#FCEAEA' }}>
        <div className="text-[30px] leading-none">{good ? '✓' : '✕'}</div>
        <p className="text-[17px] font-bold mt-1.5" style={{ color: good ? '#0F7A5C' : '#B43C3C' }}>
          {good ? (res.already ? 'Έχει ήδη σκαναριστεί' : 'Ήρθε — καταχωρήθηκε') : (res.error || 'Σφάλμα')}
        </p>
        {good && res.wasNoShow && <p className="text-[12px] mt-1" style={{ color: '#0F7A5C' }}>Είχε δηλωθεί «Δεν ήρθε» — διορθώθηκε.</p>}
      </div>

      {b && (
        <div className="mt-3 rounded-2xl border border-gray-100 bg-white divide-y divide-gray-100">
          <div className="px-4 py-3 flex items-baseline justify-between gap-3">
            <span className="text-[22px] font-bold text-gray-900">{b.time}</span>
            <span className="text-[12px] font-mono text-gray-500">{b.ref}</span>
          </div>
          {b.pay === 'cash' && (
            <div className="px-4 py-3" style={{ background: '#FFEDD5' }}>
              <p className="text-[15px] font-bold" style={{ color: '#C2410C' }}>💵 Εισπράττεις €{b.collect.toFixed(2)}</p>
            </div>
          )}
          {b.pay === 'card' && (
            <div className="px-4 py-3" style={{ background: '#E7F6EF' }}>
              <p className="text-[14px] font-semibold" style={{ color: '#0F7A5C' }}>💳 Πληρωμένη με κάρτα — μη ζητήσεις χρήματα</p>
            </div>
          )}
          <Row label="Υπηρεσία" value={b.service} strong />
          {b.addons.length > 0 && <Row label="Πρόσθετα" value={b.addons.join(', ')} />}
          <Row label="Αυτοκίνητο" value={[b.plate, b.car].filter(Boolean).join(' · ') || '—'} />
          <Row label="Πελάτης" value={b.name || '—'} />
          {b.phone && <Row label="Τηλέφωνο" value={<a href={`tel:${b.phone}`} className="text-blue-600">{b.phone}</a>} />}
        </div>
      )}

      {onNext && (
        <button onClick={onNext} className="mt-4 w-full h-12 rounded-xl bg-gray-900 text-white text-[14px] font-semibold active:opacity-80">
          {nextLabel}
        </button>
      )}
    </div>
  )
}

function Row({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className="px-4 py-2.5 flex items-start justify-between gap-3">
      <span className="text-[12px] text-gray-400 shrink-0 pt-0.5">{label}</span>
      <span className={`text-[14px] text-right text-gray-900 ${strong ? 'font-semibold' : ''}`}>{value}</span>
    </div>
  )
}

export default function CheckinScanner({ onClose, onCheckedIn }: {
  onClose: () => void
  onCheckedIn?: (b: CheckinBooking) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const busyRef = useRef(false)
  const [mode, setMode] = useState<'loading' | 'camera' | 'manual'>('loading')
  const [camError, setCamError] = useState('')
  const [result, setResult] = useState<CheckinResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState('')

  const stopCamera = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  const handleCode = useCallback(async (code: string) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    stopCamera()
    const res = await submitCheckin(code)
    setResult(res)
    setBusy(false)
    if (res.ok) { successHaptic(); if (res.booking) onCheckedIn?.(res.booking) } else errorHaptic()
  }, [onCheckedIn, stopCamera])

  const startCamera = useCallback(async () => {
    setCamError('')
    busyRef.current = false
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      streamRef.current = stream
      setMode('camera')
      const v = videoRef.current
      if (!v) return
      v.srcObject = stream
      v.setAttribute('playsinline', 'true')
      await v.play().catch(() => {})
      const jsQR = (await import('jsqr')).default
      const tick = () => {
        const video = videoRef.current, canvas = canvasRef.current
        if (!video || !canvas || !streamRef.current) return
        if (video.readyState >= 2 && video.videoWidth > 0 && !busyRef.current) {
          const w = 480, h = Math.round((video.videoHeight / video.videoWidth) * w) || 360
          canvas.width = w; canvas.height = h
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (ctx) {
            ctx.drawImage(video, 0, 0, w, h)
            const img = ctx.getImageData(0, 0, w, h)
            const qr = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })
            if (qr?.data) { handleCode(qr.data); return }
          }
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    } catch (e: unknown) {
      const name = (e as { name?: string })?.name || ''
      setCamError(name === 'NotAllowedError'
        ? 'Δεν δόθηκε άδεια κάμερας. Ενεργοποίησέ την από τις ρυθμίσεις και ξαναδοκίμασε — ή γράψε τον κωδικό.'
        : 'Η κάμερα δεν άνοιξε. Γράψε τον κωδικό της κράτησης.')
      setMode('manual')
    }
  }, [handleCode])

  useEffect(() => {
    let alive = true
    cameraAllowedHere().then(ok => {
      if (!alive) return
      if (ok) startCamera()
      else { setMode('manual'); setCamError('Η κάμερα θα δουλεύει στην επόμενη ενημέρωση της εφαρμογής. Προς το παρόν: γράψε τον κωδικό, ή άνοιξε το washio.gr/dashboard από τον browser.') }
    })
    return () => { alive = false; stopCamera() }
  }, [startCamera, stopCamera])

  const next = () => { setResult(null); setManual(''); if (mode === 'camera' || !camError) startCamera() }

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-end sm:items-center justify-center" onClick={() => { stopCamera(); onClose() }}>
      <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(var(--safe-bottom,0px)+20px)] max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[17px] font-bold text-gray-900">Σκανάρισμα πελάτη</p>
          <button onClick={() => { stopCamera(); onClose() }} className="w-9 h-9 rounded-full bg-gray-100 text-gray-700 text-[18px] leading-none">×</button>
        </div>

        {result ? (
          <CheckinResultCard res={result} onNext={next} />
        ) : (
          <>
            <div className={mode === 'camera' ? 'block' : 'hidden'}>
              <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black">
                <video ref={videoRef} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-[18%] border-[3px] border-white/90 rounded-2xl" />
                {busy && <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-[14px] font-semibold">Καταχώρηση…</div>}
              </div>
              <p className="text-[12px] text-gray-500 text-center mt-2.5">Στόχευσε το QR του πελάτη — καταχωρείται αυτόματα.</p>
            </div>
            <canvas ref={canvasRef} className="hidden" />
            {mode === 'loading' && <div className="h-40 flex items-center justify-center text-[13px] text-gray-400">Άνοιγμα κάμερας…</div>}
            {camError && <p className="text-[12px] text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5 mb-3">{camError}</p>}

            <form className="mt-3 flex gap-2" onSubmit={e => { e.preventDefault(); if (manual.trim()) handleCode(manual.trim()) }}>
              <input
                value={manual} onChange={e => setManual(e.target.value.toUpperCase())}
                placeholder="ή γράψε κωδικό π.χ. WS-2C9AC085"
                className="flex-1 h-11 px-3 rounded-xl border border-gray-200 text-[14px] font-mono uppercase"
                autoCapitalize="characters" autoCorrect="off" spellCheck={false}
              />
              <button type="submit" disabled={busy || !manual.trim()} className="h-11 px-4 rounded-xl bg-gray-900 text-white text-[13px] font-semibold disabled:opacity-40">OK</button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
