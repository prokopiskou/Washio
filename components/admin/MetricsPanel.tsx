'use client'

import { useCallback, useEffect, useState } from 'react'
import { CacChart, type CacDay } from '@/components/admin/CacChart'

// Admin → «Μετρήσεις»: πορεία ανά μέρα + ημερολόγιο αλλαγών με αυτόματο «πριν / μετά».
type Day = {
  d: string; map_open: number; washer_open: number; picker_open: number; car_picked: number; service_select: number; book_click: number
  booking_page: number; pay_click: number; bookings: number; cancelled: number; no_show: number; scanned: number; card: number
  commission: number; ad_spend: number
}
type Row = { key: string; label: string; before: number | null; after: number | null; nBefore: number; nAfter: number; z: number; sig: boolean; better: boolean }
type Change = { id: string; at: string; title: string; area: string | null; source: string; days: number; rows: Row[]; verdict: { text: string; tone: 'good' | 'bad' | 'wait' | 'flat' } }

const pct = (n: number, d: number) => d ? `${Math.round(100 * n / d)}%` : '—'
const p1 = (v: number | null) => v == null ? '—' : `${Math.round(v * 100)}%`
const eur = (v: number) => `${Number(v || 0).toFixed(2).replace('.', ',')}€`
const dayLbl = (ymd: string) => new Intl.DateTimeFormat('el-GR', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' }).format(new Date(ymd + 'T12:00:00Z'))
const when = (iso: string) => new Intl.DateTimeFormat('el-GR', { timeZone: 'Europe/Athens', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
const TONE = { good: 'bg-green-50 text-green-700', bad: 'bg-red-50 text-red-700', wait: 'bg-gray-100 text-gray-600', flat: 'bg-amber-50 text-amber-800' }
const AREAS = ['χάρτης', 'checkout', 'κουπόνι', 'διαφημίσεις', 'πλυντήρια', 'άλλο']

export function MetricsPanel() {
  const [data, setData] = useState<{ daily: Day[]; changes: Change[]; cac?: CacDay[] } | null>(null)
  const [err, setErr] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [title, setTitle] = useState(''); const [area, setArea] = useState('χάρτης')
  const [spendDay, setSpendDay] = useState(''); const [spendAmt, setSpendAmt] = useState('')

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/metrics'); const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error || 'Σφάλμα'); return }
    setErr(''); setData(j)
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch('/api/admin/metrics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({})); if (!r.ok) { setErr(j.error || 'Σφάλμα'); return false }
    load(); return true
  }

  if (!data) return <div className="rounded-2xl border border-gray-200 bg-white p-4 text-[13px] text-gray-500">{err || 'Φόρτωση μετρήσεων…'}</div>
  const days = data.daily
  const th = 'text-right font-medium px-1.5 py-1 whitespace-nowrap'
  const td = 'text-right px-1.5 py-1.5 whitespace-nowrap'

  return (
    <div className="space-y-4">
      <CacChart days={data.cac || []} />

      {/* Ημερολόγιο αλλαγών */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="text-[15px] font-bold text-gray-900">Αλλαγές · τι έκαναν</p>
        <p className="text-[12px] text-gray-500 mt-0.5">Μετά (έως 7 μέρες) vs ίδιες μέρες/ώρες ακριβώς μία εβδομάδα πριν. ★ = σίγουρη διαφορά (95%).</p>
        <div className="mt-3 space-y-2">
          {data.changes.map(c => (
            <div key={c.id} className="rounded-xl border border-gray-100">
              <button onClick={() => setOpen(open === c.id ? null : c.id)} className="w-full text-left px-3 py-2.5 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900 truncate">{c.title}</p>
                  <p className="text-[11px] text-gray-400">{when(c.at)} · {c.area || '—'} · {c.days ? `${c.days} μέρες μετά` : 'μόλις άρχισε'}</p>
                </div>
                <span className={`shrink-0 text-[11px] font-bold px-2 py-1 rounded-md ${TONE[c.verdict.tone]}`}>{c.verdict.text}</span>
              </button>
              {open === c.id && c.rows.length > 0 && (
                <div className="px-3 pb-3">
                  <table className="w-full text-[12px]">
                    <thead><tr className="text-gray-400"><th className="text-left font-medium py-1">Βήμα</th><th className={th}>Πριν</th><th className={th}>Μετά</th><th className={th}></th></tr></thead>
                    <tbody>{c.rows.map(r => (
                      <tr key={r.key} className="border-t border-gray-50">
                        <td className="py-1.5 text-gray-600">{r.label}</td>
                        <td className={td + ' text-gray-500'}>{p1(r.before)} <span className="text-gray-300">({r.nBefore})</span></td>
                        <td className={td + ' font-semibold text-gray-900'}>{p1(r.after)} <span className="text-gray-300 font-normal">({r.nAfter})</span></td>
                        <td className={td + ` font-bold ${r.after == null || r.before == null ? 'text-gray-300' : r.better ? 'text-green-600' : 'text-red-600'}`}>
                          {r.after == null || r.before == null ? '' : `${r.after > r.before ? '↑' : r.after < r.before ? '↓' : '='}${r.sig ? '★' : ''}`}
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                  <button onClick={() => { if (confirm('Διαγραφή αυτής της αλλαγής από το ημερολόγιο;')) post({ action: 'delete_change', id: c.id }) }} className="mt-2 text-[11px] text-gray-400 underline">Διαγραφή από το ημερολόγιο</button>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Νέα αλλαγή (π.χ. νέο creative στο partners)" className="flex-1 min-w-0 h-9 px-2 rounded-lg border border-gray-200 text-[13px]" />
          <select value={area} onChange={e => setArea(e.target.value)} className="h-9 px-2 rounded-lg border border-gray-200 text-[13px] bg-white">{AREAS.map(a => <option key={a}>{a}</option>)}</select>
          <button onClick={async () => { if (await post({ action: 'change', title, area })) setTitle('') }} disabled={!title.trim()} className="h-9 px-3 rounded-lg bg-gray-900 text-white text-[12px] font-semibold disabled:opacity-40">+ Καταγραφή</button>
        </div>
      </div>

      {/* Πορεία ανά μέρα */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="text-[15px] font-bold text-gray-900">Πορεία ανά μέρα</p>
        <p className="text-[12px] text-gray-500 mt-0.5">Μοναδικοί επισκέπτες σε κάθε βήμα · % = από το προηγούμενο βήμα.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="text-[12px] min-w-[880px] w-full">
            <thead><tr className="text-gray-400 border-b border-gray-100">
              <th className="text-left font-medium py-1 pr-2">Μέρα</th>
              <th className={th}>Χάρτης</th><th className={th}>Πλυντ.</th><th className={th}>Όχημα</th><th className={th}>Υπηρ.</th><th className={th}>«Κλείσε»</th>
              <th className={th}>Checkout</th><th className={th}>Κρατήσεις</th><th className={th}>Κάρτα</th><th className={th}>Ακυρ.</th><th className={th}>Δεν ήρθαν</th>
              <th className={th}>Προμήθεια</th><th className={th}>Διαφήμιση</th><th className={th}>€/κράτηση</th>
            </tr></thead>
            <tbody>{days.map(x => (
              <tr key={x.d} className="border-b border-gray-50">
                <td className="py-1.5 pr-2 text-gray-700 whitespace-nowrap">{dayLbl(x.d)}</td>
                <td className={td}>{x.map_open}</td>
                <td className={td}>{x.washer_open} <span className="text-gray-400">{pct(x.washer_open, x.map_open)}</span></td>
                <td className={td}>{x.picker_open ? <>{x.car_picked}/{x.picker_open} <span className="text-gray-400">{pct(x.car_picked, x.picker_open)}</span></> : '—'}</td>
                <td className={td}>{x.service_select} <span className="text-gray-400">{pct(x.service_select, x.washer_open)}</span></td>
                <td className={td}>{x.book_click} <span className="text-gray-400">{pct(x.book_click, x.service_select)}</span></td>
                <td className={td}>{x.booking_page}</td>
                <td className={td + ' font-semibold'}>{x.bookings} <span className="text-gray-400 font-normal">{pct(x.bookings, x.booking_page)}</span></td>
                <td className={td}>{pct(x.card, x.bookings)}</td>
                <td className={td}>{x.cancelled}</td>
                <td className={td}>{x.no_show}</td>
                <td className={td}>{eur(x.commission)}</td>
                <td className={td}>{x.ad_spend ? eur(x.ad_spend) : '—'}</td>
                <td className={td}>{x.ad_spend && x.bookings ? eur(x.ad_spend / x.bookings) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-gray-500">Κόστος διαφήμισης:</span>
          <input type="date" value={spendDay} onChange={e => setSpendDay(e.target.value)} className="h-9 px-2 rounded-lg border border-gray-200 text-[13px]" />
          <input value={spendAmt} onChange={e => setSpendAmt(e.target.value)} inputMode="decimal" placeholder="€" className="w-24 h-9 px-2 rounded-lg border border-gray-200 text-[13px]" />
          <button onClick={async () => { if (await post({ action: 'spend', day: spendDay, amount: Number(String(spendAmt).replace(',', '.')) })) setSpendAmt('') }}
            disabled={!spendDay || !spendAmt} className="h-9 px-3 rounded-lg bg-gray-900 text-white text-[12px] font-semibold disabled:opacity-40">Αποθήκευση</button>
        </div>
      </div>
      {err && <p className="text-[12px] text-red-600">{err}</p>}
    </div>
  )
}
