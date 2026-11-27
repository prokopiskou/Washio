'use client'

// Τα πακέτα μου: υπόλοιπο πλυσιμάτων + «Χρησιμοποίησε 1 πλύσιμο» → QR για την είσοδο του τούνελ.
import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { useSwipeBack } from '@/lib/useSwipeBack'
import { CheckinQR, cachedQr, storeQr } from '@/components/CheckinQR'
import { funnel } from '@/lib/funnel'

type MyPack = { id: string; name: string; total: number; left: number; expiresAt: string; location: string; address: string; locationId: string; usable: boolean; fresh: boolean; status: string }

function fmtDate(iso: string) {
  const d = new Date(iso)
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

function Inner() {
  const sp = useSearchParams()
  const router = useRouter()
  const pi = sp.get('payment_intent') || ''
  const [packs, setPacks] = useState<MyPack[] | null>(null)
  const [qr, setQr] = useState<{ id: string; code: string; ref: string } | null>(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const r = await fetch(`/api/packs/mine${pi ? `?pi=${encodeURIComponent(pi)}` : ''}`)
    if (r.status === 401) { router.replace(`/login?redirect=${encodeURIComponent('/profile/packs')}`); return }
    const d = await r.json().catch(() => ({}))
    setPacks(d.packs || [])
  }, [pi, router])

  useEffect(() => { load() }, [load])
  // Αν το webhook αργεί: ξαναδοκίμασε 2 φορές μετά την πληρωμή.
  useEffect(() => {
    if (!pi || !packs || packs.some(p => p.fresh)) return
    const t = setTimeout(load, 2500)
    return () => clearTimeout(t)
  }, [pi, packs, load])

  const use = async (p: MyPack) => {
    setErr(''); setBusy(p.id)
    const cached = cachedQr('pack_' + p.id + '_' + new Date().toDateString())
    if (cached) { setQr({ id: p.id, code: cached, ref: '' }) }
    const r = await fetch('/api/packs/use', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purchaseId: p.id }) })
    const d = await r.json().catch(() => ({}))
    setBusy('')
    if (!r.ok) { setErr(d.error || 'Σφάλμα'); setQr(null); return }
    funnel('pack_use', { locationId: p.locationId, meta: { reused: !!d.reused } })
    storeQr('pack_' + p.id + '_' + new Date().toDateString(), d.checkin)
    setQr({ id: p.id, code: d.checkin, ref: d.ref })
    setPacks(ps => (ps || []).map(x => x.id === p.id ? { ...x, left: d.left } : x))
  }

  const goBack = useCallback(() => { router.push('/profile') }, [router])
  useSwipeBack(goBack)

  return (
    <div className="mx-auto max-w-md px-5 pb-16 pt-[calc(var(--safe-top)+8px)]">
      <button onClick={goBack} aria-label="Πίσω"
        className="-ml-2 mb-3 w-11 h-11 rounded-full flex items-center justify-center active:bg-gray-100">
        <ChevronLeft size={26} className="text-[#10182A]" />
      </button>
      <h1 className="text-[24px] font-semibold text-[#10182A]">Τα πακέτα μου</h1>
      {pi && packs?.some(p => p.fresh) && (
        <p className="mt-3 rounded-xl px-3 py-2 text-[14px] font-medium" style={{ background: '#E7F6EF', color: '#0F7A5C' }}>✓ Η αγορά ολοκληρώθηκε.</p>
      )}
      {err && <p className="mt-3 text-[14px] text-red-600">{err}</p>}
      {packs === null && <p className="mt-6 text-[14px] text-gray-400">Φόρτωση…</p>}
      {packs?.length === 0 && (
        <p className="mt-6 text-[14px] text-gray-500">{pi ? 'Ολοκληρώνουμε την αγορά… (λίγα δευτερόλεπτα)' : 'Δεν έχεις πακέτα ακόμα.'}</p>
      )}

      <div className="mt-6 space-y-3">
        {packs?.map(p => (
          <div key={p.id} className="rounded-2xl border border-gray-200 p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-[16px] font-semibold text-[#10182A]">{p.location}</p>
              <p className="text-[15px] font-semibold text-[#10182A]">{p.left}/{p.total}</p>
            </div>
            <p className="mt-0.5 text-[13px] text-gray-500">{p.name} · έως {fmtDate(p.expiresAt)}</p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div className="h-full rounded-full" style={{ width: `${(p.left / Math.max(1, p.total)) * 100}%`, background: '#078EAD' }} />
            </div>

            {qr?.id === p.id ? (
              <div className="mt-4 flex flex-col items-center">
                <CheckinQR code={qr.code} size={200} />
                <p className="mt-2 text-[14px] font-medium text-[#10182A]">Δείξε το στην είσοδο</p>
                {qr.ref && <p className="font-mono text-[12px] text-gray-400">{qr.ref}</p>}
                <p className="mt-1 text-center text-[12px] text-gray-400">Ισχύει σήμερα. Αν δεν σκαναριστεί, το πλύσιμο δεν χρεώνεται.</p>
              </div>
            ) : p.usable ? (
              <button onClick={() => use(p)} disabled={!!busy}
                className="mt-4 w-full rounded-2xl py-3.5 text-[15px] font-semibold text-white disabled:opacity-60" style={{ background: '#10182A' }}>
                {busy === p.id ? '…' : 'Χρησιμοποίησε 1 πλύσιμο'}
              </button>
            ) : (
              <p className="mt-3 text-[13px] text-gray-400">{p.left <= 0 ? 'Ολοκληρώθηκε' : 'Έληξε'}</p>
            )}
            {!p.usable && p.left <= 0 && (
              <button onClick={() => router.push(`/packs?l=${p.locationId}`)} className="mt-2 text-[14px] font-medium" style={{ color: '#078EAD' }}>Νέο πακέτο →</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function MyPacksPage() {
  return <Suspense fallback={null}><Inner /></Suspense>
}
