'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n'
import { MAX_CREDIT_PER_BOOKING, MIN_ELIGIBLE_EUR } from '@/lib/referral'

// Μικρό banner στην αρχική: «Το κουπόνι σου −3€ ενεργοποιήθηκε».
// Φαίνεται όσο ο χρήστης έχει διαθέσιμο κουπόνι. Web + app. Κλείνει με ×.
const DISMISS_KEY = 'washio_coupon_banner_dismissed'

const T = {
  el: {
    title: (a: string) => `Το κουπόνι σου −${a}€ ενεργοποιήθηκε`,
    sub: (m: number) => `Αυτόματα στο επόμενο πλύσιμο από ${m}€ — πληρώνεις στο πλυντήριο ή με κάρτα.`,
    close: 'Κλείσιμο',
  },
  en: {
    title: (a: string) => `Your −€${a} coupon is active`,
    sub: (m: number) => `Applied automatically on your next wash from €${m} — pay at the venue or by card.`,
    close: 'Close',
  },
}

export function CouponActiveBanner() {
  const t = useT(T)
  const [amount, setAmount] = useState(0)

  useEffect(() => {
    try { if (localStorage.getItem(DISMISS_KEY)) return } catch { /* ignore */ }
    let alive = true
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) return
        const { data: prof } = await supabase.from('profiles')
          .select('referral_credit').eq('id', session.user.id).maybeSingle()
        const credit = Number(prof?.referral_credit) || 0
        if (alive && credit > 0) setAmount(Math.min(credit, MAX_CREDIT_PER_BOOKING))
      } catch { /* fail-safe */ }
    })()
    return () => { alive = false }
  }, [])

  if (amount <= 0) return null

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
    setAmount(0)
  }
  const a = Number.isInteger(amount) ? String(amount) : amount.toFixed(2)

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 w-full max-w-md z-40 px-4 pointer-events-none"
      style={{ bottom: 'calc(72px + env(safe-area-inset-bottom) + 14px)' }}
    >
      <div
        className="pointer-events-auto bg-white border border-washio-border rounded-2xl pl-3 pr-2 py-2.5 flex items-center gap-2.5"
        style={{ boxShadow: '0 10px 28px rgba(16,24,42,0.12)' }}
      >
        <div className="w-8 h-8 rounded-full bg-washio-success-bg flex items-center justify-center shrink-0">
          <Check size={16} strokeWidth={3} className="text-washio-success" />
        </div>
        <Link href="/profile/rewards" className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-washio-navy leading-tight">{t.title(a)}</p>
          <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{t.sub(MIN_ELIGIBLE_EUR)}</p>
        </Link>
        <button onClick={dismiss} aria-label={t.close} className="shrink-0 w-7 h-7 flex items-center justify-center text-gray-400">
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
