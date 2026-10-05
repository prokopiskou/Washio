'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { WashioLoader } from '@/components/WashioLoader'

// Προσωπικό link από email (καμπάνιες): συνδέει αυτόματα τον χρήστη με το token
// και τον πάει στον προορισμό. Αν το link έληξε/χρησιμοποιήθηκε → κανονικό login
// με τον ίδιο προορισμό (δεν χάνει τίποτα, απλώς βάζει email + κωδικό).
//
// ΠΟΤΕ δεν κολλάει: στα in-app browsers (Gmail/Outlook σε iOS) το auth του Supabase
// μπορεί να «κρεμάσει» (κλείδωμα συνεδρίας / αργό δίκτυο στο πρώτο άνοιγμα). Γι' αυτό:
// timeouts σε κάθε βήμα, πλήρης πλοήγηση (όχι client router) και κουμπί «Συνέχεια» στα 5″.

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), ms))]).catch(() => null)
}

function LinkInner() {
  const params = useSearchParams()
  const [msg, setMsg] = useState('')
  const [slow, setSlow] = useState(false)

  const rawNext = params.get('next') || '/map'
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/map' // μόνο εσωτερικά paths

  useEffect(() => {
    let done = false
    const go = (url: string) => { if (done) return; done = true; window.location.replace(url) }
    const toLogin = () => go(`/login?redirect=${encodeURIComponent(next)}`)
    const slowTimer = setTimeout(() => setSlow(true), 5000)

    ;(async () => {
      const tokenHash = params.get('token_hash') || ''
      const supabase = createClient()

      // Ήδη συνδεδεμένος; → κατευθείαν στον προορισμό.
      const s = await withTimeout(supabase.auth.getSession(), 3000)
      if (s?.data?.session) return go(next)
      if (!tokenHash) return toLogin()

      const r = await withTimeout(supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' }), 8000)
      if (r === null) {
        // Timeout: ίσως η σύνδεση ολοκληρώθηκε αλλά «κρέμασε» η απάντηση → έλεγξε ξανά.
        const s2 = await withTimeout(supabase.auth.getSession(), 2000)
        return s2?.data?.session ? go(next) : toLogin()
      }
      if (r.error) {
        setMsg('Το link έληξε. Συνδέσου με το email σου για να συνεχίσεις.')
        setTimeout(toLogin, 1500)
        return
      }
      go(next)
    })()

    return () => clearTimeout(slowTimer)
  }, [params, next])

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-8 text-center">
      {msg ? <p className="text-[14px] text-gray-600">{msg}</p> : <WashioLoader />}
      {slow && !msg && (
        <a
          href={next}
          className="mt-6 inline-flex items-center justify-center h-12 px-6 rounded-xl text-white text-[15px] font-semibold"
          style={{ background: 'linear-gradient(135deg, #19A8C7 0%, #078EAD 100%)' }}
        >
          Συνέχεια →
        </a>
      )}
    </main>
  )
}

export default function AuthLinkPage() {
  return <Suspense fallback={<main className="min-h-screen bg-gray-50 flex items-center justify-center"><WashioLoader /></main>}><LinkInner /></Suspense>
}
