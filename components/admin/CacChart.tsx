'use client'

import { useMemo, useState } from 'react'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts'

// Admin → Μετρήσεις: CAC (κόστος διαφήμισης / νέοι πελάτες) και €/κράτηση, μαζί με κρατήσεις.
// Μπάρες = κρατήσεις (νέοι πελάτες + επαναλήψεις) · γραμμές = CAC και €/κράτηση (δεξιός άξονας).
export type CacDay = { d: string; spend: number; bookings: number; new_customers: number }

const fmtDay = (ymd: string) => `${Number(ymd.slice(8, 10))}/${Number(ymd.slice(5, 7))}`
const eur = (v: number | null) => v == null ? '—' : `${v.toFixed(2).replace('.', ',')}€`

function mondayOf(ymd: string) {
  const t = Date.parse(ymd + 'T12:00:00Z'); const dow = (new Date(t).getUTCDay() + 6) % 7
  return new Date(t - dow * 864e5).toISOString().slice(0, 10)
}

export function CacChart({ days }: { days: CacDay[] }) {
  const [mode, setMode] = useState<'week' | 'day'>('week')

  const rows = useMemo(() => {
    const src = mode === 'day' ? days.slice(-28) : (() => {
      const m = new Map<string, CacDay>()
      for (const x of days) {
        const k = mondayOf(x.d); const e = m.get(k) || { d: k, spend: 0, bookings: 0, new_customers: 0 }
        e.spend += x.spend; e.bookings += x.bookings; e.new_customers += x.new_customers; m.set(k, e)
      }
      return [...m.values()]
    })()
    return src.map(x => ({
      label: mode === 'week' ? `εβδ. ${fmtDay(x.d)}` : fmtDay(x.d),
      spend: Math.round(x.spend * 100) / 100,
      new_customers: x.new_customers,
      repeat: Math.max(0, x.bookings - x.new_customers),
      bookings: x.bookings,
      cac: x.new_customers ? Math.round(x.spend / x.new_customers * 100) / 100 : null,
      cpb: x.bookings ? Math.round(x.spend / x.bookings * 100) / 100 : null,
    }))
  }, [days, mode])

  const tot = days.reduce((a, x) => ({ spend: a.spend + x.spend, bookings: a.bookings + x.bookings, nc: a.nc + x.new_customers }), { spend: 0, bookings: 0, nc: 0 })
  const last7 = days.slice(-7).reduce((a, x) => ({ spend: a.spend + x.spend, bookings: a.bookings + x.bookings, nc: a.nc + x.new_customers }), { spend: 0, bookings: 0, nc: 0 })

  if (!days.length) return null
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <p className="text-[15px] font-bold text-gray-900">CAC & κρατήσεις</p>
          <p className="text-[12px] text-gray-500 mt-0.5">CAC = κόστος διαφήμισης ÷ νέοι πελάτες (1η κράτηση). Κρατήσεις app χωρίς ακυρωμένες/ομάδα.</p>
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-[12px]">
          {(['week', 'day'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} className={`px-2.5 py-1 ${mode === m ? 'bg-gray-900 text-white' : 'text-gray-600'}`}>{m === 'week' ? 'Εβδομάδα' : 'Μέρα'}</button>
          ))}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ['CAC 7 μέρες', eur(last7.nc ? last7.spend / last7.nc : null)],
          ['€/κράτηση 7 μέρες', eur(last7.bookings ? last7.spend / last7.bookings : null)],
          ['CAC συνολικά', eur(tot.nc ? tot.spend / tot.nc : null)],
          ['Νέοι / κρατήσεις', `${tot.nc} / ${tot.bookings}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-gray-50 px-3 py-2">
            <p className="text-[11px] text-gray-500">{k}</p>
            <p className="text-[16px] font-bold text-gray-900">{v}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="#F0F0F0" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis yAxisId="n" tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} axisLine={false} allowDecimals={false} />
            <YAxis yAxisId="eur" orientation="right" tick={{ fontSize: 11, fill: '#6B7280' }} tickLine={false} axisLine={false} unit="€" />
            <Tooltip
              formatter={(v: unknown, name: unknown) => {
                const n = String(name)
                return [n.includes('€') || n.startsWith('CAC') || n.startsWith('Κόστος') ? eur(v == null ? null : Number(v)) : String(v), n]
              }}
              contentStyle={{ fontSize: 12, borderRadius: 10 }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar yAxisId="n" dataKey="new_customers" name="Νέοι πελάτες" stackId="b" fill="#10182A" radius={[0, 0, 0, 0]} />
            <Bar yAxisId="n" dataKey="repeat" name="Επαναλήψεις" stackId="b" fill="#9CA3AF" radius={[4, 4, 0, 0]} />
            <Line yAxisId="eur" dataKey="cac" name="CAC (€/νέο πελάτη)" stroke="#DC2626" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            <Line yAxisId="eur" dataKey="cpb" name="€/κράτηση" stroke="#1A6FD4" strokeWidth={2} dot={{ r: 2 }} connectNulls />
            <Line yAxisId="eur" dataKey="spend" name="Κόστος διαφήμισης" stroke="#D4A017" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
