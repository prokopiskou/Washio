'use client'

// Google sign-in στο WEB μέσω Google Identity Services (GIS) + Supabase
// signInWithIdToken. Το login γίνεται στο δικό μας domain (washio.gr) και η οθόνη
// της Google ΔΕΝ δείχνει «…supabase.co» (σε αντίθεση με το redirect flow).
//
// Ενεργό ΜΟΝΟ όταν υπάρχει NEXT_PUBLIC_GOOGLE_CLIENT_ID (feature-flag). Χωρίς αυτό
// επιστρέφει null και το login πέφτει πίσω στο κανονικό κουμπί (redirect).
//
// Εμφάνιση: το GIS φτιάχνει δικό του κουμπί που ΔΕΝ ταιριάζει με τα Apple/Facebook.
// Γι' αυτό δείχνουμε το ΔΙΚΟ μας styled κουμπί και από πάνω, ΔΙΑΦΑΝΟ, το πραγματικό
// GIS (opacity:0 → εξακολουθεί να δέχεται το tap). Έτσι φαίνεται ίδιο με τα άλλα.

import { useEffect, useRef, useCallback, useState } from 'react'
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

export function GoogleWebButton({ redirectUrl, label }: { redirectUrl: string; label: string }) {
  const router = useRouter()
  const wrapRef = useRef<HTMLDivElement>(null)
  const gisRef = useRef<HTMLDivElement>(null)
  const rawNonceRef = useRef<string>('')
  const [width, setWidth] = useState(0)

  useEffect(() => {
    if (wrapRef.current) setWidth(wrapRef.current.offsetWidth)
  }, [])

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
    if (!CLIENT_ID || !width) return
    let cancelled = false

    const setup = async () => {
      const id = gsi()
      if (cancelled || !id || !gisRef.current) return
      const raw = `${crypto.randomUUID()}${crypto.randomUUID()}`
      rawNonceRef.current = raw
      const hashed = await sha256Hex(raw)
      id.initialize({ client_id: CLIENT_ID, callback: handleCredential, nonce: hashed })
      gisRef.current.innerHTML = ''
      id.renderButton(gisRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        logo_alignment: 'center',
        width: Math.min(400, Math.max(200, Math.round(width))),
      })
    }

    if (gsi()) { void setup(); return () => { cancelled = true } }

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
  }, [handleCredential, width])

  if (!CLIENT_ID) return null

  return (
    <div ref={wrapRef} className="relative w-full">
      {/* Οπτικό κουμπί — ίδιο style με Apple/Facebook */}
      <div className="w-full border border-gray-200 text-gray-700 text-sm font-medium py-3.5 rounded-xl flex items-center justify-center gap-2 select-none">
        <svg width="16" height="16" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        {label}
      </div>
      {/* Πραγματικό GIS από πάνω, διάφανο — δέχεται το tap */}
      <div
        ref={gisRef}
        className="absolute inset-0 flex items-center justify-center"
        style={{ opacity: 0.001 }}
        aria-hidden
      />
    </div>
  )
}
