'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// Ρυθμίσεις dashboard → «Σκάνερ καταστήματος»: link ανά πλυντήριο για τους υπαλλήλους
// (check-in με QR χωρίς login, μόνο για αυτό το πλυντήριο). «Νέο link» → το παλιό σταματά.
export function StoreScannerLink({ locationId, locationName }: { locationId: string; locationName: string }) {
  const [url, setUrl] = useState('')
  const [qr, setQr] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const apply = async (u: string) => { setUrl(u); setQr(u ? await QRCode.toDataURL(u, { width: 360, margin: 1, color: { dark: '#10182A', light: '#FFFFFF' } }) : '') }

  useEffect(() => {
    let alive = true
    fetch(`/api/locations/scan-token?locationId=${locationId}`).then(r => r.json()).then(j => {
      if (!alive) return
      if (j?.url) apply(j.url); else setErr(j?.error || 'Σφάλμα')
    }).catch(() => { if (alive) setErr('Σφάλμα σύνδεσης') })
    return () => { alive = false }
  }, [locationId])

  const rotate = async () => {
    if (!confirm('Νέο link; Το παλιό θα σταματήσει να δουλεύει σε όλες τις συσκευές.')) return
    setBusy(true)
    try {
      const r = await fetch('/api/locations/scan-token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locationId }) })
      const j = await r.json(); if (j?.url) await apply(j.url); else setErr(j?.error || 'Σφάλμα')
    } finally { setBusy(false) }
  }
  const share = async () => {
    const text = `Σκάνερ Washio για το ${locationName}: άνοιξέ το και βάλ' το στην αρχική οθόνη.`
    try {
      if (navigator.share) { await navigator.share({ title: 'Σκάνερ Washio', text, url }); return }
    } catch { /* ακύρωση */ }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* ignore */ }
  }

  return (
    <div className="bg-white border border-gray-100 rounded-[14px] p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
      <p className="text-[15px] font-semibold tracking-tight text-gray-900">Σκάνερ καταστήματος · {locationName}</p>
      <p className="text-[13px] text-gray-500 mt-1 leading-relaxed">
        Για τους υπαλλήλους: ανοίγει μόνο την κάμερα check-in για <b>αυτό</b> το πλυντήριο, χωρίς σύνδεση. Δεν βλέπουν έσοδα, ρυθμίσεις ή άλλα καταστήματα.
        Άνοιξέ το στο κινητό/tablet του καταστήματος και βάλ&apos; το στην αρχική οθόνη.
      </p>
      {err && <p className="text-[12px] text-red-600 mt-3">{err}</p>}
      {url && (
        <div className="mt-4 flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr && <img src={qr} alt="QR σκάνερ" className="w-[160px] h-[160px]" />}
          <p className="text-[11px] text-gray-400 mt-2 break-all text-center">{url}</p>
          <div className="grid grid-cols-2 gap-2 w-full mt-3">
            <button onClick={share} className="h-11 rounded-xl bg-gray-900 text-white text-[13px] font-semibold">{copied ? 'Αντιγράφηκε ✓' : 'Στείλε το link'}</button>
            <button onClick={rotate} disabled={busy} className="h-11 rounded-xl border border-gray-200 text-gray-700 text-[13px] font-semibold disabled:opacity-50">{busy ? '…' : 'Νέο link'}</button>
          </div>
        </div>
      )}
    </div>
  )
}
