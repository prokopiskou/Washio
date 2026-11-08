'use client'

import { useCallback, useEffect, useState } from 'react'

// Admin → Οικονομικά: ρύθμιση checkout (προεπιλογή πληρωμής, τέλος κάρτας) + σύγκριση πριν/μετά.
type W = {
  days: number; visitors: number; bookings: number; conversion: number | null; cardShare: number | null
  card: { n: number; cancelled: number | null; noShow: number | null }
  venue: { n: number; cancelled: number | null; noShow: number | null }
  netPerVisitor: number | null; commission: number; stripeCost: number
}
type Data = { config: { defaultPay: 'card' | 'venue'; cardFee: boolean; since: string | null }; report: { after: W; before: W; since: string } }

const pct = (v: number | null) => v == null ? '—' : `${v}%`
const eur = (v: number | null) => v == null ? '—' : `${v.toFixed(2).replace('.', ',')}€`
const d = (iso: string) => new Intl.DateTimeFormat('el-GR', { timeZone: 'Europe/Athens', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

export function CheckoutExperimentPanel() {
  const [data, setData] = useState<Data | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/checkout-config')
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error || 'Σφάλμα'); return }
    setData(j)
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const save = async (defaultPay: 'card' | 'venue', cardFee: boolean) => {
    if (!confirm(`Αλλαγή checkout:\n\nΠροεπιλογή: ${defaultPay === 'card' ? 'Κάρτα' : 'Στο πλυντήριο'}\nΤέλος κάρτας: ${cardFee ? 'Ναι (0,30€)' : 'Όχι'}\n\nΞεκινά νέα περίοδος σύγκρισης από τώρα.`)) return
    setBusy(true); setErr('')
    const r = await fetch('/api/admin/checkout-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ defaultPay, cardFee }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(j.error || 'Σφάλμα'); return }
    load()
  }

  if (!data) return <div className="rounded-2xl border border-gray-200 bg-white p-4 text-[13px] text-gray-400">{err || 'Φόρτωση checkout…'}</div>
  const { config: c, report: r } = data
  const rows: [string, (w: W) => string][] = [
    ['Επισκέπτες checkout', w => String(w.visitors)],
    ['Κρατήσεις', w => String(w.bookings)],
    ['Checkout → κράτηση', w => pct(w.conversion)],
    ['Πληρωμές με κάρτα', w => pct(w.cardShare)],
    ['Ακυρώσεις · κάρτα', w => `${pct(w.card.cancelled)} (${w.card.n})`],
    ['Ακυρώσεις · πλυντήριο', w => `${pct(w.venue.cancelled)} (${w.venue.n})`],
    ['Δεν ήρθαν · κάρτα', w => pct(w.card.noShow)],
    ['Δεν ήρθαν · πλυντήριο', w => pct(w.venue.noShow)],
    ['Καθαρό ανά επισκέπτη', w => eur(w.netPerVisitor)],
    ['Προμήθεια / κόστος Stripe', w => `${eur(w.commission)} / ${eur(w.stripeCost)}`],
  ]
  const btn = (on: boolean) => `h-9 px-3 rounded-lg text-[12px] font-semibold border ${on ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'}`

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
      <div>
        <p className="text-[15px] font-bold text-gray-900">Checkout · δοκιμή πληρωμής</p>
        <p className="text-[12px] text-gray-500 mt-0.5">Ισχύει από {c.since ? d(c.since) : '—'} · σύγκριση με την ίδια διάρκεια πριν.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-gray-500 w-20">Προεπιλογή</span>
        <button disabled={busy} onClick={() => save('card', c.cardFee)} className={btn(c.defaultPay === 'card')}>💳 Κάρτα</button>
        <button disabled={busy} onClick={() => save('venue', c.cardFee)} className={btn(c.defaultPay === 'venue')}>💵 Στο πλυντήριο</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-gray-500 w-20">Τέλος κάρτας</span>
        <button disabled={busy} onClick={() => save(c.defaultPay, false)} className={btn(!c.cardFee)}>Όχι</button>
        <button disabled={busy} onClick={() => save(c.defaultPay, true)} className={btn(c.cardFee)}>Ναι · 0,30€</button>
      </div>
      <table className="w-full text-[12px]">
        <thead><tr className="text-gray-400"><th className="text-left font-medium py-1">Μέτρηση</th><th className="text-right font-medium">Πριν ({r.before.days}μ)</th><th className="text-right font-medium">Τώρα ({r.after.days}μ)</th></tr></thead>
        <tbody>
          {rows.map(([label, f]) => (
            <tr key={label} className="border-t border-gray-100">
              <td className="py-1.5 text-gray-600">{label}</td>
              <td className="text-right text-gray-500">{f(r.before)}</td>
              <td className="text-right font-semibold text-gray-900">{f(r.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[11px] text-gray-400">Όριο ασφαλείας: αν το «Checkout → κράτηση» πέσει κάτω από ~35% για 4–5 μέρες, γύρνα την προεπιλογή στο πλυντήριο.</p>
      {err && <p className="text-[12px] text-red-600">{err}</p>}
    </div>
  )
}
