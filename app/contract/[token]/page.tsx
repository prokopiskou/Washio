'use client'

import { use, useEffect, useRef, useState } from 'react'

// Δημόσια σελίδα υπογραφής Συμφωνητικού Συνεργασίας (link από email).
// Διάβασμα → ονοματεπώνυμο + υπογραφή με το δάχτυλο + αποδοχή → κωδικός στο email → Υπογραφή.
type Block = { kind: 'title' | 'subtitle' | 'heading' | 'p' | 'li'; text: string }
type Data = {
  status: string; version: string; emailMasked: string; washioSignedAt: string; signedAt: string | null; signerName: string | null
  fields: { date: string; businessName: string; afm: string; doy: string; address: string; contactName: string; promoMonths: number }
  blocks: Block[]
}

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const c = ref.current!
    const dpr = window.devicePixelRatio || 1
    const r = c.getBoundingClientRect()
    c.width = r.width * dpr; c.height = r.height * dpr
    const ctx = c.getContext('2d')!
    ctx.scale(dpr, dpr); ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#10182A'
  }, [])

  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const down = (e: React.PointerEvent) => { e.preventDefault(); ref.current!.setPointerCapture(e.pointerId); drawing.current = true; last.current = pos(e) }
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return
    const p = pos(e), ctx = ref.current!.getContext('2d')!
    ctx.beginPath(); ctx.moveTo(last.current!.x, last.current!.y); ctx.lineTo(p.x, p.y); ctx.stroke()
    last.current = p; dirty.current = true
  }
  const up = () => { if (!drawing.current) return; drawing.current = false; if (dirty.current) onChange(ref.current!.toDataURL('image/png')) }
  const clear = () => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); dirty.current = false; onChange(null) }

  return (
    <div>
      <div className="relative rounded-2xl border-2 border-dashed border-gray-300 bg-white">
        <canvas ref={ref} className="w-full h-44 touch-none rounded-2xl" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} />
        <span className="pointer-events-none absolute left-4 bottom-3 text-[11px] text-gray-300">Υπογράψτε εδώ με το δάχτυλο</span>
      </div>
      <button type="button" onClick={clear} className="mt-1.5 text-[12px] text-gray-500 underline">Καθαρισμός</button>
    </div>
  )
}

export default function ContractPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [d, setD] = useState<Data | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [name, setName] = useState('')
  const [sig, setSig] = useState<string | null>(null)
  const [accept, setAccept] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/contract/${token}`, { cache: 'no-store' }).then(async r => {
      const j = await r.json().catch(() => ({}))
      if (!alive) return
      if (!r.ok) { setLoadErr(j.error || 'Το link δεν είναι έγκυρο.'); return }
      setD(j); setName(n => n || j.fields?.contactName || '')
    })
    return () => { alive = false }
  }, [token])

  const ready = name.trim().length >= 3 && !!sig && accept
  const requestOtp = async () => {
    setBusy(true); setErr('')
    const r = await fetch(`/api/contract/${token}/otp`, { method: 'POST' })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(j.error || 'Σφάλμα'); return }
    setOtpSent(true)
  }
  const sign = async () => {
    setBusy(true); setErr('')
    const r = await fetch(`/api/contract/${token}/sign`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ otp, signerName: name, signature: sig, accept }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(j.error || 'Σφάλμα'); return }
    setDone(true); window.scrollTo({ top: 0 })
  }

  if (loadErr) return <main className="min-h-screen flex items-center justify-center p-6 text-center"><p className="text-[15px] text-gray-600">{loadErr}</p></main>
  if (!d) return <main className="min-h-screen flex items-center justify-center"><p className="text-[14px] text-gray-400">Φόρτωση…</p></main>

  const signed = done || d.status === 'signed'
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
        <p className="text-[18px] font-extrabold tracking-tight text-gray-900 mb-4">Washio</p>

        {signed ? (
          <div className="rounded-2xl bg-white border border-green-200 p-5 mb-5">
            <p className="text-[20px] font-bold text-gray-900">✓ Υπογράφηκε</p>
            <p className="text-[14px] text-gray-600 mt-1.5 leading-relaxed">Το Συμφωνητικό Συνεργασίας υπογράφηκε από αμφότερα τα μέρη. Στείλαμε αντίγραφο στο email σας ({d.emailMasked}).</p>
            <a href={`/api/contract/${token}/pdf`} className="mt-4 inline-flex h-11 items-center px-5 rounded-xl bg-gray-900 text-white text-[14px] font-semibold">Κατέβασμα PDF</a>
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
            <p className="text-[15px] font-semibold text-gray-900">Συμφωνητικό Συνεργασίας για «{d.fields.businessName}»</p>
            <p className="text-[13px] text-gray-500 mt-1">Ήδη υπογεγραμμένο από τη Washio. Διαβάστε το και υπογράψτε στο τέλος της σελίδας.</p>
          </div>
        )}

        {/* Κείμενο */}
        <article className="rounded-2xl bg-white border border-gray-200 p-5 text-[14px] leading-relaxed text-gray-800">
          {d.blocks.map((b, i) => {
            if (b.kind === 'title') return <h1 key={i} className="text-center text-[18px] font-bold tracking-tight">{b.text}</h1>
            if (b.kind === 'subtitle') return <p key={i} className="text-center text-gray-500 mb-4">{b.text}</p>
            if (b.kind === 'heading') return <h2 key={i} className="font-bold mt-5 mb-1.5 text-[15px]">{b.text}</h2>
            if (b.kind === 'li') return <p key={i} className="pl-4 mb-1.5 relative"><span className="absolute left-0">•</span>{b.text}</p>
            return <p key={i} className="mb-2">{b.text}</p>
          })}
          <div className="mt-6 grid grid-cols-2 gap-4 text-[12px]">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
              <p className="font-semibold text-gray-700 mb-1">Για τη Washio</p>
              <p className="text-[17px] italic text-blue-700">Προκόπιος Κούκης</p>
              <p className="text-blue-700 font-semibold mt-1">Ψηφιακά υπογεγραμμένο</p>
              <p className="text-blue-700">{new Date(d.washioSignedAt).toLocaleString('el-GR', { timeZone: 'Europe/Athens' })}</p>
            </div>
            <div className="rounded-xl border border-gray-200 p-3">
              <p className="font-semibold text-gray-700 mb-1">Για τον Συνεργάτη</p>
              <p className="text-gray-500">{signed ? `✓ ${d.signerName || name}` : 'Προς υπογραφή'}</p>
            </div>
          </div>
        </article>

        {!signed && (
          <section className="mt-5 rounded-2xl bg-white border border-gray-200 p-4 space-y-4">
            <p className="text-[16px] font-bold text-gray-900">Υπογραφή</p>
            <label className="block">
              <span className="text-[12px] font-semibold text-gray-600">Ονοματεπώνυμο υπογράφοντος</span>
              <input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full h-11 px-3 rounded-xl border border-gray-300 text-[15px]" />
            </label>
            <SignaturePad onChange={setSig} />
            <label className="flex items-start gap-2.5 text-[13px] text-gray-700 leading-snug">
              <input type="checkbox" checked={accept} onChange={e => setAccept(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0" />
              <span>Διάβασα και αποδέχομαι τους όρους του Συμφωνητικού Συνεργασίας και δηλώνω ότι είμαι νόμιμος εκπρόσωπος της επιχείρησης «{d.fields.businessName}» (ΑΦΜ {d.fields.afm}).</span>
            </label>

            {!otpSent ? (
              <button disabled={!ready || busy} onClick={requestOtp} className="w-full h-12 rounded-xl bg-gray-900 text-white text-[15px] font-semibold disabled:opacity-40">
                {busy ? 'Αποστολή…' : 'Συνέχεια — στείλε μου κωδικό'}
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-[13px] text-gray-600">Στείλαμε κωδικό 6 ψηφίων στο <b>{d.emailMasked}</b>. Ισχύει 10 λεπτά.</p>
                <input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="••••••"
                  className="w-full h-12 px-3 rounded-xl border border-gray-300 text-center text-[22px] tracking-[8px] font-semibold" />
                <button disabled={!ready || otp.length !== 6 || busy} onClick={sign} className="w-full h-12 rounded-xl bg-green-600 text-white text-[15px] font-semibold disabled:opacity-40">
                  {busy ? 'Υπογραφή…' : '✍️ Υπογραφή συμφωνητικού'}
                </button>
                <button disabled={busy} onClick={requestOtp} className="text-[12px] text-gray-500 underline">Δεν ήρθε; Ξαναστείλε κωδικό</button>
              </div>
            )}
            {err && <p className="text-[13px] text-red-600">{err}</p>}
            <p className="text-[11px] text-gray-400 leading-relaxed">Ηλεκτρονική υπογραφή κατά τον Κανονισμό (ΕΕ) 910/2014 (eIDAS). Καταγράφονται ημερομηνία/ώρα, IP και συσκευή ως αποδεικτικό της υπογραφής.</p>
          </section>
        )}
      </div>
    </main>
  )
}
