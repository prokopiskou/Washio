'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckinResultCard, type CheckinResult } from '@/components/CheckinScanner'

// Στόχος του QR κράτησης: https://www.washio.gr/c/<κωδικός>
//  • Το πλυντήριο το σκανάρει με την κάμερα του κινητού (συνδεδεμένο) → check-in αμέσως.
//  • Οποιοσδήποτε άλλος (π.χ. ο πελάτης) → βλέπει τον κωδικό για να τον δείξει.
export default function CheckinLinkPage() {
  const params = useParams<{ code: string }>()
  const code = String(params?.code || '')
  const [state, setState] = useState<'loading' | 'owner' | 'show'>('loading')
  const [res, setRes] = useState<CheckinResult | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/bookings/checkin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, via: 'link' }),
    }).then(async r => {
      const j = await r.json().catch(() => ({})) as CheckinResult
      if (!alive) return
      if (r.status === 401 || r.status === 403 || r.status === 400) { setState('show'); return }
      setRes(j); setState('owner')
    }).catch(() => { if (alive) setState('show') })
    return () => { alive = false }
  }, [code])

  return (
    <main className="min-h-screen bg-white flex justify-center">
      <div className="w-full max-w-md px-5 pt-[calc(var(--safe-top,0px)+28px)] pb-10">
        <p className="text-center text-[20px] font-bold tracking-tight text-gray-900">washio</p>
        {state === 'loading' && <p className="text-center text-[13px] text-gray-400 mt-16">Φόρτωση…</p>}
        {state === 'owner' && res && (
          <div className="mt-6">
            <CheckinResultCard res={res} onNext={() => { window.location.href = '/dashboard' }} nextLabel="Στο dashboard" />
          </div>
        )}
        {state === 'show' && (
          <div className="mt-8 text-center">
            <p className="text-[17px] font-semibold text-gray-900">Δείξε αυτόν τον κωδικό στο πλυντήριο</p>
            <p className="text-[13px] text-gray-500 mt-1">Τον σκανάρουν όταν φτάσεις.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/qr/${code}`} alt="QR" width={240} height={240} className="mx-auto mt-5 w-[240px] h-[240px]" />
            <p className="font-mono text-[15px] font-semibold text-gray-900 mt-3">WS-{code.split('.')[0]}</p>
            <a href="/dashboard" className="inline-block mt-8 text-[12px] text-gray-400 underline">Είσαι το πλυντήριο; Σύνδεση</a>
          </div>
        )}
      </div>
    </main>
  )
}
