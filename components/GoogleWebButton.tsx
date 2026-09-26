'use client'

// Google sign-in στο WEB μέσω Google Identity Services (GIS) + Supabase
// signInWithIdToken. Έτσι το login γίνεται στο δικό μας domain (washio.gr) και η
// οθόνη της Google ΔΕΝ δείχνει «…supabase.co» (σε αντίθεση με το redirect flow).
//
// Ενεργό ΜΟΝΟ όταν υπάρχει NEXT_PUBLIC_GOOGLE_CLIENT_ID (feature-flag). Χωρίς
// αυτό επιστρέφει null και το login πέφτει πίσω στο κανονικό κουμπί (redirect).
// Χρησιμοποιείται ΜΟΝΟ σε browser (όχι μέσα στο native WebView — εκεί το GIS
// δεν δουλεύει).

import { useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

type GoogleId = {
  initialize: (cfg: Record<string, unknown>) => void
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void
}
function gsi(): GoogleId | undefined {
  return (window as unknown as { google?: { accounts?: { id?: GoogleId } } })
    .google?.accounts?.id
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function GoogleWebButton({ redirectUrl }: { redirectUrl: string }) {
  const router = useRouter()
  const divRef = useRef<HTMLDivElement>(null)
  const rawNonceRef = useRef<string>('')

  const handleCredential = useCallback(async (response: { credential?: string }) => {
    if (!response?.credential) return
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: response.credential,
        nonce: rawNonceRef.current,
      })
      if (!error) router.push(redirectUrl)
    } catch { /* σιωπηλά — ο χρήστης μπορεί να ξαναδοκιμάσει */ }
  }, [router, redirectUrl])

  useEffect(() => {
    if (!CLIENT_ID) return
    let cancelled = false

    const setup = async () => {
      const id = gsi()
      if (cancelled || !id || !divRef.current) return
      // Nonce: raw → signInWithIdToken, sha256(raw) → Google (μέσα στο ID token).
      const raw = `${crypto.randomUUID()}${crypto.randomUUID()}`
      rawNonceRef.current = raw
      const hashed = await sha256Hex(raw)
      id.initialize({
        client_id: CLIENT_ID,
        callback: handleCredential,
        nonce: hashed,
      })
      id.renderButton(divRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        logo_alignment: 'left',
        width: 320,
      })
    }

    if (gsi()) { void setup(); return () => { cancelled = true } }

    // Φόρτωσε το GIS script μία φορά.
    const existing = document.getElementById('gsi-script') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', () => void setup())
    } else {
      const s = document.createElement('script')
      s.id = 'gsi-script'
      s.src = 'https://accounts.google.com/gsi/client'
      s.async = true
      s.defer = true
      s.onload = () => void setup()
      document.head.appendChild(s)
    }
    return () => { cancelled = true }
  }, [handleCredential])

  if (!CLIENT_ID) return null
  return <div ref={divRef} className="flex justify-center min-h-[44px]" />
}
