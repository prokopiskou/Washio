'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPage() {
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleRegister = async () => {
    if (!firstName || !lastName || !email || !password) return
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: `${firstName} ${lastName}` }
      }
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
    }
  }

  return (
    <main className="min-h-screen bg-white max-w-md mx-auto flex flex-col px-5">

      {/* Logo */}
      <div className="pt-16 pb-10 flex flex-col items-center">
        <img src="/logo.png" alt="Washio" className="h-14 w-auto mb-6" />
        <h1 className="text-xl font-semibold text-gray-900">Δημιουργία λογαριασμού</h1>
        <p className="text-sm text-gray-400 mt-1">Γρήγορη εγγραφή — δωρεάν</p>
      </div>

      {/* Form */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            placeholder="Όνομα"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3.5 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
          />
          <input
            type="text"
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            placeholder="Επώνυμο"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3.5 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
          />
        </div>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
        />
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Κωδικός"
          className="w-full border border-gray-200 rounded-xl px-4 py-3.5 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
        />

        {error && (
          <p className="text-xs text-red-500 text-center">{error}</p>
        )}

        <button
          onClick={handleRegister}
          disabled={loading || !firstName || !lastName || !email || !password}
          className="w-full bg-gray-900 text-white text-sm font-medium py-3.5 rounded-xl mt-1 disabled:opacity-40"
        >
          {loading ? 'Εγγραφή...' : 'Εγγραφή'}
        </button>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-gray-100" />
        <span className="text-xs text-gray-300">ή</span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>

      {/* Google */}
      <button
        onClick={async () => {
          const supabase = createClient()
          await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/` }
          })
        }}
        className="w-full border border-gray-200 text-gray-700 text-sm font-medium py-3.5 rounded-xl flex items-center justify-center gap-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Συνέχεια με Google
      </button>

      {/* Login link */}
      <p className="text-center text-xs text-gray-400 mt-6">
        Έχεις ήδη λογαριασμό;{' '}
        <Link href="/login" className="text-gray-900 font-medium">
          Σύνδεση
        </Link>
      </p>

    </main>
  )
}