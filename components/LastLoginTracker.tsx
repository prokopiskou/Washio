'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveLastLogin } from '@/lib/last-login'

// Θυμάται με ποιον τρόπο (Google/Apple/Facebook/email) συνδέθηκε ο χρήστης τελευταία φορά,
// για το σήμα «Τελευταία φορά» στη σελίδα σύνδεσης.
export function LastLoginTracker() {
  useEffect(() => {
    const sb = createClient()
    sb.auth.getSession().then(({ data }) => { if (data.session?.user) saveLastLogin(data.session.user) }).catch(() => {})
    const { data } = sb.auth.onAuthStateChange((ev, session) => {
      if ((ev === 'SIGNED_IN' || ev === 'INITIAL_SESSION') && session?.user) saveLastLogin(session.user)
    })
    return () => { data.subscription.unsubscribe() }
  }, [])
  return null
}
