'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

// Admin: «Κοινό» — πόσους μπορούμε να στοχεύσουμε για ένα πλυντήριο (μόνο αριθμοί).
type Res = { total: number; byReason: Record<string, number>; channels: Record<string, number>; neverWashed: number; error?: string }

function Stat({ l, v }: { l: string; v: number | undefined }) {
  return <div className="bg-white rounded-xl border border-gray-200 p-3"><p className="text-[11px] text-gray-500">{l}</p><p className="text-[22px] font-semibold text-gray-900">{v ?? '–'}</p></div>
}

export default function AudiencePage() {
  const [locs, setLocs] = useState<{ id: string; name: string }[]>([])
  const [loc, setLoc] = useState('')
  const [km, setKm] = useState('3')
  const [viewed, setViewed] = useState('60')
  const [booked, setBooked] = useState(true)
  const [fav, setFav] = useState(true)
  const [lapsed, setLapsed] = useState('')
  const [res, setRes] = useState<Res | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { fetch('/api/admin/audience').then(r => r.json()).then(j => setLocs(j.locations || [])) }, [])

  const run = async () => {
    if (!loc) return
    setBusy(true)
    const q = new URLSearchParams({ location: loc, km, days: '90', viewed, booked: booked ? '1' : '0', fav: fav ? '1' : '0', lapsed })
    const j = await fetch('/api/admin/audience?' + q.toString()).then(r => r.json()).catch(() => ({ error: 'Δίκτυο' }))
    setRes(j); setBusy(false)
  }

  const box = 'h-9 px-3 rounded-lg border border-gray-200 text-[14px] bg-white'

  return (
    <main className="min-h-screen bg-gray-50 p-5">
      <div className="max-w-3xl mx-auto">
        <Link href="/admin" className="text-[13px] text-gray-400">← Admin</Link>
        <h1 className="text-xl font-semibold text-gray-900 mt-3">Κοινό</h1>
        <p className="text-[13px] text-gray-500 mt-1">Πόσους μπορούμε να στοχεύσουμε για ένα πλυντήριο. Μόνο αριθμοί — τα δεδομένα δεν φεύγουν ποτέ προς τα πλυντήρια. Ομάδα/δοκιμές εξαιρούνται.</p>

        <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-2 gap-3 text-[13px]">
          <label className="col-span-2">Πλυντήριο
            <select value={loc} onChange={e => setLoc(e.target.value)} className={box + ' w-full mt-1'}>
              <option value="">Επίλεξε…</option>
              {locs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label>Κοντά (χλμ., κενό = όχι)<input value={km} onChange={e => setKm(e.target.value)} inputMode="decimal" className={box + ' w-full mt-1'} /></label>
          <label>Το είδαν τις τελευταίες (μέρες, κενό = όχι)<input value={viewed} onChange={e => setViewed(e.target.value)} inputMode="numeric" className={box + ' w-full mt-1'} /></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={booked} onChange={e => setBooked(e.target.checked)} /> Έχουν κλείσει εκεί</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={fav} onChange={e => setFav(e.target.checked)} /> Το έχουν στα αγαπημένα</label>
          <label className="col-span-2">Μόνο όσοι δεν έχουν πλύνει εδώ και (μέρες, κενό = όλοι)<input value={lapsed} onChange={e => setLapsed(e.target.value)} inputMode="numeric" className={box + ' w-full mt-1'} /></label>
          <button onClick={run} disabled={!loc || busy} className="col-span-2 h-10 rounded-lg bg-gray-900 text-white font-semibold disabled:opacity-40">{busy ? 'Υπολογισμός…' : 'Υπολόγισε κοινό'}</button>
        </div>

        {res?.error && <p className="mt-3 text-red-600 text-[13px]">{res.error}</p>}
        {res && !res.error && (
          <div className="mt-4 flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3">
              <Stat l="Σύνολο κοινού" v={res.total} />
              <Stat l="Με push" v={res.channels.push} />
              <Stat l="Με email" v={res.channels.email} />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <Stat l="Κοντά" v={res.byReason.near} />
              <Stat l="Το είδαν" v={res.byReason.viewed} />
              <Stat l="Έκλεισαν εκεί" v={res.byReason.booked} />
              <Stat l="Αγαπημένο" v={res.byReason.favorite} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Stat l="Push ή email" v={res.channels.pushOrEmail} />
              <Stat l="Χωρίς κανάλι" v={res.channels.none} />
              <Stat l="Δεν έχουν πλύνει ποτέ" v={res.neverWashed} />
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
