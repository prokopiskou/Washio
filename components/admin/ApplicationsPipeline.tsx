'use client'

import { useMemo, useState } from 'react'

// Admin → Αιτήσεις: στάδια (apply + Meta leads).
// Νέες → 📞 Σήκωσε / Δεν σήκωσε → Follow-up (ημερομηνία, email 15' πριν) → Onboarding (ΑΦΜ, ΔΟΥ) →
// ✓ Onboarding κομπλέ = νέο πρατήριο (ανενεργό) στα «Πλυντήρια», περιμένει το τελικό ⏻.
/* eslint-disable @typescript-eslint/no-explicit-any -- γραμμές applications από τον admin (dynamic) */
type App = any

const STAGES: { key: string; label: string }[] = [
  { key: 'new', label: 'Νέες' },
  { key: 'no_answer', label: 'Δεν σήκωσε' },
  { key: 'followup', label: 'Follow-up' },
  { key: 'done', label: 'Ολοκληρώθηκαν' },
  { key: 'lost', label: 'Δεν ενδιαφέρονται' },
]
// «Onboarding» και «Ολοκληρώθηκαν» = ένα στάδιο: όσα δεν έχουν ακόμα πρατήριο δείχνουν τη φόρμα ΑΦΜ/ΔΟΥ.
const stageOf = (a: App) => a.stage === 'answered' ? 'new' : a.stage === 'onboarding' ? 'done' : a.stage || (a.status === 'approved' ? 'done' : a.status === 'rejected' ? 'lost' : 'new')
const fmt = (iso?: string | null) => iso ? new Intl.DateTimeFormat('el-GR', { timeZone: 'Europe/Athens', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—'
const isMeta = (a: App) => a.wash_type === 'Meta lead'

export function ApplicationsPipeline({ applications, reload }: { applications: App[]; reload: () => void }) {
  const [stage, setStage] = useState('new')
  const [busy, setBusy] = useState('')
  const [fu, setFu] = useState<Record<string, string>>({})
  const [ob, setOb] = useState<Record<string, { afm: string; doy: string; address: string; iban: string; ibanHolder: string }>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [err, setErr] = useState<Record<string, string>>({})
  const [nowMs] = useState(() => Date.now())
  const [picked, setPicked] = useState<Record<string, boolean>>({})

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const a of applications) c[stageOf(a)] = (c[stageOf(a)] || 0) + 1
    return c
  }, [applications])

  const list = useMemo(() => {
    const l = applications.filter(a => stageOf(a) === stage)
    if (stage === 'followup') return [...l].sort((a, b) => String(a.followup_at || '').localeCompare(String(b.followup_at || '')))
    return l
  }, [applications, stage])

  const act = async (a: App, action: string, extra: Record<string, unknown> = {}) => {
    setBusy(a.id + action); setErr(e => ({ ...e, [a.id]: '' }))
    const r = await fetch('/api/admin/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id, action, ...extra }) })
    const j = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) { setErr(e => ({ ...e, [a.id]: j.error || 'Σφάλμα' })); return false }
    reload(); return true
  }

  const btn = 'h-9 px-3 rounded-lg text-[12px] font-semibold disabled:opacity-40'
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
        {STAGES.map(s => (
          <button key={s.key} onClick={() => setStage(s.key)}
            className={`shrink-0 px-3 h-8 rounded-full text-[12px] font-semibold border ${stage === s.key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>
            {s.label} <span className={stage === s.key ? 'text-white/70' : 'text-gray-400'}>{counts[s.key] || 0}</span>
          </button>
        ))}
      </div>

      {list.length === 0 && <p className="text-[13px] text-gray-400 py-6 text-center">Καμία αίτηση σε αυτό το στάδιο.</p>}

      {list.map(a => {
        const st = stageOf(a)
        const wasAnswered = a.stage === 'answered' // παλιό στάδιο «Σήκωσε» → ανοιχτές οι 3 επιλογές, η κλήση έχει ήδη μετρηθεί
        const open = picked[a.id] ?? wasAnswered
        const o = ob[a.id] || { afm: a.afm || '', doy: a.doy || '', address: a.address || '', iban: '', ibanHolder: '' }
        const setO = (k: keyof typeof o, v: string) => setOb(m => ({ ...m, [a.id]: { ...o, [k]: v } }))
        const due = a.followup_at && new Date(a.followup_at).getTime() < nowMs
        return (
          <div key={a.id} className="rounded-2xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-bold text-gray-900 truncate">{a.business_name}</p>
                <p className="text-[12px] text-gray-500 mt-0.5">{[a.owner_name, a.city || a.address].filter(Boolean).join(' · ')}</p>
              </div>
              <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-md ${isMeta(a) ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{isMeta(a) ? 'META' : 'APPLY'}</span>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[12px]">
              {a.phone && <a href={`tel:${a.phone}`} className="font-semibold text-blue-700">📞 {a.phone}</a>}
              {a.email && <span className="text-gray-600 truncate">{a.email}</span>}
              {a.lanes && <span className="text-gray-500">Αυτ./μέρα: {a.lanes}</span>}
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">
              Ήρθε {fmt(a.created_at)}{a.call_attempts ? ` · Κλήσεις: ${a.call_attempts}` : ''}{a.last_call_at ? ` · Τελευταία ${fmt(a.last_call_at)}` : ''}{a.last_call_by ? ` (${String(a.last_call_by).split('@')[0]})` : ''}
            </p>

            {st === 'no_answer' && a.followup_at && (
              <p className={`mt-2 text-[12px] font-semibold ${due ? 'text-red-600' : 'text-gray-600'}`}>⏰ Υπενθύμιση: {fmt(a.followup_at)}{due ? ' · ξαναπάρ\' τον' : ''}</p>
            )}

            {st === 'followup' && (
              <p className={`mt-2 text-[13px] font-semibold ${due ? 'text-red-600' : 'text-amber-700'}`}>📅 Follow-up: {fmt(a.followup_at)}{due ? ' · έχει περάσει' : ''}</p>
            )}

            <textarea
              value={notes[a.id] ?? a.pipeline_notes ?? ''}
              onChange={e => setNotes(n => ({ ...n, [a.id]: e.target.value }))}
              onBlur={() => { if ((notes[a.id] ?? null) !== null && notes[a.id] !== (a.pipeline_notes || '')) act(a, 'note', { text: notes[a.id] }) }}
              placeholder="Σημειώσεις (τι είπε, τι θέλει…)"
              rows={2}
              className="mt-2.5 w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] resize-none"
            />

            {/* Ενέργειες ανά στάδιο */}
            {(st === 'new' || st === 'no_answer') && !open && (
              <div className="flex gap-2 mt-2.5">
                <button disabled={!!busy} onClick={() => setPicked(p => ({ ...p, [a.id]: true }))} className={btn + ' flex-1 bg-green-600 text-white'}>✓ Σήκωσε</button>
                <button disabled={!!busy} onClick={() => act(a, 'no_answer')} className={btn + ' flex-1 bg-white border border-gray-300 text-gray-700'}>✕ Δεν σήκωσε</button>
              </div>
            )}

            {(((st === 'new' || st === 'no_answer') && open) || st === 'followup') && (() => {
              const call = st !== 'followup' && !wasAnswered ? { answered: true } : {}
              return (
                <div className="mt-2.5 flex flex-col gap-2 rounded-xl bg-gray-50 p-3">
                  {st === 'followup' && (
                    <button disabled={!!busy} onClick={() => act(a, 'no_answer')} className={btn + ' bg-white border border-gray-300 text-gray-700'}>✕ Δεν σήκωσε — υπενθύμιση αύριο 10:00</button>
                  )}
                  {st === 'followup' && <p className="text-[11px] text-gray-400 -mb-1">Σήκωσε:</p>}
                  {st !== 'followup' && <p className="text-[12px] font-semibold text-gray-700">{wasAnswered ? 'Σήκωσε — εκκρεμεί απόφαση' : 'Σήκωσε — τι έγινε;'}</p>}
                  <button disabled={!!busy} onClick={() => act(a, 'to_onboarding', call)} className={btn + ' h-10 bg-gray-900 text-white'}>✓ Κλείνει</button>
                  <div className="flex gap-2">
                    <input type="datetime-local" value={fu[a.id] || ''} onChange={e => setFu(f => ({ ...f, [a.id]: e.target.value }))}
                      className="flex-1 min-w-0 h-9 px-2 rounded-lg border border-gray-200 text-[13px] bg-white" />
                    <button disabled={!!busy || !fu[a.id]} onClick={async () => { if (await act(a, 'followup', { at: new Date(fu[a.id]).toISOString(), ...call })) setFu(f => ({ ...f, [a.id]: '' })) }}
                      className={btn + ' bg-amber-500 text-white'}>📅 {st === 'followup' ? 'Νέο follow-up' : 'Follow-up'}</button>
                  </div>
                  <div className="flex items-center justify-between">
                    <button disabled={!!busy} onClick={() => act(a, 'lost', call)} className={btn + ' bg-white border border-gray-300 text-gray-600'}>Δεν ενδιαφέρεται</button>
                    {st !== 'followup' && !wasAnswered && <button onClick={() => setPicked(p => ({ ...p, [a.id]: false }))} className="text-[12px] text-gray-500 underline">Πίσω</button>}
                  </div>
                </div>
              )
            })()}

            {st === 'done' && !a.location_id && (
              <div className="mt-2.5 rounded-xl bg-gray-50 p-3 flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <input value={o.afm} onChange={e => setO('afm', e.target.value)} placeholder="ΑΦΜ *" inputMode="numeric" className="h-9 px-2 rounded-lg border border-gray-200 text-[13px] bg-white" />
                  <input value={o.doy} onChange={e => setO('doy', e.target.value)} placeholder="ΔΟΥ *" className="h-9 px-2 rounded-lg border border-gray-200 text-[13px] bg-white" />
                </div>
                <input value={o.address} onChange={e => setO('address', e.target.value)} placeholder="Διεύθυνση" className="h-9 px-2 rounded-lg border border-gray-200 text-[13px] bg-white" />
                <details>
                  <summary className="text-[12px] text-gray-500 cursor-pointer">IBAN (προαιρετικό)</summary>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <input value={o.iban} onChange={e => setO('iban', e.target.value)} placeholder="IBAN" className="h-9 px-2 rounded-lg border border-gray-200 text-[13px] bg-white" />
                    <input value={o.ibanHolder} onChange={e => setO('ibanHolder', e.target.value)} placeholder="Δικαιούχος" className="h-9 px-2 rounded-lg border border-gray-200 text-[13px] bg-white" />
                  </div>
                </details>
                <button disabled={!!busy || o.afm.replace(/\D/g, '').length !== 9 || !o.doy.trim()}
                  onClick={() => { if (confirm(`Onboarding κομπλέ για «${a.business_name}»;\n\nΔημιουργείται το πρατήριο (ανενεργό) στα Πλυντήρια, περιμένει την ενεργοποίησή σου.`)) act(a, 'onboard', o) }}
                  className={btn + ' h-10 bg-green-600 text-white'}>✓ Onboarding κομπλέ</button>
                <p className="text-[11px] text-gray-400">Ή στείλε του τη φόρμα /onboarding — μόλις τη συμπληρώσει, δημιουργείται μόνο του.</p>
                <button disabled={!!busy} onClick={() => act(a, 'lost')} className="text-[12px] text-gray-500 underline self-start">Δεν ενδιαφέρεται</button>
              </div>
            )}

            {st === 'done' && a.location_id && (
              <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl bg-green-50 px-3 py-2.5">
                <p className="text-[12px] text-green-800 font-semibold">✓ Στα Πλυντήρια — περιμένει ενεργοποίηση</p>
                {<a href={`/admin/locations/${a.location_id}/edit`} className="text-[12px] font-semibold text-green-800 underline shrink-0">Άνοιγμα</a>}
              </div>
            )}

            {st === 'lost' && (
              <button disabled={!!busy} onClick={() => act(a, 'reopen')} className={btn + ' mt-2.5 bg-white border border-gray-300 text-gray-700'}>↺ Ξανά ανοιχτή</button>
            )}

            {!a.location_id && (
              <button disabled={!!busy} onClick={() => { if (confirm(`Διαγραφή της αίτησης «${a.business_name}»;\n\nΔεν αναιρείται.`)) act(a, 'delete') }}
                className="mt-2 text-[11px] text-red-600 underline">Διαγραφή</button>
            )}
            {err[a.id] && <p className="mt-2 text-[12px] text-red-600">{err[a.id]}</p>}
          </div>
        )
      })}
    </div>
  )
}
