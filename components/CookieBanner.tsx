'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { CONSENT_OPEN_EVENT, getConsent, isNativeClient, setConsent } from '@/lib/consent'
import { useLocale } from '@/lib/i18n'
import { funnel } from '@/lib/funnel'

const T = {
  el: {
    title: 'Cookies',
    body: 'Χρησιμοποιούμε απαραίτητα cookies για να λειτουργεί το Washio. Με τη συγκατάθεσή σου, και cookies για στατιστικά και διαφήμιση.',
    bodyApp: 'Χρησιμοποιούμε απαραίτητα cookies για να λειτουργεί η εφαρμογή. Με τη συγκατάθεσή σου, και για ανώνυμα στατιστικά.',
    more: 'Πολιτική cookies',
    accept: 'Αποδοχή όλων', reject: 'Απόρριψη', settings: 'Ρυθμίσεις', save: 'Αποθήκευση',
    nec: 'Απαραίτητα', necD: 'Σύνδεση, κράτηση, ασφάλεια. Πάντα ενεργά.',
    an: 'Στατιστικά', anD: 'Google Analytics — πώς χρησιμοποιείται το Washio.',
    mk: 'Διαφήμιση', mkD: 'Meta Pixel — μέτρηση διαφημίσεων στο Facebook/Instagram.',
    always: 'Πάντα',
  },
  en: {
    title: 'Cookies',
    body: 'We use essential cookies to run Washio. With your consent, also cookies for analytics and advertising.',
    bodyApp: 'We use essential cookies to run the app. With your consent, also for anonymous analytics.',
    more: 'Cookie policy',
    accept: 'Accept all', reject: 'Reject', settings: 'Settings', save: 'Save',
    nec: 'Essential', necD: 'Login, booking, security. Always on.',
    an: 'Analytics', anD: 'Google Analytics — how Washio is used.',
    mk: 'Advertising', mkD: 'Meta Pixel — measuring Facebook/Instagram ads.',
    always: 'Always',
  },
}

// Σελίδες όπου ΔΕΝ δείχνουμε μπάνερ (εργαλεία πλυντηρίου / admin / σκάνερ).
const HIDE = [/^\/admin/, /^\/dashboard/, /^\/s\//, /^\/c\//, /^\/m\//, /^\/k\//]

export function CookieBanner() {
  const { locale } = useLocale()
  const t = T[locale as 'el' | 'en'] || T.el
  const path = usePathname() || '/'
  const [open, setOpen] = useState(false)
  const [details, setDetails] = useState(false)
  const [an, setAn] = useState(false)
  const [mk, setMk] = useState(false)
  const [native, setNative] = useState(false)

  useEffect(() => {
    setNative(isNativeClient())
    const c = getConsent()
    if (!c) setOpen(true)
    else { setAn(c.analytics); setMk(c.marketing) }
    const reopen = () => {
      const cur = getConsent()
      setAn(!!cur?.analytics); setMk(!!cur?.marketing)
      setDetails(true); setOpen(true)
    }
    window.addEventListener(CONSENT_OPEN_EVENT, reopen)
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, reopen)
  }, [])

  if (!open) return null
  if (!details && HIDE.some(r => r.test(path))) return null

  const done = (analytics: boolean, marketing: boolean) => {
    setConsent({ analytics, marketing: native ? false : marketing })
    try { funnel(analytics && marketing ? 'consent_all' : !analytics && !marketing ? 'consent_reject' : 'consent_custom', { meta: { native } }) } catch { /* ignore */ }
    setOpen(false); setDetails(false)
  }

  const Row = ({ label, desc, on, set, fixed }: { label: string; desc: string; on: boolean; set?: (v: boolean) => void; fixed?: boolean }) => (
    <div className="flex items-start gap-3 py-2.5 border-t border-gray-100 first:border-t-0">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-gray-900">{label}</p>
        <p className="text-[11.5px] text-gray-500 leading-snug mt-0.5">{desc}</p>
      </div>
      {fixed ? (
        <span className="text-[11px] text-gray-400 mt-0.5">{t.always}</span>
      ) : (
        <button role="switch" aria-checked={on} onClick={() => set?.(!on)}
          className={`relative shrink-0 w-10 h-6 rounded-full transition-colors ${on ? 'bg-gray-900' : 'bg-gray-200'}`}>
          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      )}
    </div>
  )

  return (
    <div className="fixed inset-x-0 z-[70] px-3 flex justify-center pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
      <div className="pointer-events-auto w-full max-w-md bg-white rounded-2xl border border-gray-200 p-4"
        style={{ boxShadow: '0 12px 40px rgba(10,10,10,0.18)' }}>
        <p className="text-[14px] font-semibold text-gray-900">{t.title}</p>
        <p className="text-[12.5px] text-gray-600 leading-snug mt-1">
          {native ? t.bodyApp : t.body}{' '}
          <Link href="/cookies" className="underline text-gray-900">{t.more}</Link>
        </p>

        {details && (
          <div className="mt-3 rounded-xl bg-gray-50 px-3 py-0.5">
            <Row label={t.nec} desc={t.necD} on fixed />
            <Row label={t.an} desc={t.anD} on={an} set={setAn} />
            {!native && <Row label={t.mk} desc={t.mkD} on={mk} set={setMk} />}
          </div>
        )}

        {/* Ισότιμα κουμπιά: η απόρριψη εξίσου εύκολη με την αποδοχή (ΑΠΔΠΧ). */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <button onClick={() => done(false, false)}
            className="h-11 rounded-xl border border-gray-900 text-[13px] font-semibold text-gray-900">{t.reject}</button>
          <button onClick={() => done(true, true)}
            className="h-11 rounded-xl bg-gray-900 text-[13px] font-semibold text-white">{t.accept}</button>
        </div>
        {details ? (
          <button onClick={() => done(an, mk)} className="w-full h-10 mt-2 rounded-xl bg-gray-100 text-[13px] font-semibold text-gray-900">{t.save}</button>
        ) : (
          <button onClick={() => setDetails(true)} className="w-full mt-2 text-[12px] text-gray-500 underline">{t.settings}</button>
        )}
      </div>
    </div>
  )
}
