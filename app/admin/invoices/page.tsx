'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

// Admin: Εξόφληση προμήθειας → τιμολόγιο Oxygen + email PDF στο πλυντήριο.
type Inv = { status: string; invoice_number: string | null; mydata_mark: string | null; settlement: string; emailed_to: string | null; error: string | null; gross: number } | null
type Row = { locationId: string; name: string; afm: string; email: string | null; bookings: number; gross: number; net: number; vat: number; invoice: Inv }

const eur = (n: number) => n.toFixed(2).replace('.', ',') + '€'
function prevMonth() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

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

  const issue = async (row: Row) => {
    const s = settle[row.locationId] || 'paid'
    const afm = (afmEdit[row.locationId] ?? row.afm).replace(/\D/g, '')
    if (afm.length !== 9) { setMsg(m => ({ ...m, [row.locationId]: 'Βάλε σωστό ΑΦΜ (9 ψηφία)' })); return }
    if (!row.email) { setMsg(m => ({ ...m, [row.locationId]: 'Δεν υπάρχει email ιδιοκτήτη' })); return }
    if (!confirm(`Εξόφληση ${row.name}\n\nΤιμολόγιο ${eur(row.gross)} (${eur(row.net)} + ΦΠΑ ${eur(row.vat)})\n${s === 'offset' ? 'Συμψηφισμός με κάρτες' : 'Πλήρωσε το πλυντήριο'}\nEmail → ${row.email}\n\nΤο τιμολόγιο πάει στο myDATA. Συνέχεια;`)) return
    setBusy(row.locationId); setMsg(m => ({ ...m, [row.locationId]: '' }))
    const r = await fetch('/api/admin/commission-invoices', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId: row.locationId, month, settlement: s, afm }),
    })
    const j = await r.json().catch(() => ({}))
    setMsg(m => ({ ...m, [row.locationId]: r.ok ? `✅ ${j.number || 'Εκδόθηκε'} → ${j.emailedTo}` : `❌ ${j.error || r.status}` }))
    setBusy('')
    load()
  }

  const total = rows.reduce((s, r) => s + r.gross, 0)

  return (
    <main className="min-h-screen bg-gray-50 p-5">
      <div className="max-w-4xl mx-auto">
        <Link href="/admin" className="text-[13px] text-gray-400">← Admin</Link>
        <h1 className="text-xl font-semibold text-gray-900 mt-3">Τιμολόγια προμήθειας</h1>
        <p className="text-[13px] text-gray-500 mt-1">«Εξόφληση» = έκδοση τιμολογίου παροχής (Oxygen → myDATA) για ΟΛΗ την προμήθεια του μήνα + email PDF στο πλυντήριο.</p>

        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="h-9 px-3 rounded-lg border border-gray-200 text-[14px] bg-white" />
          <span className="text-[13px] text-gray-600">Σύνολο προμήθειας: <b>{eur(total)}</b></span>
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
                <th className="text-left p-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="p-4 text-gray-400">Φόρτωση…</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={6} className="p-4 text-gray-400">Καμία προμήθεια για τον μήνα.</td></tr>}
              {rows.map(r => {
                const done = r.invoice?.status === 'emailed'
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
                      {done ? <span>{r.afm}</span> : (
                        <input value={afmEdit[r.locationId] ?? r.afm} onChange={e => setAfmEdit(a => ({ ...a, [r.locationId]: e.target.value }))}
                          placeholder="ΑΦΜ" inputMode="numeric" className={`w-28 h-8 px-2 rounded-md border text-[13px] ${(afmEdit[r.locationId] ?? r.afm).replace(/\D/g, '').length === 9 ? 'border-gray-200' : 'border-red-300'}`} />
                      )}
                    </td>
                    <td className="p-2.5">
                      {done ? <span className="text-gray-500">{r.invoice?.settlement === 'offset' ? 'Συμψηφισμός' : 'Πληρωμή'}</span> : (
                        <select value={settle[r.locationId] || 'paid'} onChange={e => setSettle(s => ({ ...s, [r.locationId]: e.target.value as 'paid' | 'offset' }))}
                          className="h-8 px-2 rounded-md border border-gray-200 text-[13px] bg-white">
                          <option value="paid">Πλήρωσε</option>
                          <option value="offset">Συμψηφισμός</option>
                        </select>
                      )}
                    </td>
                    <td className="p-2.5 min-w-[170px]">
                      {done ? (
                        <div className="text-[12px] text-green-700 font-semibold">✓ {r.invoice?.invoice_number || 'Εκδόθηκε'}<div className="text-[11px] text-gray-400 font-normal">{r.invoice?.emailed_to}</div></div>
                      ) : (
                        <button disabled={!!busy} onClick={() => issue(r)}
                          className="h-8 px-3 rounded-lg bg-gray-900 text-white text-[12px] font-semibold disabled:opacity-40">
                          {busy === r.locationId ? 'Έκδοση…' : r.invoice?.status === 'issued' ? 'Ξαναστείλε email' : 'Εξόφληση'}
                        </button>
                      )}
                      {r.invoice?.error && !done && <div className="text-[11px] text-red-600 mt-1">{r.invoice.error}</div>}
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
