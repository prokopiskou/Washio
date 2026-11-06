'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

// Admin: τιμολόγια προμήθειας (Oxygen → myDATA).
//  1) Αρχή μήνα: «Έκδοση» για τον προηγούμενο μήνα (όλα τα πλυντήρια) → PDF στο email τους.
//  2) Όταν πληρώσει: «Εξόφληση» → απόδειξη είσπραξης. Συμψηφισμός (του χρωστάμε) → εξοφλείται στην έκδοση.
type Inv = { status: string; invoice_number: string | null; mydata_mark: string | null; settlement: string; emailed_to: string | null; error: string | null; gross: number; paid_at: string | null } | null
type Row = { locationId: string; name: string; afm: string; email: string | null; bookings: number; gross: number; net: number; vat: number; invoice: Inv }

const eur = (n: number) => n.toFixed(2).replace('.', ',') + '€'
function prevMonth() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const issued = (r: Row) => !!r.invoice && ['emailed', 'paid'].includes(r.invoice.status)
const paid = (r: Row) => !!r.invoice?.paid_at

export default function InvoicesPage() {
  const [month, setMonth] = useState(prevMonth())
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [afmEdit, setAfmEdit] = useState<Record<string, string>>({})
  const [settle, setSettle] = useState<Record<string, 'paid' | 'offset'>>({})
  const [busy, setBusy] = useState<string>('')
  const [msg, setMsg] = useState<Record<string, string>>({})
  const [check, setCheck] = useState<string>('')

  const load = useCallback(async () => {
    setLoading(true); setErr('')
    const r = await fetch(`/api/admin/commission-invoices?month=${month}`)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) setErr(j.error || 'Σφάλμα'); else setRows(j.rows || [])
    setLoading(false)
  }, [month])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const runCheck = async () => {
    setCheck('Έλεγχος…')
    const j = await fetch('/api/admin/commission-invoices?check=1').then(r => r.json()).catch(() => ({ ok: false, error: 'Δίκτυο' }))
    setCheck(JSON.stringify(j, null, 2))
  }

  const post = async (row: Row, action: 'issue' | 'pay') => {
    const afm = (afmEdit[row.locationId] ?? row.afm).replace(/\D/g, '')
    const r = await fetch('/api/admin/commission-invoices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, locationId: row.locationId, month, settlement: settle[row.locationId] || 'paid', afm }),
    })
    const j = await r.json().catch(() => ({}))
    const text = r.ok ? (action === 'pay' ? '✅ Εξοφλήθηκε' : `✅ ${j.number || 'Εκδόθηκε'} → ${j.emailedTo}`) : `❌ ${j.error || r.status}`
    setMsg(m => ({ ...m, [row.locationId]: text }))
    return r.ok
  }

  const validate = (row: Row) => {
    const afm = (afmEdit[row.locationId] ?? row.afm).replace(/\D/g, '')
    if (afm.length !== 9) return 'Βάλε σωστό ΑΦΜ (9 ψηφία)'
    if (!row.email) return 'Δεν υπάρχει email ιδιοκτήτη'
    return ''
  }

  const issueOne = async (row: Row) => {
    const v = validate(row); if (v) { setMsg(m => ({ ...m, [row.locationId]: v })); return }
    const off = (settle[row.locationId] || 'paid') === 'offset'
    if (!confirm(`Έκδοση τιμολογίου ${row.name}\n\n${eur(row.gross)} (${eur(row.net)} + ΦΠΑ ${eur(row.vat)})\n${off ? 'Συμψηφισμός → εξοφλείται αμέσως' : 'Ανεξόφλητο — πληρωμή έως 15 του μήνα'}\nEmail → ${row.email}\n\nΠάει στο myDATA. Συνέχεια;`)) return
    setBusy(row.locationId); await post(row, 'issue'); setBusy(''); load()
  }

  const issueAll = async () => {
    const todo = rows.filter(r => !issued(r))
    const bad = todo.map(r => [r, validate(r)] as const).filter(([, v]) => v)
    if (bad.length) { alert('Διόρθωσε πρώτα:\n' + bad.map(([r, v]) => `• ${r.name}: ${v}`).join('\n')); return }
    const offs = todo.filter(r => (settle[r.locationId] || 'paid') === 'offset').map(r => r.name)
    if (!confirm(`Έκδοση ${todo.length} τιμολογίων (${eur(todo.reduce((s, r) => s + r.gross, 0))}) για ${month}.\n${offs.length ? 'Συμψηφισμός: ' + offs.join(', ') + '\n' : ''}\nΚάθε τιμολόγιο πάει στο myDATA και στο email του πλυντηρίου. Συνέχεια;`)) return
    for (const r of todo) { setBusy(r.locationId); await post(r, 'issue') }
    setBusy(''); load()
  }

  const payOne = async (row: Row) => {
    if (!confirm(`Εξόφληση ${row.name}: λάβαμε ${eur(row.invoice?.gross ?? row.gross)};\n\nΒγαίνει απόδειξη είσπραξης και email επιβεβαίωσης.`)) return
    setBusy(row.locationId); await post(row, 'pay'); setBusy(''); load()
  }

  const total = rows.reduce((s, r) => s + r.gross, 0)
  const open = rows.filter(r => issued(r) && !paid(r)).reduce((s, r) => s + (r.invoice?.gross ?? r.gross), 0)
  const pendingIssue = rows.filter(r => !issued(r)).length

  return (
    <main className="min-h-screen bg-gray-50 p-5">
      <div className="max-w-4xl mx-auto">
        <Link href="/admin" className="text-[13px] text-gray-400">← Admin</Link>
        <h1 className="text-xl font-semibold text-gray-900 mt-3">Τιμολόγια προμήθειας</h1>
        <p className="text-[13px] text-gray-500 mt-1">Κάθε αρχή μήνα: <b>Έκδοση</b> για τον προηγούμενο μήνα (όλη η προμήθεια, Oxygen → myDATA, PDF στο email). Όταν πληρώσουν: <b>Εξόφληση</b>.</p>

        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="h-9 px-3 rounded-lg border border-gray-200 text-[14px] bg-white" />
          <span className="text-[13px] text-gray-600">Προμήθεια: <b>{eur(total)}</b> · Ανεξόφλητα: <b className="text-amber-700">{eur(open)}</b></span>
          {pendingIssue > 0 && (
            <button disabled={!!busy || loading} onClick={issueAll} className="h-9 px-3 rounded-lg bg-gray-900 text-white text-[12px] font-semibold disabled:opacity-40">
              Έκδοση όλων ({pendingIssue})
            </button>
          )}
          <button onClick={runCheck} className="ml-auto h-9 px-3 rounded-lg border border-gray-300 text-[12px] font-semibold bg-white">Έλεγχος σύνδεσης Oxygen</button>
        </div>
        {check && <pre className="mt-3 bg-white rounded-xl border border-gray-200 p-3 text-[11px] whitespace-pre-wrap max-h-80 overflow-auto">{check}</pre>}
        {err && <p className="mt-3 text-[13px] text-red-600">{err}</p>}

        <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-left p-2.5">Πλυντήριο</th>
                <th className="text-right p-2.5">Κρατ.</th>
                <th className="text-right p-2.5">Προμήθεια</th>
                <th className="text-left p-2.5">ΑΦΜ</th>
                <th className="text-left p-2.5">Τρόπος</th>
                <th className="text-left p-2.5">Κατάσταση</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="p-4 text-gray-400">Φόρτωση…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={6} className="p-4 text-gray-400">Καμία προμήθεια για τον μήνα.</td></tr>}
              {rows.map(r => {
                const isIssued = issued(r), isPaid = paid(r)
                return (
                  <tr key={r.locationId} className="border-t border-gray-100 align-top">
                    <td className="p-2.5">
                      <div className="font-medium text-gray-900">{r.name}</div>
                      <div className="text-[11px] text-gray-400">{r.email || 'χωρίς email'}</div>
                    </td>
                    <td className="p-2.5 text-right">{r.bookings}</td>
                    <td className="p-2.5 text-right">
                      <div className="font-semibold">{eur(r.gross)}</div>
                      <div className="text-[11px] text-gray-400">{eur(r.net)} + {eur(r.vat)}</div>
                    </td>
                    <td className="p-2.5">
                      {isIssued ? <span>{r.afm}</span> : (
                        <input value={afmEdit[r.locationId] ?? r.afm} onChange={e => setAfmEdit(a => ({ ...a, [r.locationId]: e.target.value }))}
                          placeholder="ΑΦΜ" inputMode="numeric" className={`w-28 h-8 px-2 rounded-md border text-[13px] ${(afmEdit[r.locationId] ?? r.afm).replace(/\D/g, '').length === 9 ? 'border-gray-200' : 'border-red-300'}`} />
                      )}
                    </td>
                    <td className="p-2.5">
                      {r.invoice ? <span className="text-gray-500">{r.invoice.settlement === 'offset' ? 'Συμψηφισμός' : 'Πληρωμή'}</span> : (
                        <select value={settle[r.locationId] || 'paid'} onChange={e => setSettle(s => ({ ...s, [r.locationId]: e.target.value as 'paid' | 'offset' }))}
                          className="h-8 px-2 rounded-md border border-gray-200 text-[13px] bg-white">
                          <option value="paid">Πληρωμή</option>
                          <option value="offset">Συμψηφισμός</option>
                        </select>
                      )}
                    </td>
                    <td className="p-2.5 min-w-[190px]">
                      {isPaid ? (
                        <div className="text-[12px] text-green-700 font-semibold">✓ Εξοφλημένο<div className="text-[11px] text-gray-400 font-normal">{r.invoice?.invoice_number}</div></div>
                      ) : isIssued ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] text-amber-700 font-semibold">{r.invoice?.invoice_number || 'Εκδόθηκε'}</span>
                          <button disabled={!!busy} onClick={() => payOne(r)} className="h-8 px-3 rounded-lg bg-green-700 text-white text-[12px] font-semibold disabled:opacity-40">
                            {busy === r.locationId ? '…' : 'Εξόφληση'}
                          </button>
                        </div>
                      ) : (
                        <button disabled={!!busy} onClick={() => issueOne(r)} className="h-8 px-3 rounded-lg bg-gray-900 text-white text-[12px] font-semibold disabled:opacity-40">
                          {busy === r.locationId ? 'Έκδοση…' : r.invoice?.status === 'issued' ? 'Ξαναστείλε email' : 'Έκδοση'}
                        </button>
                      )}
                      {r.invoice?.error && !isPaid && <div className="text-[11px] text-red-600 mt-1">{r.invoice.error}</div>}
                      {msg[r.locationId] && <div className="text-[11px] mt-1">{msg[r.locationId]}</div>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
