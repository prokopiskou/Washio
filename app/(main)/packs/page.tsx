'use client'

// Πακέτα πλυσιμάτων ενός τούνελ (χωρίς ραντεβού): /packs?l=<locationId>
// Αγορά με κάρτα → /profile/packs (εκεί «Χρησιμοποίησε 1 πλύσιμο» → QR).
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useSwipeBack } from '@/lib/useSwipeBack'
import { useRouter, useSearchParams } from 'next/navigation'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { createClient } from '@/lib/supabase/client'
import { funnel } from '@/lib/funnel'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

type Pack = { id: string; name: string; washes: number; price: number; perWash: number; single: number; save: number; validDays: number; service: string }

const eur = (n: number) => `${Number(n).toFixed(Number.isInteger(n) ? 0 : 2).replace('.', ',')}€`

// Ίδια φόρμα με το checkout κράτησης: κάρτα (αριθμός · λήξη · CVC) + Apple/Google Pay + αποθηκευμένες,
// χωρίς Link/όνομα/email/χώρα.
function PayForm({ clientSecret, email, single, onPaying }: { clientSecret: string; email: string; single: boolean; onPaying?: () => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState('')
  const pay = async () => {
    if (!stripe || !elements || busy) return
    setBusy(true); setErr(''); onPaying?.()
    const { error: se } = await elements.submit()
    if (se) { setErr(se.message || 'Σφάλμα κάρτας'); setBusy(false); return }
    const { error } = await stripe.confirmPayment({
      elements, clientSecret,
      confirmParams: {
        // Μεμονωμένο: μετά την πληρωμή βγαίνει ΚΑΤΕΥΘΕΙΑΝ το QR (auto=1).
        return_url: `${window.location.origin}/profile/packs${single ? '?auto=1' : ''}`,
        payment_method_data: { billing_details: { name: email || 'Washio', email: email || undefined, address: { country: 'GR' } } },
      },
    })
    if (error) { setErr(error.message || 'Η πληρωμή απέτυχε'); setBusy(false) }
  }
  return (
    <div>
      <PaymentElement onReady={() => setReady(true)} options={{
        layout: 'tabs',
        wallets: { applePay: 'auto', googlePay: 'auto', link: 'never' },
        terms: { card: 'never', applePay: 'never', googlePay: 'never' },
        fields: { billingDetails: { name: 'never', email: 'never', phone: 'never', address: { country: 'never', postalCode: 'auto' } } },
      }} />
      {err && <p className="mt-3 text-[13px] text-red-600">{err}</p>}
      <button onClick={pay} disabled={busy || !stripe || !ready}
        className="mt-4 w-full rounded-[14px] py-4 text-[16px] font-semibold text-white disabled:opacity-60"
        style={{ background: 'linear-gradient(135deg, #19A8C7 0%, #078EAD 100%)', boxShadow: '0 8px 20px rgba(25,168,199,0.35)' }}>
        {busy ? 'Πληρωμή…' : 'Πλήρωσε'}
      </button>
    </div>
  )
}

function PacksInner() {
  const sp = useSearchParams()
  const router = useRouter()
  const lid = sp.get('l') || ''
  const [loc, setLoc] = useState<{ name?: string; address?: string } | null>(null)
  const [packs, setPacks] = useState<Pack[] | null>(null)
  const [sel, setSel] = useState<Pack | null>(null)
  const [secret, setSecret] = useState('')
  const [csSecret, setCsSecret] = useState<string | undefined>(undefined)
  const [method, setMethod] = useState<'card' | 'cash'>('card')
  const [cashBusy, setCashBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    fetch(`/api/packs?locationId=${encodeURIComponent(lid)}`).then(r => r.json()).then(d => { setLoc(d.location || null); setPacks(d.packs || []) }).catch(() => setPacks([]))
    createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email || ''))
    funnel('pack_view', { locationId: lid, once: true })
  }, [lid])

  const buy = async (p: Pack) => {
    setErr('')
    const { data } = await createClient().auth.getUser()
    if (!data.user) { router.push(`/login?redirect=${encodeURIComponent(`/packs?l=${lid}&p=${p.id}`)}`); return }
    funnel('pack_buy_click', { locationId: lid })
    setSel(p); setSecret('')
    const r = await fetch('/api/packs/intent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packId: p.id }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || !d.clientSecret) { setErr(d.error || 'Σφάλμα'); setSel(null); return }
    setCsSecret(d.customerSessionClientSecret || undefined)
    setSecret(d.clientSecret)
  }

  // Μεμονωμένο «Πλήρωσε στο κατάστημα» → κράτηση τώρα + QR (ίδια σελίδα επιβεβαίωσης με το checkout).
  const payCash = async () => {
    if (!sel || cashBusy) return
    setCashBusy(true); setErr('')
    const r = await fetch('/api/packs/cash', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packId: sel.id }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || !d.ref) { setErr(d.error || 'Σφάλμα'); setCashBusy(false); return }
    const q = new URLSearchParams({
      email, date: 'Σήμερα', time: 'Χωρίς ραντεβού', service: sel.name, plate: '', total: String(sel.price),
      ref: d.ref, method: 'cash', lid, ...(d.checkin ? { cc: String(d.checkin) } : {}),
    })
    router.push(`/booking/confirmed?${q.toString()}`)
  }

  // Πίσω: από την πληρωμή → στη λίστα πακέτων · αλλιώς προηγούμενη σελίδα (ή χάρτης αν δεν υπάρχει).
  // Από τον χάρτη (?p=…): ανοίγει κατευθείαν η πληρωμή του επιλεγμένου.
  const autoRef = useRef(false)
  useEffect(() => {
    const pid = sp.get('p')
    if (autoRef.current || !pid || !packs) return
    const p = packs.find(x => x.id === pid)
    if (p) { autoRef.current = true; void buy(p) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packs, sp])

  const goBack = useCallback(() => {
    if (sel) { setSel(null); setSecret(''); setMethod('card'); return }
    if (window.history.length > 1) router.back(); else router.push('/map')
  }, [sel, router])
  useSwipeBack(goBack)

  return (
    <div className="mx-auto max-w-md px-5 pb-16 pt-[calc(var(--safe-top)+8px)]">
      <button onClick={goBack} aria-label="Πίσω"
        className="-ml-2 mb-3 w-11 h-11 rounded-full flex items-center justify-center active:bg-gray-100">
        <ChevronLeft size={26} className="text-[#10182A]" />
      </button>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-gray-400">Τούνελ · χωρίς ραντεβού</p>
      <h1 className="mt-1 text-[24px] font-semibold text-[#10182A]">{loc?.name || 'Πακέτα πλυσιμάτων'}</h1>
      {loc?.address && <p className="mt-1 text-[14px] text-gray-500">{loc.address}</p>}
      <p className="mt-4 text-[15px] text-[#10182A]">Πλήρωσε μία φορά. Έλα όποτε θες. Δείξε το QR στην είσοδο.</p>

      {err && <p className="mt-4 text-[14px] text-red-600">{err}</p>}

      {sel ? (
        <div className="mt-6">
          {/* Σύνοψη — όπως στο checkout κράτησης */}
          <div className="rounded-[20px] border border-gray-200 px-4 py-3.5">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-[13px] text-gray-500">Πλυντήριο</span>
              <span className="text-[14px] font-semibold text-[#10182A] text-right">{loc?.name || ''}</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-[13px] text-gray-500">{sel.washes === 1 ? 'Υπηρεσία' : 'Πακέτο'}</span>
              <span className="text-[14px] font-semibold text-[#10182A] text-right">{sel.name}</span>
            </div>
            <div className="flex items-center justify-between py-1.5">
              <span className="text-[13px] text-gray-500">Πότε</span>
              <span className="text-[14px] font-semibold text-[#10182A] text-right">Όποτε έρθεις · χωρίς ραντεβού</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between border-t border-gray-100 pt-3">
              <span className="text-[14px] font-semibold text-[#10182A]">Σύνολο</span>
              <span className="text-[20px] font-bold text-[#10182A]">{eur(sel.price)}</span>
            </div>
          </div>

          {/* Τρόπος πληρωμής: μεμονωμένο → κάρτα ή στο κατάστημα · πακέτο → μόνο κάρτα */}
          {sel.washes === 1 && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              {(['card', 'cash'] as const).map(m => (
                <button key={m} onClick={() => setMethod(m)}
                  className={`h-12 rounded-[14px] border text-[14px] font-semibold ${method === m ? 'border-[#10182A] bg-[#10182A] text-white' : 'border-gray-200 text-[#10182A]'}`}>
                  {m === 'card' ? '💳 Κάρτα' : '💵 Στο κατάστημα'}
                </button>
              ))}
            </div>
          )}

          <div className="mt-4">
            {method === 'cash' && sel.washes === 1 ? (
              <>
                <p className="text-[13px] text-gray-500">Πληρώνεις {eur(sel.price)} στο ταμείο. Δείχνεις το QR στην είσοδο.</p>
                <button onClick={payCash} disabled={cashBusy}
                  className="mt-4 w-full rounded-[14px] py-4 text-[16px] font-semibold text-white disabled:opacity-60" style={{ background: '#10182A' }}>
                  {cashBusy ? '…' : 'Πάρε το QR'}
                </button>
              </>
            ) : secret ? (
              <Elements key={secret} stripe={stripePromise} options={{
                mode: 'payment', amount: Math.round(sel.price * 100), currency: 'eur', paymentMethodTypes: ['card'], locale: 'el',
                ...(csSecret ? { customerSessionClientSecret: csSecret } : {}),
                appearance: { theme: 'stripe', variables: { colorPrimary: '#078EAD', colorText: '#10182A', borderRadius: '12px', fontSizeBase: '16px' } },
              }}>
                <PayForm clientSecret={secret} email={email} single={sel.washes === 1} />
              </Elements>
            ) : (
              <div className="h-[150px] rounded-2xl bg-gray-50 animate-pulse" />
            )}
          </div>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {packs === null && <p className="text-[14px] text-gray-400">Φόρτωση…</p>}
          {packs?.length === 0 && <p className="text-[14px] text-gray-500">Δεν υπάρχουν πακέτα εδώ ακόμα.</p>}
          {packs?.map(p => (
            <button key={p.id} onClick={() => buy(p)} disabled={!!sel}
              className="w-full rounded-2xl border border-gray-200 p-4 text-left active:scale-[0.99] disabled:opacity-60">
              <div className="flex items-baseline justify-between">
                <p className="text-[16px] font-semibold text-[#10182A]">{p.name}</p>
                <p className="text-[18px] font-semibold text-[#10182A]">{eur(p.price)}</p>
              </div>
              <p className="mt-1 text-[13px] text-gray-500">
                {p.washes === 1
                  ? `1 πλύσιμο · όποτε θες · ισχύει ${Math.max(1, Math.round(p.validDays / 30))} ${Math.round(p.validDays / 30) > 1 ? 'μήνες' : 'μήνα'}`
                  : <>{eur(p.perWash)} το πλύσιμο{p.single > 0 && p.single > p.perWash ? ` αντί ${eur(p.single)}` : ''} · ισχύει {Math.round(p.validDays / 30)} μήνες</>}
              </p>
              {p.save > 0 && <p className="mt-2 inline-block rounded-full px-2.5 py-1 text-[12px] font-semibold" style={{ background: '#E7F6EF', color: '#0F7A5C' }}>Κερδίζεις {eur(p.save)}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function PacksPage() {
  return <Suspense fallback={null}><PacksInner /></Suspense>
}
