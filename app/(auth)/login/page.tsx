'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { signInWithProvider } from '@/lib/native-auth'
import { useT } from '@/lib/i18n'

const T = {
  el: {
    checkEmail: 'Έλεγξε το email σου',
    loginRegister: 'Είσοδος / Εγγραφή',
    sentCode: (email: string) => `Στείλαμε κωδικό στο ${email}`,
    noPassword: 'Χωρίς κωδικό — μόνο το email σου',
    emailPlaceholder: 'Email',
    sending: 'Αποστολή...',
    sendCode: 'Αποστολή κωδικού',
    continueGuest: 'Συνέχεια ως επισκέπτης',
    or: 'ή',
    continueApple: 'Συνέχεια με Apple',
    continueGoogle: 'Συνέχεια με Google',
    continueFacebook: 'Συνέχεια με Facebook',
    otpPlaceholder: 'Κωδικός 8 ψηφίων',
    verifying: 'Επαλήθευση...',
    login: 'Είσοδος',
    changeEmail: 'Αλλαγή email',
    resendCode: 'Αποστολή νέου κωδικού',
    wrongCode: 'Λάθος κωδικός. Δοκίμασε ξανά.',
    somethingWrong: 'Κάτι πήγε στραβά. Δοκίμασε ξανά.',
    loading: 'Φόρτωση...',
  },
  en: {
    checkEmail: 'Check your email',
    loginRegister: 'Sign in / Sign up',
    sentCode: (email: string) => `We sent a code to ${email}`,
    noPassword: 'No password — just your email',
    emailPlaceholder: 'Email',
    sending: 'Sending...',
    sendCode: 'Send code',
    continueGuest: 'Continue as guest',
    or: 'or',
    continueApple: 'Continue with Apple',
    continueGoogle: 'Continue with Google',
    continueFacebook: 'Continue with Facebook',
    otpPlaceholder: '8-digit code',
    verifying: 'Verifying...',
    login: 'Sign in',
    changeEmail: 'Change email',
    resendCode: 'Send new code',
    wrongCode: 'Wrong code. Please try again.',
    somethingWrong: 'Something went wrong. Please try again.',
    loading: 'Loading...',
  },
}

function LoginPageContent() {
  const router = useRouter()
  const t = useT(T)
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

  // Demo λογαριασμός για το App Review (bypass OTP με σταθερό κωδικό).
  const DEMO_EMAIL = 'appreview@washio.gr'
  const isDemo = email.trim().toLowerCase() === DEMO_EMAIL

  useEffect(() => {
    const checkSession = async () => {
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      if (data.session) router.replace(redirectUrl)
    }
    checkSession()
  }, [])

  const handleSendOtp = async () => {
    if (!email) return
    setError('')
    // Demo: δεν στέλνουμε πραγματικό email — προχωράμε κατευθείαν στην οθόνη κωδικού.
    if (isDemo) {
      setSent(true)
      return
    }
    setLoading(true)
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

    // Demo bypass: ανταλλαγή σταθερού κωδικού με έγκυρο session token.
    if (isDemo) {
      try {
        const res = await fetch('/api/auth/demo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: otp }),
        })
        const data = await res.json()
        if (!res.ok || !data.tokenHash) {
          setError(t.wrongCode)
          setLoading(false)
          return
        }
        const { error } = await supabase.auth.verifyOtp({ token_hash: data.tokenHash, type: 'email' })
        if (error) {
          setError(t.wrongCode)
          setLoading(false)
        } else {
          router.push(redirectUrl)
        }
      } catch {
        setError(t.somethingWrong)
        setLoading(false)
      }
      return
    }

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: 'email',
    })
    if (error) {
      setError(t.wrongCode)
      setLoading(false)
    } else {
      router.push(redirectUrl)
    }
  }

  const getOauthRedirect = () => {
    const base = 'https://washio.gr'
    const path = redirectUrl.startsWith('/') ? redirectUrl : '/' + redirectUrl
    return `${base}${path}`
  }

  const handleGoogleLogin = () => signInWithProvider(createClient(), 'google', getOauthRedirect())
  const handleFacebookLogin = () => signInWithProvider(createClient(), 'facebook', getOauthRedirect())
  const handleAppleLogin = () => signInWithProvider(createClient(), 'apple', getOauthRedirect())

  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-start">
      <div className="w-full max-w-md px-5">

        {/* Back — σελίδα χωρίς bottom nav */}
        <div className="pt-[calc(env(safe-area-inset-top)+12px)] -mb-8">
          <button
            onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}
            aria-label="Back"
            className="w-10 h-10 -ml-1 rounded-full bg-white border border-gray-100 flex items-center justify-center text-gray-900"
          >
            <ChevronLeft size={18} />
          </button>
        </div>

        <div className="pt-14 pb-8 flex flex-col items-center">
          <img src="/washio_logo.png" alt="Washio" className="h-16 w-auto mb-5" />
          <h1 className="text-lg font-semibold text-gray-900">
            {sent ? t.checkEmail : t.loginRegister}
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            {sent ? t.sentCode(email) : t.noPassword}
          </p>
        </div>

        {!sent ? (
          <div className="flex flex-col gap-2.5">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={t.emailPlaceholder}
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
              {loading ? t.sending : t.sendCode}
            </button>

            <button
              onClick={() => router.push('/')}
              className="w-full text-xs text-gray-400 text-center py-2"
            >
              {t.continueGuest}
            </button>

            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-300">{t.or}</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            <button
              onClick={handleAppleLogin}
              className="w-full bg-black text-white text-sm py-3 rounded-xl flex items-center justify-center gap-2"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
                <path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.1-2.02-3.77-2.04-1.6-.16-3.13.94-3.94.94-.81 0-2.07-.92-3.41-.89-1.75.03-3.37 1.02-4.27 2.59-1.82 3.16-.47 7.84 1.31 10.41.87 1.26 1.9 2.67 3.25 2.62 1.3-.05 1.8-.84 3.37-.84 1.57 0 2.02.84 3.4.81 1.4-.02 2.29-1.28 3.15-2.55 1-1.46 1.41-2.88 1.43-2.95-.03-.01-2.74-1.05-2.77-4.17zM14.6 4.42c.72-.87 1.2-2.08 1.07-3.29-1.03.04-2.28.69-3.02 1.56-.66.77-1.24 2-1.08 3.18 1.15.09 2.32-.58 3.03-1.45z"/>
              </svg>
              {t.continueApple}
            </button>

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
              {t.continueGoogle}
            </button>

            <button
              onClick={handleFacebookLogin}
              className="w-full border border-gray-200 text-gray-700 text-sm py-3 rounded-xl flex items-center justify-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#1877F2">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              {t.continueFacebook}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            <input
              type="text"
              inputMode="numeric"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder={t.otpPlaceholder}
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
              {loading ? t.verifying : t.login}
            </button>

            <button
              onClick={() => { setSent(false); setOtp(''); setError('') }}
              className="text-xs text-gray-400 text-center mt-2"
            >
              {t.changeEmail}
            </button>

            <button
              onClick={handleSendOtp}
              className="text-xs text-blue-500 text-center"
            >
              {t.resendCode}
            </button>
          </div>
        )}

      </div>
    </main>
  )
}

function LoginFallback() {
  const t = useT(T)
  return <div className="min-h-screen flex items-center justify-center"><p className="text-xs text-gray-400">{t.loading}</p></div>
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginPageContent />
    </Suspense>
  )
}