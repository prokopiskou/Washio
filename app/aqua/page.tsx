'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isNativeApp } from '@/lib/native-auth'

// QR του αρωματικού Aqua × Washio (washio.gr/aqua).
//  • Συνδεδεμένος → κατευθείαν «Κάλεσε φίλους» (κοινοποίηση του προσωπικού link).
//  • Μη συνδεδεμένος (συνήθως ΗΔΗ πελάτης) → «Άνοιξε στην εφαρμογή» / email → link με αυτόματη σύνδεση /
//    login · και μικρότερο «Πρώτη φορά» (χάρτης με −3€).
//  • Κινητό browser → και «Άνοιξε στην εφαρμογή» (custom scheme → η εφαρμογή ανοίγει το ίδιο path).
const REWARDS = '/profile/rewards?tab=referral&do=share&utm_source=aqua&utm_medium=print&utm_campaign=airfreshener'
const NEW_CUSTOMER = '/?ref=FLYER&utm_source=flyer&utm_medium=print&utm_campaign=aqua'
const APP_LINK = `gr.washio.app://auth-callback?open=${encodeURIComponent('/aqua')}`

export default function AquaPage() {
  const [state, setState] = useState<'loading' | 'guest'>('loading')
  const [mobileWeb, setMobileWeb] = useState(false)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(''); setSending(true)
    try {
      const r = await fetch('/api/aqua/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      const j = await r.json().catch(() => ({}))
      if (j?.ok) setSent(true); else setErr(j?.error || 'Κάτι πήγε στραβά. Δοκίμασε ξανά.')
    } catch { setErr('Δεν υπάρχει σύνδεση. Δοκίμασε ξανά.') }
    setSending(false)
  }

  useEffect(() => {
    let alive = true
    const mobile = !isNativeApp() && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    const showGuest = () => { if (alive) { setMobileWeb(mobile); setState('guest') } }
    createClient().auth.getSession().then(({ data }) => {
      if (!alive) return
      if (data.session?.user) window.location.replace(REWARDS)
      else showGuest()
    }).catch(showGuest)
    return () => { alive = false }
  }, [])

  if (state === 'loading') {
    return <main className="min-h-screen bg-white flex items-center justify-center text-[13px] text-gray-400">Φόρτωση…</main>
  }

  return (
    <main className="min-h-screen bg-white flex justify-center">
      <div className="w-full max-w-md px-6 pt-[calc(var(--safe-top,0px)+36px)] pb-10 flex flex-col">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/washio-logo-h.png" alt="Washio" className="w-[130px] mx-auto" />
        <p className="text-center text-[11px] font-semibold tracking-[1.6px] uppercase text-gray-400 mt-3">Aqua × Washio</p>

        <h1 className="text-center text-[26px] font-bold tracking-tight text-gray-900 leading-[1.15] mt-7">
          Φέρε έναν φίλο.<br />Κερδίστε και οι δύο <span style={{ color: '#19A8C7' }}>−3€</span>
        </h1>
        <p className="text-center text-[14px] text-gray-500 mt-3 leading-relaxed">
          Ο φίλος σου παίρνει −3€ στο πρώτο του πλύσιμο — κι εσύ −3€ μόλις το ολοκληρώσει.
        </p>

        {/* 95% = έχουν ήδη κλείσει → κύρια ενέργεια: πάρε το link σου */}
        <div className="mt-8 rounded-2xl border border-gray-100 p-4" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <p className="text-[15px] font-semibold text-gray-900">Έχεις κλείσει ήδη με Washio;</p>
          <p className="text-[13px] text-gray-500 mt-0.5">Πάρε το προσωπικό σου link για τους φίλους σου.</p>

          {mobileWeb && (
            <a href={APP_LINK} className="mt-3.5 h-[52px] rounded-xl text-white text-[15px] font-semibold flex items-center justify-center active:opacity-85" style={{ background: '#19A8C7' }}>
              Άνοιξε στην εφαρμογή Washio
            </a>
          )}

          {sent ? (
            <div className="mt-3.5 rounded-xl px-3.5 py-3 text-[13px]" style={{ background: '#E7F6EF', color: '#0F7A5C' }}>
              ✓ Σου στείλαμε email με το link σου. Δες τα εισερχόμενα (και τα «Ανεπιθύμητα»).
            </div>
          ) : (
            <form onSubmit={sendLink} className="mt-3.5">
              <p className="text-[12px] text-gray-400 mb-1.5">{mobileWeb ? 'ή γράψε το email που έκλεισες:' : 'Γράψε το email που έκλεισες:'}</p>
              <div className="flex gap-2">
                <input type="email" inputMode="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="email@example.com" className="flex-1 min-w-0 h-[52px] px-3.5 rounded-xl border border-gray-200 text-[15px]" />
                <button type="submit" disabled={sending} className="h-[52px] px-4 rounded-xl bg-gray-900 text-white text-[14px] font-semibold disabled:opacity-50 shrink-0">
                  {sending ? '…' : 'Στείλε'}
                </button>
              </div>
              {err && <p className="text-[12px] text-red-600 mt-1.5">{err}</p>}
            </form>
          )}

          <a href={`/login?redirect=${encodeURIComponent(REWARDS)}`} className="block text-center text-[13px] text-gray-500 underline underline-offset-2 mt-3.5">
            ή σύνδεση με κωδικό / Google / Apple
          </a>
        </div>

        <a href={NEW_CUSTOMER} className="mt-4 rounded-2xl bg-gray-50 px-4 py-3.5 text-center active:bg-gray-100">
          <span className="block text-[14px] font-semibold text-gray-900">Πρώτη φορά στο Washio;</span>
          <span className="block text-[13px] text-gray-500 mt-0.5">Κλείσε πλύσιμο με <b style={{ color: '#19A8C7' }}>−3€</b> →</span>
        </a>

        <p className="text-center text-[11px] text-gray-400 mt-auto pt-10">washio.gr · πλύσιμο αυτοκινήτου με ένα tap</p>
      </div>
    </main>
  )
}
