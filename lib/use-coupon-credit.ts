'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WELCOME_DISCOUNT, computeRedeemable, isCreditEligible } from '@/lib/referral'

// Τιμή «με το κουπόνι ήδη μέσα» πάνω στις υπηρεσίες (χάρτης + σελίδα πλυντηρίου).
//  • Συνδεδεμένος: το πραγματικό υπόλοιπο κουπονιών του (profiles.referral_credit).
//  • Επισκέπτης (μη συνδεδεμένος): −3€ πρώτης κράτησης — το δίνουμε σε κάθε νέα εγγραφή.
// Ίδιοι κανόνες με το checkout: μόνο σε πλύσιμο ≥12€, όχι σε υπηρεσίες εύρους, έως 3€.
export type CouponState = { credit: number; guest: boolean; ready: boolean }

export function useCouponCredit(): CouponState {
  const [state, setState] = useState<CouponState>({ credit: 0, guest: false, ready: false })
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        const uid = session?.user?.id
        if (!uid) { if (alive) setState({ credit: WELCOME_DISCOUNT, guest: true, ready: true }); return }
        const { data: prof } = await supabase.from('profiles').select('referral_credit').eq('id', uid).maybeSingle()
        if (alive) setState({ credit: Number(prof?.referral_credit) || 0, guest: false, ready: true })
      } catch { if (alive) setState({ credit: 0, guest: false, ready: true }) }
    })()
    return () => { alive = false }
  }, [])
  return state
}

/** Πόσο κατεβαίνει η τιμή μιας υπηρεσίας με το κουπόνι (0 = καθόλου). */
export function couponDiscount(c: CouponState, price: number, isRange?: boolean): number {
  if (!c.ready || isRange || !(price > 0) || !isCreditEligible(price)) return 0
  return Math.round(computeRedeemable(c.credit, price) * 100) / 100
}

/** «12» ή «12.50» — χωρίς περιττά δεκαδικά. */
export const eur = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))
