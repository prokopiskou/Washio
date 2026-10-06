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
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID

export function RegistrationTracker() {
  useEffect(() => {
    const supabase = createClient()

    // Πιάσε τον κωδικό παραπομπής από το URL (?ref=ΚΩΔΙΚΟΣ) και κράτα τον σε
    // cookie 30 ημερών — θα διαβαστεί στο sign-up για να συνδεθεί ο νέος χρήστης.
    try {
      const sp = new URLSearchParams(window.location.search)
      // Flyer (utm_source=flyer) → κωδικός FLYER, όχι WASHIO (να μη μπερδεύεται με τη διαφήμιση).
      const ref = sp.get('utm_source') === 'flyer' && sp.get('ref') ? 'FLYER' : sp.get('ref')
      if (ref) document.cookie = `ws_ref=${encodeURIComponent(ref.trim())}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`
      const lp = sp.get('acq_lp') || sp.get('lp')
      if (lp === 'map' || lp === 'login') document.cookie = `ws_lp=${lp}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`
      const acqRef = sp.get('acq_ref')
      if (acqRef && !ref) document.cookie = `ws_ref=${encodeURIComponent(acqRef.trim())}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`
    } catch { /* ignore */ }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // SIGNED_IN = login μέσα στη σελίδα (OTP). INITIAL_SESSION = επιστροφή από
      // Google/Apple redirect ή άνοιγμα με ήδη ενεργό session — πριν χανόταν εδώ το −3€.
      if ((event !== 'SIGNED_IN' && event !== 'INITIAL_SESSION') || !session?.user) return
      const u = session.user

      // −3€ καλωσορίσματος: ΜΙΑ φορά ανά χρήστη/συσκευή, ανεξαρτήτως πότε έκανε verify.
      // Ο server αποφασίζει (μόνο αν δεν έχει καμία κράτηση & δεν έχει ξαναπάρει welcome).
      try {
        const refKey = 'wsx_ref_' + u.id
        if (!localStorage.getItem(refKey)) {
          localStorage.setItem(refKey, '1')
          fetch('/api/referral/link', { method: 'POST', keepalive: true }).catch(() => {})
        }
      } catch {
        fetch('/api/referral/link', { method: 'POST', keepalive: true }).catch(() => {})
      }

      // ADVANCED MATCHING: μόλις ξέρουμε ποιος είναι ο χρήστης, «ταυτοποιούμε»
      // το pixel με email + user id. Το Meta τα κάνει hash client-side. Έτσι ΟΛΑ
      // τα επόμενα events (ViewContent, Purchase, CompleteRegistration…) matchάρουν
      // πολύ καλύτερα — χωρίς αυτό στέλναμε μηδέν στοιχεία χρήστη.
      try {
        const fbq = (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq
        if (fbq && PIXEL_ID && u.email) {
          fbq('init', PIXEL_ID, {
            em: u.email.trim().toLowerCase(),
            external_id: u.id,
            ...(u.phone ? { ph: String(u.phone).replace(/[^0-9]/g, '') } : {}),
          })
        }
      } catch { /* ignore */ }

      // «Νέα εγγραφή» = ο λογαριασμός δημιουργήθηκε πρόσφατα. Με OTP ο λογαριασμός
      // δημιουργείται όταν ΖΗΤΗΘΕΙ ο κωδικός — αν το email αργήσει, το verify γίνεται
      // λεπτά αργότερα. Παράθυρο 60' (το dedup από κάτω εμποδίζει διπλό event).
      const createdMs = u.created_at ? new Date(u.created_at).getTime() : 0
      const isNew = createdMs > 0 && Date.now() - createdMs < 60 * 60 * 1000
      if (!isNew) return

      // De-dup ανά χρήστη — να μη σταλεί δεύτερη φορά αν ξανανοίξει το app.
      const key = 'wsx_reg_' + u.id
      try {
        if (localStorage.getItem(key)) return
        localStorage.setItem(key, '1')
      } catch { /* localStorage μπορεί να μην υπάρχει — συνέχισε */ }

      // A/B τεστ landing: ποια παραλλαγή (lp) έφερε τον χρήστη → user_metadata.acq_lp
      // (μετριέται με SQL: εγγραφές → checkout → κρατήσεις ανά παραλλαγή).
      try {
        const ck = (n: string) => document.cookie.split('; ').find(c => c.startsWith(n + '='))?.split('=')[1]
        const acqLp = ck('ws_lp')
        const already = (u.user_metadata as { acq_lp?: string } | undefined)?.acq_lp
        if (acqLp && !already) {
          const acqRef = decodeURIComponent(ck('ws_ref') || '') || null
          // setTimeout: ΠΟΤΕ κλήση Supabase μέσα στο onAuthStateChange (κίνδυνος deadlock στο auth lock).
          setTimeout(() => { supabase.auth.updateUser({ data: acqRef ? { acq_lp: acqLp, acq_ref: acqRef } : { acq_lp: acqLp } }).catch(() => {}) }, 0)
        }
      } catch { /* ignore */ }

      const method =
        (u.app_metadata as { provider?: string } | undefined)?.provider || 'otp'
      // Client Pixel — eventId σταθερό ανά χρήστη.
      track('CompleteRegistration', { method }, { eventId: 'reg_' + u.id })
      // Server-side CAPI backup (iOS ATT / ad-blockers) — ΙΔΙΟ eventId → dedup.
      try {
        fetch('/api/capi/registration', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: window.location.href }),
          keepalive: true,
        }).catch(() => {})
      } catch { /* ignore */ }

    })

    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  return null
}
