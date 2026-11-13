'use client'

import { useCallback, useEffect, useState } from 'react'

// Admin → «Κατηγορίες»: ποια πλυντήρια ενισχύουμε και πόσα € τη μέρα παίρνει το καθένα (και κάθε ad set).
type Tier = 'winner' | 'candidate' | 'new' | 'dead' | 'review'
type Stat = {
  id: string; name: string; city: string; liveDays: number; n7: number; n14: number; n30: number; gmv14: number; gmv30: number; fee30: number
  cancelRate: number; customers: number; repeaters: number; rating: number | null; reviews: number; lastBooking: string | null
  tier: Tier; prevTier: Tier | null; reason: string; budget: number
}
type Plan = {
  daily: number; unallocated: number
  byTier: Record<Tier, { count: number; budget: number; n14: number }>
  clusters: { name: string; lat: number; lng: number; budget: number; members: { id: string; name: string; tier: Tier; budget: number }[] }[]
}
type Data = { plan: Plan; stats: Stat[]; meta: Record<Tier, { label: string; emoji: string; action: string }>; dailySource: string; prevAt: string | null }

const ORDER: Tier[] = ['winner', 'candidate', 'new', 'review', 'dead']
const TONE: Record<Tier, string> = {
  winner: 'bg-amber-50 border-amber-200 text-amber-900',
  candidate: 'bg-sky-50 border-sky-200 text-sky-900',
  new: 'bg-green-50 border-green-200 text-green-900',
  review: 'bg-red-50 border-red-200 text-red-900',
  dead: 'bg-gray-50 border-gray-200 text-gray-600',
}
const eur = (v: number) => `${Number(v || 0).toFixed(2).replace('.', ',')}€`

export function TiersPanel() {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [daily, setDaily] = useState('')
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState<Tier | null>('winner')

  const load = useCallback(async (try_?: number) => {
    setErr('')
    const r = await fetch('/api/admin/tiers' + (try_ ? `?daily=${try_}` : ''), { cache: 'no-store' })
    const j = await r.json().catch(() => null)
    if (!r.ok || !j?.plan) { setErr(j?.error || 'Σφάλμα φόρτωσης'); return }
    setData(j); if (!try_) setDaily(String(j.plan.daily))
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true)
    await fetch('/api/admin/tiers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ daily: Number(daily) || 0 }) })
    setSaving(false); load()
  }

  if (!data) return <div className="rounded-2xl border border-gray-200 bg-white p-4 text-[13px] text-gray-500">{err || 'Φόρτωση κατηγοριών…'}</div>
  const { plan, stats, meta } = data

  return (
    <div className="space-y-4">
      {/* Budget */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="text-[12px] text-gray-500">Ημερήσιο budget διαφήμισης</p>
            <div className="mt-1 flex items-center gap-2">
              <input value={daily} onChange={e => setDaily(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal"
                className="w-24 h-9 rounded-lg border border-gray-300 px-2 text-[15px] font-semibold" />
              <span className="text-[13px] text-gray-500">€ / μέρα</span>
              <button onClick={() => load(Number(daily) || 0)} className="h-9 px-3 rounded-lg border border-gray-300 text-[13px]">Δοκιμή</button>
              <button onClick={save} disabled={saving} className="h-9 px-3 rounded-lg bg-gray-900 text-white text-[13px] font-semibold">{saving ? '…' : 'Αποθήκευση'}</button>
            </div>
          </div>
          <p className="text-[12px] text-gray-500 pb-2">Πηγή: {data.dailySource}{plan.unallocated > 0.5 ? ` · αδιάθετα ${eur(plan.unallocated)}` : ''}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
          {ORDER.map(t => (
            <button key={t} onClick={() => setOpen(open === t ? null : t)} className={`text-left rounded-xl border p-3 ${TONE[t]} ${open === t ? 'ring-2 ring-gray-900/20' : ''}`}>
              <p className="text-[12px] font-semibold">{meta[t].emoji} {meta[t].label}</p>
              <p className="mt-1 text-[22px] font-bold leading-none">{plan.byTier[t].count}</p>
              <p className="mt-1 text-[12px]">{eur(plan.byTier[t].budget)}/μέρα · {plan.daily ? Math.round(100 * plan.byTier[t].budget / plan.daily) : 0}%</p>
              <p className="text-[11px] opacity-70">{plan.byTier[t].n14} κρατήσεις / 14 μέρες</p>
            </button>
          ))}
        </div>
      </div>

      {/* Ad sets */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="text-[14px] font-semibold text-gray-900">Ad sets στο Meta (περιοχές ~4 km)</p>
        <p className="text-[12px] text-gray-500">Ένα ad set ανά περιοχή: pin στο πρώτο πλυντήριο, ακτίνα 3 mi, budget όσο λέει η στήλη.</p>
        <div className="mt-3 divide-y divide-gray-100">
          {plan.clusters.map((c, i) => (
            <div key={i} className="py-2 flex items-start gap-3">
              <span className="w-16 shrink-0 text-[15px] font-bold text-gray-900">{eur(c.budget)}</span>
              <div className="min-w-0 text-[13px]">
                <p className="font-semibold text-gray-900">{c.members[0].name}{c.members.length > 1 ? ` +${c.members.length - 1}` : ''} <span className="font-normal text-gray-400">· {c.name}</span></p>
                <p className="text-[12px] text-gray-500">{c.members.map(m => `${meta[m.tier].emoji} ${m.name} ${eur(m.budget)}`).join(' · ')}</p>
                <a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noreferrer" className="text-[11px] text-blue-600">{c.lat.toFixed(5)}, {c.lng.toFixed(5)}</a>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Πλυντήρια ανά κατηγορία */}
      {ORDER.filter(t => open === t || open == null).map(t => {
        const rows = stats.filter(s => s.tier === t)
        if (!rows.length) return null
        return (
          <div key={t} className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-[14px] font-semibold text-gray-900">{meta[t].emoji} {meta[t].label} · {rows.length}</p>
            <p className="text-[12px] text-gray-500">{meta[t].action}</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead><tr className="text-left text-gray-400">
                  <th className="py-1 pr-2">Πλυντήριο</th><th className="pr-2">€/μέρα</th><th className="pr-2">7μ</th><th className="pr-2">14μ</th><th className="pr-2">30μ</th>
                  <th className="pr-2">Τζίρος 14μ</th><th className="pr-2">Ξαναήρθαν</th><th className="pr-2">★</th><th className="pr-2">Ακυρ.</th><th>Γιατί</th>
                </tr></thead>
                <tbody>
                  {rows.map(s => (
                    <tr key={s.id} className="border-t border-gray-100">
                      <td className="py-1.5 pr-2 font-medium text-gray-900 whitespace-nowrap">
                        {s.name}
                        {s.prevTier && s.prevTier !== s.tier && <span className="ml-1 text-[10px] text-gray-400">(πριν: {meta[s.prevTier].label})</span>}
                      </td>
                      <td className="pr-2 font-semibold">{s.budget ? eur(s.budget) : '—'}</td>
                      <td className="pr-2">{s.n7}</td><td className="pr-2">{s.n14}</td><td className="pr-2">{s.n30}</td>
                      <td className="pr-2">{eur(s.gmv14)}</td>
                      <td className="pr-2">{s.repeaters}/{s.customers}</td>
                      <td className="pr-2">{s.rating != null ? `${s.rating} (${s.reviews})` : '—'}</td>
                      <td className="pr-2">{Math.round(s.cancelRate * 100)}%</td>
                      <td className="text-gray-500 whitespace-nowrap">{s.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
