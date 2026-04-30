'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function LoginPageContent() {
  const router = useRouter()
  const params = useSearchParams()
  const rawRedirect = params.get('redirect') || '/'
  const redirectUrl = rawRedirect.startsWith('http')
    ? new URL(rawRedirect).pathname + new URL(rawRedirect).search
    : rawRedirect

  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSendOtp = async () => {
    if (!email) return
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: undefined,
      }
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
    }
  }

  const handleVerifyOtp = async () => {
    if (!otp || otp.length < 8) return
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    })
    if (error) {
      setError('Λάθος κωδικός. Δοκίμασε ξανά.')
      setLoading(false)
    } else {
      router.push(redirectUrl)
    }
  }

  const getOauthRedirect = () => {
    const base = 'https://washio-ten.vercel.app'
    const path = redirectUrl.startsWith('/') ? redirectUrl : '/' + redirectUrl
    return `${base}${path}`
  }

  const handleGoogleLogin = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: getOauthRedirect() }
    })
  }

  const handleFacebookLogin = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'facebook',
      options: { redirectTo: getOauthRedirect() }
    })
  }

  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-start">
      <div className="w-full max-w-md px-5">

        <div className="pt-14 pb-8 flex flex-col items-center">
          <img src="/washio_logo.png" alt="Washio" className="h-16 w-auto mb-5" />
          <h1 className="text-lg font-semibold text-gray-900">
            {sent ? 'Έλεγξε το email σου' : 'Είσοδος / Εγγραφή'}
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            {sent ? `Στείλαμε κωδικό στο ${email}` : 'Χωρίς κωδικό — μόνο το email σου'}
          </p>
        </div>

        {!sent ? (
          <div className="flex flex-col gap-2.5">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
              onKeyDown={e => e.key === 'Enter' && handleSendOtp()}
              autoFocus
            />

            {error && <p className="text-xs text-red-500 text-center">{error}</p>}

            <button
              onClick={handleSendOtp}
              disabled={loading || !email}
              className="w-full bg-gray-900 text-white text-sm font-medium py-3 rounded-xl disabled:opacity-40"
            >
              {loading ? 'Αποστολή...' : 'Αποστολή κωδικού'}
            </button>

            <div className="flex items-center gap-3 my-3">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-300">ή</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            <button
              onClick={handleGoogleLogin}
              className="w-full border border-gray-200 text-gray-700 text-sm py-3 rounded-xl flex items-center justify-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Συνέχεια με Google
            </button>

            <button
              onClick={handleFacebookLogin}
              className="w-full border border-gray-200 text-gray-700 text-sm py-3 rounded-xl flex items-center justify-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#1877F2">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              Συνέχεια με Facebook
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="Κωδικός 8 ψηφίων"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400 text-center tracking-widest text-lg font-medium"
              onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
              autoFocus
            />

            {error && <p className="text-xs text-red-500 text-center">{error}</p>}

            <button
              onClick={handleVerifyOtp}
              disabled={loading || otp.length < 8}
              className="w-full bg-gray-900 text-white text-sm font-medium py-3 rounded-xl disabled:opacity-40"
            >
              {loading ? 'Επαλήθευση...' : 'Είσοδος'}
            </button>

            <button
              onClick={() => { setSent(false); setOtp(''); setError('') }}
              className="text-xs text-gray-400 text-center mt-2"
            >
              Αλλαγή email
            </button>

            <button
              onClick={handleSendOtp}
              className="text-xs text-blue-500 text-center"
            >
              Αποστολή νέου κωδικού
            </button>
          </div>
        )}

      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-xs text-gray-400">Φόρτωση...</p></div>}>
      <LoginPageContent />
    </Suspense>
  )
}