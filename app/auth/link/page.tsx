'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { WashioLoader } from '@/components/WashioLoader'

// Προσωπικό link από email (καμπάνιες): συνδέει αυτόματα τον χρήστη με το token
// και τον πάει στον προορισμό. Αν το link έληξε/χρησιμοποιήθηκε → κανονικό login
// με τον ίδιο προορισμό (δεν χάνει τίποτα, απλώς βάζει email + κωδικό).
function LinkInner() {
  const router = useRouter()
  const params = useSearchParams()
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const tokenHash = params.get('token_hash') || ''
    const rawNext = params.get('next') || '/map'
    const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/map' // μόνο εσωτερικά paths
    const go = async () => {
      const supabase = createClient()
      // Ήδη συνδεδεμένος; → κατευθείαν στον προορισμό.
      const { data: { session } } = await supabase.auth.getSession()
      if (session) { router.replace(next); return }
      if (!tokenHash) { router.replace(`/login?redirect=${encodeURIComponent(next)}`); return }
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
      if (error) {
        setMsg('Το link έληξε — συνδέσου με το email σου για να συνεχίσεις.')
        setTimeout(() => router.replace(`/login?redirect=${encodeURIComponent(next)}`), 1500)
        return
      }
      router.replace(next)
    }
    go()
  }, [params, router])

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-8 text-center">
      {msg ? <p className="text-[14px] text-gray-600">{msg}</p> : <WashioLoader />}
    </main>
  )
}

export default function AuthLinkPage() {
  return <Suspense fallback={null}><LinkInner /></Suspense>
}
