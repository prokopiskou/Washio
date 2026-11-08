'use client'

import { useCallback, useEffect, useState } from 'react'

// Admin → Μετρήσεις → «Ανά διαφήμιση»: ΔΙΚΑ ΜΑΣ νούμερα (100% των εγγραφών/κρατήσεων) ανά διαφήμιση,
// με έξοδα από το Meta. Αυτό αποφασίζει τι κλείνει / τι ανεβαίνει — όχι η στήλη «Αποτελέσματα» του Ads Manager.
type Ad = { ad: string; signups: number; bookers: number; bookings: number; first_bookings: number; booking_value: number; spend: number; clicks: number; campaigns: string }

const eur = (v: number) => `${Number(v || 0).toFixed(2).replace('.', ',')}€`
const per = (s: number, n: number) => n > 0 && s > 0 ? eur(s / n) : '—'
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(d)

export function AdsByAdPanel() {
  const [days, setDays] = useState(7)
  const [data, setData] = useState<{ ads: Ad[]; spendSyncedAt: string | null; apiConnected: boolean } | null>(null)
  const [err, setErr] = useState('')
  const [paste, setPaste] = useState(''); const [pasteDay, setPasteDay] = useState(ymd(new Date()))
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (d: number) => {
    const r = await fetch(`/api/admin/metrics?view=ads&days=${d}`); const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error || 'Σφάλμα'); return }
    setErr(''); setData(j)
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(days) }, [load, days])

  const syncNow = async () => {
    setBusy(true)
    const r = await fetch('/api/cron/ads-sync', { method: 'POST' }); const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!j.ok) { setErr(j.error || j.skipped || 'Σφάλμα συγχρονισμού'); return }
    load(days)
  }
  const savePaste = async () => {
    setBusy(true)
    const r = await fetch('/api/admin/metrics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ad_spend_paste', day: pasteDay, text: paste }) })
    const j = await r.json().catch(() => ({})); setBusy(false)
    if (!r.ok) { setErr(j.error || 'Σφάλμα'); return }
    setPaste(''); load(days)
  }

  const ads = data?.ads || []
  const tot = ads.reduce((a, x) => ({ spend: a.spend + Number(x.spend), signups: a.signups + x.signups, bookings: a.bookings + x.bookings, first: a.first + x.first_bookings }), { spend: 0, signups: 0, bookings: 0, first: 0 })
  // Καλύτερο / χειρότερο € ανά κράτηση (μόνο με έξοδα ≥ 5€ για να μη βγαίνουν τυχαία)
  const scored = ads.filter(a => Number(a.spend) >= 5 && a.ad !== '(χωρίς διαφήμιση)')
  const best = [...scored].filter(a => a.bookings > 0).sort((a, b) => a.spend / a.bookings - b.spend / b.bookings)[0]
  const dead = scored.filter(a => a.bookings === 0 && Number(a.spend) >= 15)

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-bold text-gray-900">Ανά διαφήμιση</p>
        <div className="flex gap-1">
          {[1, 7, 14, 30].map(d => (
            <button key={d} onClick={() => setDays(d)} className={`h-8 px-2.5 rounded-lg text-[12px] font-semibold border ${days === d ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-700'}`}>
              {d === 1 ? '24ω' : `${d}μ`}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[12px] text-gray-500">Δικά μας νούμερα: όλες οι εγγραφές και κρατήσεις, ανά διαφήμιση που τις έφερε. Έξοδα από το Meta.</p>

      {data && (
        <div className="grid grid-cols-4 gap-2 text-center">
          {[['Έξοδα', eur(tot.spend)], ['Εγγραφές', String(tot.signups)], ['Κρατήσεις', String(tot.bookings)], ['€ / κράτηση', per(tot.spend, tot.bookings)]].map(([l, v]) => (
            <div key={l} className="rounded-xl bg-gray-50 py-2"><p className="text-[11px] text-gray-500">{l}</p><p className="text-[15px] font-bold text-gray-900">{v}</p></div>
          ))}
        </div>
      )}

      {(best || dead.length > 0) && (
        <div className="text-[12.5px] space-y-1">
          {best && <p className="text-green-700">✓ Καλύτερη: <b>{best.ad}</b> · {per(best.spend, best.bookings)} / κράτηση</p>}
          {dead.map(d => <p key={d.ad} className="text-red-700">✗ <b>{d.ad}</b>: {eur(d.spend)} χωρίς καμία κράτηση</p>)}
        </div>
      )}

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[12px] min-w-[560px]">
          <thead><tr className="text-gray-400 text-left">
            <th className="font-medium py-1 px-1">Διαφήμιση</th><th className="font-medium text-right px-1">Έξοδα</th><th className="font-medium text-right px-1">Κλικ</th>
            <th className="font-medium text-right px-1">Εγγραφές</th><th className="font-medium text-right px-1">€/εγγρ.</th>
            <th className="font-medium text-right px-1">Κρατήσεις</th><th className="font-medium text-right px-1">1η κράτ.</th><th className="font-medium text-right px-1">€/κράτ.</th>
          </tr></thead>
          <tbody>{ads.map(a => (
            <tr key={a.ad} className="border-t border-gray-50">
              <td className="py-1.5 px-1"><p className="font-semibold text-gray-900">{a.ad}</p>{a.campaigns && <p className="text-[10.5px] text-gray-400 truncate max-w-[180px]">{a.campaigns}</p>}</td>
              <td className="text-right px-1">{Number(a.spend) ? eur(a.spend) : '—'}</td>
              <td className="text-right px-1 text-gray-500">{a.clicks || '—'}</td>
              <td className="text-right px-1 font-semibold">{a.signups}</td>
              <td className="text-right px-1">{per(a.spend, a.signups)}</td>
              <td className="text-right px-1 font-semibold">{a.bookings}</td>
              <td className="text-right px-1 text-gray-500">{a.first_bookings}</td>
              <td className={`text-right px-1 font-bold ${a.bookings ? 'text-gray-900' : Number(a.spend) >= 15 ? 'text-red-600' : 'text-gray-400'}`}>{per(a.spend, a.bookings)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400">Κρατήσεις = όσες έκαναν μέσα στην περίοδο οι χρήστες που ήρθαν από κάθε διαφήμιση (χωρίς ακυρώσεις, χωρίς ομάδα). Ίδιο όνομα διαφήμισης σε πολλές καμπάνιες → μετράει μαζί.</p>

      <div className="border-t border-gray-100 pt-3">
        {data?.apiConnected ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[12px] text-gray-500">Έξοδα: αυτόματα από Meta{data.spendSyncedAt ? ` · ${new Intl.DateTimeFormat('el-GR', { timeZone: 'Europe/Athens', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(data.spendSyncedAt))}` : ''}</p>
            <button onClick={syncNow} disabled={busy} className="h-8 px-3 rounded-lg border border-gray-200 text-[12px] font-semibold disabled:opacity-50">{busy ? '…' : 'Συγχρονισμός'}</button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[12px] text-amber-800">Τα έξοδα ανά διαφήμιση δεν συνδέθηκαν ακόμα με το Meta (λείπει META_ADS_TOKEN). Μέχρι τότε, γράψε τα χειροκίνητα:</p>
            <div className="flex gap-2">
              <input type="date" value={pasteDay} onChange={e => setPasteDay(e.target.value)} className="h-9 px-2 rounded-lg border border-gray-200 text-[13px]" />
            </div>
            <textarea value={paste} onChange={e => setPaste(e.target.value)} rows={3} placeholder={'Video 2 ; 5,42\nNEW video 2 ; 2,67'} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-[13px] font-mono" />
            <button onClick={savePaste} disabled={busy || !paste.trim()} className="h-9 px-3 rounded-lg bg-gray-900 text-white text-[12px] font-semibold disabled:opacity-40">Αποθήκευση εξόδων</button>
          </div>
        )}
      </div>
      {err && <p className="text-[12px] text-red-600">{err}</p>}
    </div>
  )
}
