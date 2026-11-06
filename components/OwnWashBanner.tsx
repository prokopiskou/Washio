'use client'

import { useEffect, useState } from 'react'
import { X, Check, ChevronRight, Store } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BL_AREAS, BL_TIMINGS, BL_INTENTS } from '@/lib/business-leads'

// Banner αρχικής: «Απόκτησε το δικό σου πλυντήριο αυτοκινήτων» → φόρμα (bottom sheet):
// περιοχή Αττικής · πόσο άμεσα · αγορά/μίσθωση/δημιουργία · ονοματεπώνυμο · κινητό.
export function OwnWashBanner() {
  const [open, setOpen] = useState(false)
  const [area, setArea] = useState('')
  const [timing, setTiming] = useState('')
  const [intent, setIntent] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  // Προσυμπλήρωση από το προφίλ (αν είναι συνδεδεμένος).
  useEffect(() => {
    if (!open || userId) return
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) return
        setUserId(session.user.id)
        const { data: p } = await supabase.from('profiles').select('full_name, phone').eq('id', session.user.id).maybeSingle()
        if (p?.full_name) setName(n => n || p.full_name)
        if (p?.phone) setPhone(x => x || p.phone)
      } catch { /* ignore */ }
    })()
  }, [open, userId])

  const ready = area && timing && intent && name.trim().length >= 3 && phone.replace(/\D/g, '').length >= 10

  const submit = async () => {
    if (!ready || busy) return
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/business-leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area, timing, intent, name, phone, userId }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setErr(j.error || 'Κάτι πήγε στραβά'); else setDone(true)
    } catch { setErr('Πρόβλημα σύνδεσης') }
    setBusy(false)
  }

  const Chip = ({ v, cur, set }: { v: string; cur: string; set: (s: string) => void }) => (
    <button type="button" onClick={() => set(v)}
      className={`px-3.5 h-10 rounded-full text-[14px] font-semibold border transition-colors ${cur === v ? 'bg-washio-navy text-white border-washio-navy' : 'bg-white text-washio-navy border-washio-border'}`}>
      {v}
    </button>
  )

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="w-full rounded-[20px] p-4 flex items-center gap-3.5 text-left"
        style={{ background: 'linear-gradient(135deg, #10182A 0%, #0E4A63 100%)', boxShadow: '0 6px 20px rgba(16,24,42,0.18)' }}>
        <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center shrink-0">
          <Store size={20} className="text-white" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-white leading-snug">Απόκτησε το δικό σου πλυντήριο αυτοκινήτων</p>
          <p className="text-[12px] text-white/70 mt-0.5">Αγορά, μίσθωση ή νέο — σε βοηθάμε να ξεκινήσεις</p>
        </div>
        <ChevronRight size={20} className="text-white/80 shrink-0" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40" onClick={() => !busy && setOpen(false)}>
          <div className="w-full max-w-md bg-white rounded-t-[24px] p-5 pb-8 max-h-[90vh] overflow-y-auto"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[19px] font-bold text-washio-navy leading-snug">Απόκτησε το δικό σου πλυντήριο αυτοκινήτων</h3>
              <button onClick={() => setOpen(false)} aria-label="Κλείσιμο" className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <X size={16} className="text-gray-600" />
              </button>
            </div>

            {done ? (
              <div className="py-8 flex flex-col items-center text-center gap-3">
                <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center"><Check size={28} className="text-green-700" /></div>
                <p className="text-[17px] font-semibold text-washio-navy">Ευχαριστούμε, {name.split(' ')[0]}!</p>
                <p className="text-[14px] text-gray-500">Θα σε καλέσουμε σύντομα στο {phone}.</p>
                <button onClick={() => setOpen(false)} className="mt-2 h-11 px-6 rounded-full bg-washio-navy text-white text-[14px] font-semibold">Κλείσιμο</button>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-5">
                <div>
                  <p className="text-[12px] font-bold tracking-[1.2px] uppercase text-gray-500 mb-2">Περιοχή ενδιαφέροντος (Αττική)</p>
                  <div className="flex flex-wrap gap-2">{BL_AREAS.map(v => <Chip key={v} v={v} cur={area} set={setArea} />)}</div>
                </div>
                <div>
                  <p className="text-[12px] font-bold tracking-[1.2px] uppercase text-gray-500 mb-2">Πόσο άμεσα;</p>
                  <div className="flex flex-wrap gap-2">{BL_TIMINGS.map(v => <Chip key={v} v={v} cur={timing} set={setTiming} />)}</div>
                </div>
                <div>
                  <p className="text-[12px] font-bold tracking-[1.2px] uppercase text-gray-500 mb-2">Ενδιαφέρομαι για</p>
                  <div className="flex flex-wrap gap-2">{BL_INTENTS.map(v => <Chip key={v} v={v} cur={intent} set={setIntent} />)}</div>
                </div>
                <div className="flex flex-col gap-2.5">
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Ονοματεπώνυμο" autoComplete="name"
                    className="h-12 px-4 rounded-xl border border-washio-border text-[16px] text-washio-navy" />
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Κινητό" inputMode="tel" autoComplete="tel"
                    className="h-12 px-4 rounded-xl border border-washio-border text-[16px] text-washio-navy" />
                </div>
                {err && <p className="text-[13px] text-red-600">{err}</p>}
                <button onClick={submit} disabled={!ready || busy}
                  className="h-12 rounded-full bg-washio-cyan text-white text-[15px] font-semibold disabled:opacity-40">
                  {busy ? 'Αποστολή…' : 'Θέλω να με καλέσετε'}
                </button>
                <p className="text-[11px] text-gray-400 text-center -mt-2">Τα στοιχεία σου χρησιμοποιούνται μόνο για να επικοινωνήσουμε μαζί σου.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
