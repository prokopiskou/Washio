'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { track } from '@/lib/analytics'

// Πυροδοτεί CompleteRegistration (Meta) / sign_up (GA4) ΜΙΑ φορά ανά ΝΕΑ εγγραφή,
// ανεξαρτήτως μεθόδου: OTP, Google, Apple, Facebook ή email/password.
//
// Γιατί χρειάζεται: το register page έστελνε CompleteRegistration ΜΟΝΟ για
// email/password — αλλά οι περισσότεροι εγγράφονται με OTP/OAuth από το login,
// που δεν έστελνε τίποτα. Χωρίς αυτό, τα Meta ads δεν μπορούν να βελτιστοποιήσουν
// για sign-ups. Κεντρικό σημείο = πιάνει όλες τις ροές.
export function RegistrationTracker() {
  useEffect(() => {
    const supabase = createClient()
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' || !session?.user) return
      const u = session.user

      // «Νέα εγγραφή» = ο λογαριασμός δημιουργήθηκε μόλις τώρα (εντός 5').
      // Το SIGNED_IN πυροδοτείται και σε κάθε επόμενο login — το φιλτράρουμε.
      const createdMs = u.created_at ? new Date(u.created_at).getTime() : 0
      const isNew = createdMs > 0 && Date.now() - createdMs < 5 * 60 * 1000
      if (!isNew) return

      // De-dup ανά χρήστη — να μη σταλεί δεύτερη φορά αν ξανανοίξει το app.
      const key = 'wsx_reg_' + u.id
      try {
        if (localStorage.getItem(key)) return
        localStorage.setItem(key, '1')
      } catch { /* localStorage μπορεί να μην υπάρχει — συνέχισε */ }

      const method =
        (u.app_metadata as { provider?: string } | undefined)?.provider || 'otp'
      // eventId = σταθερό ανά χρήστη → μελλοντικό dedup με server-side CAPI.
      track('CompleteRegistration', { method }, { eventId: 'reg_' + u.id })
    })

    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  return null
}
