'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Loc = {
  id: string; name: string; active: boolean
  ownerEmail: string | null; lastSignIn: string | null
  native: string[]; web: number
}
type Result = { tokenCount: number; successCount: number; failureCount: number; errors: { code?: string; message?: string }[]; exception?: string; fcmReady: boolean; fcmError?: string | null }

// Admin: διάγνωση ειδοποιήσεων πλυντηρίων. Δείχνει tokens ανά owner και στέλνει
// δοκιμαστική ειδοποίηση με την πλήρη απάντηση του Firebase (γιατί δεν φτάνει).
export default function PushTestPage() {
  const [locs, setLocs] = useState<Loc[] | null>(null)
  const [fcmError, setFcmError] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState('')
  const [results, setResults] = useState<Record<string, Result>>({})

  const load = () => fetch('/api/admin/push-test').then(r => r.json()).then(j => {
    if (j.error) { setErr(j.error); return }
    setLocs(j.locations); setFcmError(j.fcmError)
  }).catch(() => setErr('Σφάλμα φόρτωσης'))
  useEffect(() => { load() }, [])

  const test = async (id: string) => {
    if (!confirm('Θα σταλεί ΔΟΚΙΜΑΣΤΙΚΗ ειδοποίηση στο κινητό του πλυντηρίου. Συνέχεια;')) return
    setBusy(id)
    try {
      const r = await fetch('/api/admin/push-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locationId: id }) })
      const j = await r.json()
      setResults(p => ({ ...p, [id]: j }))
      load()
    } finally { setBusy('') }
  }

  const fmt = (s: string | null) => s ? new Date(s).toLocaleString('el-GR', { timeZone: 'Europe/Athens', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <main className="min-h-screen bg-gray-50 px-5 py-8">
      <div className="max-w-xl mx-auto">
        <Link href="/admin" className="text-[13px] text-gray-500">← Admin</Link>
        <h1 className="text-[22px] font-bold text-gray-900 mt-3">Ειδοποιήσεις πλυντηρίων</h1>
        <p className="text-[13px] text-gray-500 mt-1">Ποιος έχει καταχωρημένο κινητό για ειδοποιήσεις — και δοκιμή αποστολής.</p>
        {fcmError && <p className="text-[12px] text-red-600 bg-red-50 rounded-lg px-3 py-2 mt-3">Firebase: {fcmError}</p>}
        {err && <p className="text-[13px] text-red-600 mt-4">{err}</p>}
        {!locs && !err && <p className="text-[13px] text-gray-400 mt-4">Φόρτωση…</p>}
        <div className="space-y-2.5 mt-4">
          {locs?.map(l => {
            const r = results[l.id]
            return (
              <div key={l.id} className="bg-white border border-gray-100 rounded-2xl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-gray-900">{l.name}{!l.active && <span className="text-gray-400 font-normal"> · ανενεργό</span>}</p>
                    <p className="text-[12px] text-gray-500 mt-0.5 truncate">{l.ownerEmail || 'χωρίς owner'} · σύνδεση {fmt(l.lastSignIn)}</p>
                    <p className={`text-[12px] mt-1 ${l.native.length ? 'text-green-700' : 'text-amber-700'}`}>
                      {l.native.length ? `📱 ${l.native.map(n => { const [p, d] = n.split(' · '); return `${p} (${fmt(d)})` }).join(', ')}` : '📱 Κανένα κινητό καταχωρημένο'}
                      {l.web ? ` · 🌐 web ${l.web}` : ''}
                    </p>
                  </div>
                  <button onClick={() => test(l.id)} disabled={!!busy || !l.ownerEmail}
                    className="shrink-0 bg-gray-900 text-white text-[12px] font-semibold px-3 py-2 rounded-lg disabled:opacity-40">
                    {busy === l.id ? '…' : 'Δοκιμή'}
                  </button>
                </div>
                {r && (
                  <div className={`mt-3 rounded-lg px-3 py-2 text-[12px] ${r.successCount > 0 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}>
                    {r.successCount > 0 ? `✓ Στάλθηκε σε ${r.successCount}/${r.tokenCount} κινητό(ά). Αν δεν εμφανίστηκε, το θέμα είναι στη συσκευή (εξοικονόμηση μπαταρίας / κανάλι ειδοποιήσεων).`
                      : r.tokenCount === 0 ? 'Δεν υπάρχει καταχωρημένο κινητό — ο owner πρέπει να ανοίξει την εφαρμογή συνδεδεμένος ΜΕ ΑΥΤΟ το email και να πατήσει «Ενεργοποίηση» στο dashboard.'
                      : `✗ Απέτυχε: ${r.errors.map(e => e.code || e.message).join(', ') || r.exception || (r.fcmReady ? 'άγνωστο' : 'Firebase μη ρυθμισμένο')}`}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
