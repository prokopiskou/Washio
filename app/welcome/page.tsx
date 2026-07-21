'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, Star, MapPin } from 'lucide-react'
import { useT } from '@/lib/i18n'

const T = {
  el: {
    signIn: 'Σύνδεση',
    heroTitle1: 'Γρήγορο πλύσιμο.',
    heroTitle2: 'Έξυπνη εμπειρία.',
    heroSub: 'Βρες σημείο. Κλείσε θέση. Πλύνε.',
    findWash: 'Βρες πλυντήριο',
    createAccount: 'Δημιουργία λογαριασμού',
    statBooking: 'για κράτηση',
    statSignup: 'εγγραφή',
    statAvailable: 'διαθέσιμο',
    howItWorks: 'Πώς δουλεύει',
    step1Title: 'Βρες σημείο',
    step1Desc: 'Δες τα κοντινά πλυντήρια με διαθέσιμες θέσεις σε πραγματικό χρόνο.',
    step2Title: 'Κλείσε θέση',
    step2Desc: 'Επίλεξε υπηρεσία, ώρα και πλήρωσε με ασφάλεια.',
    step3Title: 'Πλύνε',
    step3Desc: 'Χωρίς αναμονή.',
    featured: 'Επιλεγμένα σημεία',
    all: 'Όλα →',
    havePlace: 'Έχεις πλυντήριο;',
    partnerDesc: 'Δες πώς μπορείς να γίνεις συνεργάτης.',
    learnMore: 'Μάθε περισσότερα →',
    footerAbout: 'Για εμάς',
    footerHow: 'Πώς λειτουργεί',
    footerContact: 'Επικοινωνία',
    footerMade: '© 2026 Washio · Φτιαγμένο στην Αθήνα',
  },
  en: {
    signIn: 'Sign in',
    heroTitle1: 'Fast wash.',
    heroTitle2: 'Smart experience.',
    heroSub: 'Find a spot. Book a slot. Wash.',
    findWash: 'Find a car wash',
    createAccount: 'Create account',
    statBooking: 'to book',
    statSignup: 'sign up',
    statAvailable: 'available',
    howItWorks: 'How it works',
    step1Title: 'Find a spot',
    step1Desc: 'See nearby car washes with available slots in real time.',
    step2Title: 'Book a slot',
    step2Desc: 'Choose a service, time and pay securely.',
    step3Title: 'Wash',
    step3Desc: 'No waiting.',
    featured: 'Featured spots',
    all: 'All →',
    havePlace: 'Own a car wash?',
    partnerDesc: 'See how you can become a partner.',
    learnMore: 'Learn more →',
    footerAbout: 'About us',
    footerHow: 'How it works',
    footerContact: 'Contact',
    footerMade: '© 2026 Washio · Made in Athens',
  },
}

export default function WelcomePage() {
  const router = useRouter()
  const t = useT(T)

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-md mx-auto relative">

        {/* Login button — floats over the hero, no dead white band */}
        <header className="absolute top-0 right-0 z-10 px-5 pt-[calc(env(safe-area-inset-top)+14px)]">
          <Link href="/login" className="h-8 px-3 rounded-lg border border-gray-200 bg-white text-gray-900 text-xs font-semibold inline-flex items-center">
            {t.signIn}
          </Link>
        </header>

        {/* Hero */}
        <section className="px-5 pt-[calc(env(safe-area-inset-top)+6px)] pb-8 flex flex-col items-center text-center">
          <img src="/washio-logo.png" alt="Washio" className="h-40 w-auto -mb-2 -mt-6" />

          <h1 className="text-[32px] font-bold leading-[1.1] tracking-[-1.2px] text-gray-900">
            {t.heroTitle1}<br />
            <span className="text-gray-500">{t.heroTitle2}</span>
          </h1>
          <p className="text-[15px] text-gray-500 leading-[1.45] mt-4 max-w-[300px]">
            {t.heroSub}
          </p>

          <div className="w-full flex flex-col gap-2.5 mt-7">
            <button
              onClick={() => router.push('/map')}
              className="w-full h-14 rounded-xl bg-gray-900 text-white text-[15px] font-semibold tracking-tight flex items-center justify-center gap-2"
            >
              {t.findWash}
              <ArrowRight size={18} />
            </button>
            <Link
              href="/login"
              className="w-full h-14 rounded-xl bg-white border border-gray-200 text-gray-900 text-[15px] font-semibold tracking-tight flex items-center justify-center"
            >
              {t.createAccount}
            </Link>
          </div>
        </section>

        {/* Social proof */}
        <section className="mx-5 mb-8 py-3.5 border-y border-gray-100 flex items-center">
          {[
            { n: '60″', c: t.statBooking },
            { n: '0€', c: t.statSignup },
            { n: '24/7', c: t.statAvailable },
          ].map((item, i) => (
            <div key={item.n} className="flex flex-1 items-center">
              {i > 0 && <div className="w-px h-7 bg-gray-100" />}
              <div className="flex-1 text-center">
                <p className="text-[18px] font-bold tracking-tight text-gray-900 tabular-nums">{item.n}</p>
                <p className="text-[11px] font-medium text-gray-400 mt-0.5 tracking-wide">{item.c}</p>
              </div>
            </div>
          ))}
        </section>

        {/* How it works */}
        <section className="px-5 pb-10">
          <p className="text-[11px] font-semibold text-gray-500 tracking-[1.8px] uppercase mb-[18px]">
            {t.howItWorks}
          </p>
          {[
            { n: '01', t: t.step1Title, d: t.step1Desc },
            { n: '02', t: t.step2Title, d: t.step2Desc },
            { n: '03', t: t.step3Title, d: t.step3Desc },
          ].map((step, i, arr) => (
            <div
              key={step.n}
              className={`flex gap-[18px] py-[18px] ${i < arr.length - 1 ? 'border-b border-gray-100' : ''}`}
            >
              <div className="font-mono text-[11px] font-medium text-gray-400 tracking-wider pt-0.5">{step.n}</div>
              <div className="flex-1">
                <p className="text-[17px] font-semibold tracking-tight text-gray-900">{step.t}</p>
                <p className="text-[13px] text-gray-500 leading-[1.45] mt-1.5">{step.d}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Featured locations */}
        <section className="pb-9">
          <div className="px-5 flex justify-between items-baseline mb-3.5">
            <p className="text-[11px] font-semibold text-gray-500 tracking-[1.8px] uppercase">
              {t.featured}
            </p>
            <Link href="/map" className="text-xs font-medium text-blue-600">{t.all}</Link>
          </div>
          <div className="flex gap-2.5 overflow-x-auto scrollbar-hide px-5 pb-1">
            {[
              { n: 'Wash Lab Athens', c: 'Παγκράτι', r: '4,8', rev: '528' },
              { n: 'Aqua Studio', c: 'Κολωνάκι', r: '4,9', rev: '312' },
              { n: 'Pure Auto Spa', c: 'Ιλίσια', r: '4,7', rev: '194' },
              { n: 'Detail Hub', c: 'Μετς', r: '4,9', rev: '87' },
            ].map(loc => (
              <button
                key={loc.n}
                onClick={() => router.push('/map')}
                className="flex-shrink-0 w-[180px] bg-white rounded-2xl border border-gray-100 p-3 flex flex-col gap-2.5 text-left"
              >
                <div
                  className="h-[90px] rounded-[10px] relative"
                  style={{
                    background: 'repeating-linear-gradient(135deg, #F7F7F7 0 12px, #FAFAFA 12px 24px)',
                  }}
                >
                  <div className="absolute top-1.5 left-2 font-mono text-[8px] text-gray-400">// photo</div>
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-gray-900">{loc.n}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Star size={10} className="fill-gray-900 text-gray-900" strokeWidth={1} />
                    <span className="text-[11px] font-semibold text-gray-900">{loc.r}</span>
                    <span className="text-[11px] text-gray-400">({loc.rev}) · {loc.c}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Partners CTA */}
        <section className="px-5 pb-8">
          <Link href="/apply" className="block bg-gray-50 rounded-2xl p-5 border border-gray-100 flex items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-white border border-gray-100 flex items-center justify-center flex-shrink-0">
              <MapPin size={20} className="text-gray-900" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold tracking-tight text-gray-900">{t.havePlace}</p>
              <p className="text-xs text-gray-500 mt-0.5 leading-[1.45]">
                {t.partnerDesc}
              </p>
              <p className="text-xs font-semibold text-gray-900 mt-2 underline underline-offset-[3px]">
                {t.learnMore}
              </p>
            </div>
          </Link>
        </section>

        {/* Footer */}
        <footer className="px-5 pt-6 pb-14 border-t border-gray-100">
          <div className="flex gap-[18px] flex-wrap">
            <Link href="#about" className="text-xs font-medium text-gray-500">{t.footerAbout}</Link>
            <Link href="#how" className="text-xs font-medium text-gray-500">{t.footerHow}</Link>
            <Link href="#contact" className="text-xs font-medium text-gray-500">{t.footerContact}</Link>
          </div>
          <div className="flex items-center gap-1.5 mt-3.5">
            <div className="w-3.5 h-3.5 rounded bg-gray-900 flex items-center justify-center">
              <div className="w-1 h-1 bg-white" style={{ borderRadius: '50% 50% 50% 0', transform: 'rotate(-45deg)' }} />
            </div>
            <p className="text-[11px] text-gray-400">{t.footerMade}</p>
          </div>
        </footer>

      </div>
    </main>
  )
}