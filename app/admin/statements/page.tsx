'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

// Admin: αποστολή εκκαθαρίσεων (PDF) στα πλυντήρια. Ένα email ανά ιδιοκτήτη.
// 1) Επιλέγεις τα PDF του μήνα  2) Δοκιμή (έρχεται σε σένα)  3) Αποστολή σε όλα.
type Loc = { id: string; name: string; owner: string }

// Ποσά Οκτωβρίου 2026 (από τα PDF). > 0: χρωστάει στο Washio · < 0: του χρωστάμε.
const AMOUNTS: Record<string, number> = {
  '19carwash': 1.40, 'aswashdetailing': 5.85, 'carcare': 0.60, 'faniscarwash': 0.60, 'nikolaoucarwash': 0.75,
  'nitrowash': 2.50, 'pitstopcardetailing': -22.00, 'ranacarwash': 0.75, 'sprintercarwash': 0.50, 'toxiccarwash': 2.00,
  'washplusargyroupolis': 0.80, 'washplusilioupoli': 5.55, 'washplusoe': 3.40, 'τσιτσησαντρεασ': 0.55,
}
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, 'and').replace(/ς/g, 'σ').replace(/[^a-z0-9α-ω]/g, '')
const fileKey = (f: string) => norm(f.replace(/\.pdf$/i, '').replace(/^Washio_[^_]+_/, '').replace(/and/g, ''))
function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

export default function StatementsPage() {
  const [locs, setLocs] = useState<Loc[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [month, setMonth] = useState('Οκτωβρίου 2026')
  const [log, setLog] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetch('/api/admin/statements').then(r => r.json()).then(j => setLocs(j.locations || [])) }, [])

  const matched = useMemo(() => files.map(f => {
    const k = fileKey(f.name)
    let best: Loc | null = null, bd = 99
    for (const l of locs) { const d = lev(k, norm(l.name).replace(/and/g, '')); if (d < bd) { bd = d; best = l } }
    const amount = Object.entries(AMOUNTS).find(([key]) => lev(key.replace(/and/g, ''), k) <= 2)?.[1]
    return { file: f, loc: bd <= 3 ? best : null, amount: amount ?? 0 }
  }), [files, locs])

  const groups = useMemo(() => {
    const g = new Map<string, typeof matched>()
    for (const m of matched) if (m.loc) { const a = g.get(m.loc.owner) || []; a.push(m); g.set(m.loc.owner, a) }
    return [...g.values()]
  }, [matched])

  const send = async (mode: 'test' | 'send') => {
    if (mode === 'send' && !confirm(`Αποστολή σε ${groups.length} ιδιοκτήτες (${matched.filter(m => m.loc).length} PDF). Συνέχεια;`)) return
    setBusy(true); setLog([])
    const list = mode === 'test' ? groups.slice(0, 1) : groups
    for (const g of list) {
      const fd = new FormData()
      fd.set('mode', mode); fd.set('month', month)
      fd.set('items', JSON.stringify(g.map(m => ({ locationId: m.loc!.id, amount: m.amount }))))
      for (const m of g) fd.append('files', m.file, m.file.name)
      const r = await fetch('/api/admin/statements', { method: 'POST', body: fd })
      const j = await r.json().catch(() => ({}))
      setLog(l => [...l, `${r.ok ? '✅' : '❌'} ${g.map(m => m.loc!.name).join(' + ')} → ${r.ok ? j.sentTo : j.error || r.status}`])
    }
    setBusy(false)
  }

  return (
    <main className="min-h-screen bg-gray-50 p-5">
      <div className="max-w-2xl mx-auto">
        <Link href="/admin" className="text-[13px] text-gray-400">← Admin</Link>
        <h1 className="text-xl font-semibold text-gray-900 mt-3">Εκκαθαρίσεις πλυντηρίων</h1>
        <p className="text-[13px] text-gray-500 mt-1">Ένα email ανά ιδιοκτήτη με τα PDF του, το ποσό και κουμπί Revolut. Reply-to: support@washio.gr</p>

        <div className="mt-5 bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
          <label className="text-[12px] text-gray-500">Μήνας (όπως θα γράφει το email)
            <input value={month} onChange={e => setMonth(e.target.value)} className="mt-1 w-full h-9 px-3 rounded-lg border border-gray-200 text-[14px]" />
          </label>
          <input id="pdfs" type="file" accept="application/pdf" multiple onChange={e => setFiles([...(e.target.files || [])])} className="text-[13px]" />
        </div>

        {matched.length > 0 && (
          <div className="mt-4 bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-gray-50 text-gray-500"><tr><th className="text-left p-2.5">Αρχείο</th><th className="text-left p-2.5">Πλυντήριο</th><th className="text-right p-2.5">Ποσό</th></tr></thead>
              <tbody>
                {matched.map(m => (
                  <tr key={m.file.name} className="border-t border-gray-100">
                    <td className="p-2.5 text-gray-500 truncate max-w-[220px]">{m.file.name.replace(/^Washio_[^_]+_/, '')}</td>
                    <td className={`p-2.5 font-medium ${m.loc ? 'text-gray-900' : 'text-red-600'}`}>{m.loc?.name || 'Δεν βρέθηκε'}</td>
                    <td className={`p-2.5 text-right font-semibold ${m.amount < 0 ? 'text-green-700' : 'text-gray-900'}`}>{m.amount < 0 ? `του χρωστάμε ${(-m.amount).toFixed(2)}€` : `${m.amount.toFixed(2)}€`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="p-2.5 text-[12px] text-gray-500 border-t border-gray-100">{groups.length} emails (ίδιος ιδιοκτήτης = ένα email)</p>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button disabled={busy || !groups.length} onClick={() => send('test')} className="h-10 px-4 rounded-lg border border-gray-300 text-[13px] font-semibold disabled:opacity-40">Δοκιμή σε μένα</button>
          <button disabled={busy || !groups.length || matched.some(m => !m.loc)} onClick={() => send('send')} className="h-10 px-4 rounded-lg bg-gray-900 text-white text-[13px] font-semibold disabled:opacity-40">Αποστολή σε όλα</button>
        </div>
        {log.length > 0 && <pre className="mt-4 bg-white rounded-xl border border-gray-200 p-3 text-[12px] whitespace-pre-wrap">{log.join('\n')}</pre>}
      </div>
    </main>
  )
}
