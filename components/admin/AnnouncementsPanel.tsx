'use client'

import { useCallback, useEffect, useState } from 'react'

// Admin → «Ενημερώσεις» προς πλυντήρια: αποστολή (push + email) + ποιος το διάβασε + «Πάρε τηλέφωνο».
type Row = { id: string; location_id: string; name: string; phone: string | null; owner: string | null; sent_at: string; opened_at: string | null; acked_at: string | null; acked_by: string | null; reminded_at: string | null; sms_at: string | null; callNeeded: boolean }
type Ann = { id: string; created_at: string; title: string; body: string; important: boolean; total: number; acked: number; opened: number; rows: Row[] }

const when = (iso: string | null) => iso ? new Intl.DateTimeFormat('el-GR', { timeZone: 'Europe/Athens', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—'

export function AnnouncementsPanel({ locations }: { locations: { id: string; name: string; is_active?: boolean }[] }) {
  const [list, setList] = useState<Ann[] | null>(null)
  const [err, setErr] = useState('')
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [important, setImportant] = useState(false)
  const [all, setAll] = useState(true); const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false); const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/announcements'); const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error || 'Σφάλμα'); return }
    setErr(''); setList(j.announcements || [])
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const send = async () => {
    const n = all ? 'ΟΛΑ τα ενεργά πλυντήρια' : `${picked.length} πλυντήρια`
    if (!confirm(`Αποστολή σε ${n};\n\n${important ? '❗ ΣΗΜΑΝΤΙΚΗ (καλύπτει την οθόνη μέχρι «Το διάβασα»)\n' : ''}${title}\n\n${body}`)) return
    setBusy(true)
    const r = await fetch('/api/admin/announcements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, body, important, locationIds: all ? null : picked }) })
    const j = await r.json().catch(() => ({})); setBusy(false)
    if (!r.ok) { setErr(j.error || 'Σφάλμα'); return }
    setTitle(''); setBody(''); setImportant(false); setPicked([]); setAll(true)
    alert(`Στάλθηκε σε ${j.sent} πλυντήρια ✓`); load()
  }

  const calls = (list || []).flatMap(a => a.rows.filter(r => r.callNeeded).map(r => ({ ...r, title: a.title })))
  const input = 'w-full px-3 rounded-lg border border-gray-200 text-[14px]'
  const active = locations.filter(l => l.is_active !== false)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-2.5">
        <p className="text-[15px] font-bold text-gray-900">Νέα ενημέρωση προς πλυντήρια</p>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Τίτλος (π.χ. Σκανάρετε το QR σε κάθε πελάτη)" className={input + ' h-10'} />
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={4} placeholder="Κείμενο" className={input + ' py-2 resize-y'} />
        <label className="flex items-center gap-2 text-[13px] text-gray-700"><input type="checkbox" checked={important} onChange={e => setImportant(e.target.checked)} className="h-4 w-4" /> ❗ Σημαντική — καλύπτει την οθόνη μέχρι να πατήσουν «Το διάβασα»</label>
        <div className="flex gap-2 text-[13px]">
          <button onClick={() => setAll(true)} className={`h-8 px-3 rounded-lg border ${all ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200'}`}>Όλα τα ενεργά</button>
          <button onClick={() => setAll(false)} className={`h-8 px-3 rounded-lg border ${!all ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200'}`}>Επιλογή</button>
        </div>
        {!all && (
          <div className="flex flex-wrap gap-1.5">
            {active.map(l => (
              <button key={l.id} onClick={() => setPicked(p => p.includes(l.id) ? p.filter(x => x !== l.id) : [...p, l.id])}
                className={`h-8 px-2.5 rounded-full text-[12px] border ${picked.includes(l.id) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200'}`}>{l.name}</button>
            ))}
          </div>
        )}
        <button onClick={send} disabled={busy || !title.trim() || !body.trim() || (!all && !picked.length)} className="h-11 w-full rounded-xl bg-gray-900 text-white text-[14px] font-semibold disabled:opacity-40">{busy ? 'Αποστολή…' : 'Αποστολή (push + email)'}</button>
        <p className="text-[11px] text-gray-400">Χωρίς «Το διάβασα» σε 4 ώρες → 2ο push + SMS. Σε 24 ώρες → «Πάρε τηλέφωνο» εδώ.</p>
      </div>

      {calls.length > 0 && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-[14px] font-bold text-red-800">📞 Πάρε τηλέφωνο ({calls.length}) — δεν διάβασαν σε 24 ώρες</p>
          <div className="mt-2 space-y-1.5">
            {calls.map(c => (
              <div key={c.id} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="text-red-900 truncate"><b>{c.name}</b> · {c.title}</span>
                {c.phone ? <a href={`tel:${c.phone}`} className="shrink-0 font-semibold text-red-800 underline">{c.phone}</a> : <span className="text-red-400">χωρίς τηλέφωνο</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {(list || []).map(a => (
          <div key={a.id} className="rounded-2xl border border-gray-200 bg-white">
            <button onClick={() => setOpen(open === a.id ? null : a.id)} className="w-full text-left px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-gray-900 truncate">{a.important ? '❗ ' : ''}{a.title}</p>
                <p className="text-[11px] text-gray-400">{when(a.created_at)} · άνοιξαν {a.opened}/{a.total}</p>
              </div>
              <span className={`shrink-0 text-[12px] font-bold px-2 py-1 rounded-md ${a.acked === a.total ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'}`}>✓ {a.acked}/{a.total}</span>
            </button>
            {open === a.id && (
              <div className="px-4 pb-3">
                <p className="text-[13px] text-gray-600 whitespace-pre-line mb-2">{a.body}</p>
                <table className="w-full text-[12px]">
                  <thead><tr className="text-gray-400"><th className="text-left font-medium py-1">Πλυντήριο</th><th className="text-right font-medium">Άνοιξε</th><th className="text-right font-medium">Διάβασε</th></tr></thead>
                  <tbody>{a.rows.map(r => (
                    <tr key={r.id} className="border-t border-gray-50">
                      <td className="py-1.5 text-gray-700">{r.name}{r.sms_at ? <span className="text-gray-400"> · SMS</span> : r.reminded_at ? <span className="text-gray-400"> · υπενθ.</span> : null}</td>
                      <td className="text-right text-gray-500">{when(r.opened_at)}</td>
                      <td className={`text-right font-semibold ${r.acked_at ? 'text-green-700' : 'text-red-600'}`}>{r.acked_at ? `✓ ${when(r.acked_at)}` : '✗'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
      {err && <p className="text-[12px] text-red-600">{err}</p>}
    </div>
  )
}
