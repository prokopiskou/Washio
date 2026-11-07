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
type Ob = { afm: string; doy: string; businessName: string; address: string; contactName: string; email: string; promoMonths: string; iban: string }
const obFrom = (a: App): Ob => ({
  afm: a.afm || '', doy: a.doy || '', businessName: '', address: a.address || '', contactName: a.owner_name || '',
  email: a.email || '', promoMonths: '2', iban: '',
})
const ibanOk = (v: string) => { const x = v.replace(/\s/g, '').toUpperCase(); return !x || /^GR\d{25}$/.test(x) }
const todayGr = () => new Intl.DateTimeFormat('el-GR', { timeZone: 'Europe/Athens', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date())
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

export function ApplicationsPipeline({ applications, reload }: { applications: App[]; reload: () => void }) {
  // null = δεν διάλεξε ακόμα → ανοίγει στο πρώτο στάδιο με αιτήσεις (Νέες → Δεν σήκωσε → Follow-up → …)
  const [picked0, setStage] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [fu, setFu] = useState<Record<string, string>>({})
  const [ob, setOb] = useState<Record<string, Ob>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [err, setErr] = useState<Record<string, string>>({})
  const [nowMs] = useState(() => Date.now())
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [closing, setClosing] = useState<Record<string, boolean>>({})

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const a of applications) c[stageOf(a)] = (c[stageOf(a)] || 0) + 1
    return c
  }, [applications])

  const stage = picked0 ?? (STAGES.find(s => counts[s.key])?.key || 'new')

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
        const o = ob[a.id] || obFrom(a)
        const obValid = o.afm.replace(/\D/g, '').length === 9 && o.doy.trim() && o.businessName.trim() && o.address.trim() && o.contactName.trim().length >= 3 && emailOk(o.email) && ibanOk(o.iban)
        const setO = (k: keyof typeof o, v: string) => setOb(m => ({ ...m, [a.id]: { ...o, [k]: v } }))
        const due = a.followup_at && new Date(a.followup_at).getTime() < nowMs
        const field = (k: keyof Ob, label: string, extra: { bad?: boolean; hint?: string; inputMode?: 'numeric' | 'email'; placeholder?: string } = {}) => (
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}{extra.hint && <span className="normal-case tracking-normal font-normal text-gray-300"> {extra.hint}</span>}</span>
            <input value={o[k]} onChange={e => setO(k, e.target.value)} inputMode={extra.inputMode} placeholder={extra.placeholder}
              className={'h-9 px-2 rounded-lg border border-gray-200 text-[13px] w-full min-w-0 bg-white ' + (extra.bad ? 'border-red-400' : '')} />
          </label>
        )
        const contractForm = (call: Record<string, unknown>, onCancel?: () => void) => (
          <div className="rounded-lg border border-gray-900 bg-white p-2.5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold text-gray-800">Συμφωνητικό συνεργασίας</p>
              <span className="text-[11px] text-gray-500">📅 {todayGr()}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {field('afm', 'ΑΦΜ *', { inputMode: 'numeric', bad: !!o.afm && o.afm.replace(/\D/g, '').length !== 9 })}
              {field('doy', 'ΔΟΥ *')}
            </div>
            {field('businessName', 'Επωνυμία επιχείρησης *', { hint: 'όπως στο ΑΦΜ', placeholder: 'π.χ. ΠΑΠΑΔΟΠΟΥΛΟΣ Γ. & ΣΙΑ Ο.Ε.' })}
            {field('address', 'Διεύθυνση έδρας *', { placeholder: 'Οδός αριθμός, Περιοχή, ΤΚ' })}
            {field('contactName', 'Υπεύθυνος *', { hint: 'γράψε το στα ελληνικά' })}
            {field('email', 'Email (εκεί πάει το συμβόλαιο) *', { inputMode: 'email', bad: !!o.email && !emailOk(o.email) })}
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Μήνες με 5% *</span>
                <select value={o.promoMonths} onChange={e => setO('promoMonths', e.target.value)} className="h-9 px-2 rounded-lg border border-gray-200 text-[13px] w-full min-w-0 bg-white">
                  {[0, 1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n === 0 ? 'Κανένας (10%)' : `${n} ${n === 1 ? 'μήνας' : 'μήνες'} → μετά 10%`}</option>)}
                </select>
              </label>
              {field('iban', 'IBAN (προαιρετικό)', { placeholder: 'GR..', bad: !ibanOk(o.iban) })}
            </div>
            <div className="flex gap-2 pt-1">
              <button disabled={!!busy || !obValid}
                onClick={() => { if (confirm(`Αποστολή συμφωνητικού στο ${o.email};\n\n${o.businessName}\nΑΦΜ ${o.afm} · ΔΟΥ ${o.doy}\nΈδρα: ${o.address}\nΥπεύθυνος: ${o.contactName}\nΠρομήθεια: ${o.promoMonths === '0' ? '10%' : `5% για ${o.promoMonths} μήνες, μετά 10%`}`)) act(a, 'send_contract', { ...o, promoMonths: Number(o.promoMonths), ...call }) }}
                className={btn + ' flex-1 h-10 bg-green-600 text-white'}>{busy === a.id + 'send_contract' ? 'Αποστολή...' : 'Υποβολή → αποστολή συμβολαίου'}</button>
              {onCancel && <button onClick={onCancel} className="text-[12px] text-gray-500 underline px-2">Άκυρο</button>}
            </div>
            <p className="text-[11px] text-gray-400">Φεύγει υπογεγραμμένο από εμάς. Μόλις υπογράψει, έρχεται αντίγραφο και στους δύο και δημιουργείται το πρατήριο (ανενεργό).</p>
          </div>
        )
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
            {(st === 'new' || st === 'no_answer' || st === 'followup') && !open && (
              <div className="flex gap-2 mt-2.5">
                <button disabled={!!busy} onClick={() => setPicked(p => ({ ...p, [a.id]: true }))} className={btn + ' flex-1 bg-green-600 text-white'}>✓ Σήκωσε</button>
                <button disabled={!!busy} onClick={() => act(a, 'no_answer')} className={btn + ' flex-1 bg-white border border-gray-300 text-gray-700'}>✕ Δεν σήκωσε</button>
              </div>
            )}

            {(st === 'new' || st === 'no_answer' || st === 'followup') && open && (() => {
              const call = !wasAnswered ? { answered: true } : {}
              return (
                <div className="mt-2.5 flex flex-col gap-2 rounded-xl bg-gray-50 p-3">
                  {<p className="text-[12px] font-semibold text-gray-700">{wasAnswered ? 'Σήκωσε — εκκρεμεί απόφαση' : 'Σήκωσε — τι έγινε;'}</p>}
                  {!closing[a.id] ? (
                    <button disabled={!!busy} onClick={() => setClosing(c => ({ ...c, [a.id]: true }))} className={btn + ' h-10 bg-gray-900 text-white'}>✓ Κλείνει → Onboarding</button>
                  ) : contractForm(call, () => setClosing(c => ({ ...c, [a.id]: false })))}
                  <div className="flex gap-2">
                    <input type="datetime-local" value={fu[a.id] || ''} onChange={e => setFu(f => ({ ...f, [a.id]: e.target.value }))}
                      className="flex-1 min-w-0 h-9 px-2 rounded-lg border border-gray-200 text-[13px] bg-white" />
                    <button disabled={!!busy || !fu[a.id]} onClick={async () => { if (await act(a, 'followup', { at: new Date(fu[a.id]).toISOString(), ...call })) setFu(f => ({ ...f, [a.id]: '' })) }}
                      className={btn + ' bg-amber-500 text-white'}>📅 {st === 'followup' ? 'Νέο follow-up' : 'Follow-up'}</button>
                  </div>
                  <div className="flex items-center justify-between">
                    <button disabled={!!busy} onClick={() => act(a, 'lost', call)} className={btn + ' bg-white border border-gray-300 text-gray-600'}>Δεν ενδιαφέρεται</button>
                    {!wasAnswered && <button onClick={() => setPicked(p => ({ ...p, [a.id]: false }))} className="text-[12px] text-gray-500 underline">Πίσω</button>}
                  </div>
                </div>
              )
            })()}

            {st === 'done' && !a.location_id && a.contract_status === 'sent' && (
              <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2.5">
                <p className="text-[12px] text-amber-800 font-semibold">📄 Στάλθηκε συμβόλαιο — αναμονή υπογραφής</p>
                <button disabled={!!busy} onClick={() => act(a, 'resend_contract')} className="text-[12px] font-semibold text-amber-800 underline shrink-0">{busy === a.id + 'resend_contract' ? '...' : 'Ξαναστείλε'}</button>
              </div>
            )}
            {st === 'done' && !a.location_id && (a.contract_status !== 'sent' || closing[a.id]) && (
              <div className="mt-2.5">{contractForm({}, a.contract_status === 'sent' ? () => setClosing(c => ({ ...c, [a.id]: false })) : undefined)}</div>
            )}
            {st === 'done' && !a.location_id && a.contract_status === 'sent' && !closing[a.id] && (
              <button onClick={() => setClosing(c => ({ ...c, [a.id]: true }))} className="mt-1.5 text-[11px] text-gray-500 underline">Διόρθωση στοιχείων & νέα αποστολή</button>
            )}

            {st === 'done' && a.location_id && (
              <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl bg-green-50 px-3 py-2.5">
                <p className="text-[12px] text-green-800 font-semibold">✓ Στα Πλυντήρια — περιμένει ενεργοποίηση</p>
                <div className="flex gap-3 shrink-0">
                  {a.contract_id && a.contract_status === 'signed' && <a href={`/api/admin/contracts/${a.contract_id}/pdf`} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-green-800 underline">📄 Συμβόλαιο</a>}
                  <a href={`/admin/locations/${a.location_id}/edit`} className="text-[12px] font-semibold text-green-800 underline">Άνοιγμα</a>
                </div>
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
