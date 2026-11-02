'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n'
import { openConsentSettings } from '@/lib/consent'

type Row = [string, string, string, string] // όνομα, πάροχος, σκοπός, διάρκεια

const T = {
  el: {
    back: '← Washio',
    title: 'Πολιτική Cookies',
    updatedLabel: 'Τελευταία ενημέρωση:', updated: 'Νοέμβριος 2026',
    intro: 'Τα cookies είναι μικρά αρχεία που αποθηκεύονται στη συσκευή σου. Χρησιμοποιούμε όσα είναι απαραίτητα για να λειτουργεί το Washio. Cookies στατιστικών και διαφήμισης χρησιμοποιούνται μόνο αν δώσεις τη συγκατάθεσή σου, την οποία μπορείς να ανακαλέσεις ανά πάσα στιγμή.',
    btn: 'Ρυθμίσεις cookies',
    hName: 'Cookie', hProv: 'Πάροχος', hPurpose: 'Σκοπός', hDur: 'Διάρκεια',
    nH: '1. Απαραίτητα', nP: 'Χωρίς αυτά δεν λειτουργεί η σύνδεση, η κράτηση και η ασφάλεια. Δεν απαιτούν συγκατάθεση.',
    n: [
      ['sb-*', 'Washio (Supabase)', 'Σύνδεση στον λογαριασμό σου', 'Έως αποσύνδεση'],
      ['ws_consent', 'Washio', 'Αποθηκεύει τις επιλογές σου για τα cookies', '6 μήνες'],
      ['ws_dev', 'Washio', 'Πρόληψη κατάχρησης κουπονιών ανά συσκευή', '1 έτος'],
      ['ws_ref', 'Washio', 'Πρόσκληση φίλου — για να πάρετε την πίστωση', '30 ημέρες'],
      ['ws_native', 'Washio', 'Αναγνώριση ότι χρησιμοποιείς την εφαρμογή', '1 έτος'],
      ['__stripe_*', 'Stripe', 'Ασφαλής πληρωμή με κάρτα, πρόληψη απάτης', 'Έως 1 έτος'],
    ] as Row[],
    fH: '2. Μέτρηση πρώτου μέρους', fP: 'Μετράμε από ποια διαφήμιση ή σελίδα ήρθες, μόνο για δική μας χρήση. Δεν μοιράζονται με τρίτους.',
    f: [
      ['ws_ad, ws_lp', 'Washio', 'Από ποια καμπάνια/σελίδα ήρθες', '30 ημέρες'],
      ['—', 'Vercel Analytics', 'Ανώνυμα στατιστικά επισκεψιμότητας, χωρίς cookies', '—'],
    ] as Row[],
    aH: '3. Στατιστικά (με συγκατάθεση)', aP: 'Μας δείχνουν πώς χρησιμοποιείται το Washio ώστε να το βελτιώνουμε. Χωρίς συγκατάθεση, το Google Analytics λειτουργεί χωρίς cookies (Consent Mode) και δεν σε αναγνωρίζει.',
    a: [
      ['_ga, _ga_*', 'Google Analytics', 'Στατιστικά χρήσης', '2 έτη'],
    ] as Row[],
    mH: '4. Διαφήμιση (με συγκατάθεση)', mP: 'Μετράμε την αποτελεσματικότητα των διαφημίσεών μας στο Facebook/Instagram. Μόνο με συγκατάθεση στέλνουμε στη Meta στοιχεία όπως κρυπτογραφημένο (hash) email και τις κρατήσεις σου. Μέσα στην εφαρμογή (iOS/Android) δεν χρησιμοποιούμε διαφημιστική παρακολούθηση.',
    m: [
      ['_fbp, _fbc', 'Meta (Facebook)', 'Μέτρηση διαφημίσεων', '90 ημέρες'],
    ] as Row[],
    cH: '5. Πώς αλλάζεις τις επιλογές σου',
    cP: 'Πάτα «Ρυθμίσεις cookies» σε αυτή τη σελίδα ή στο Προφίλ. Μπορείς επίσης να διαγράψεις τα cookies από τις ρυθμίσεις του browser σου. Η απόρριψη δεν επηρεάζει τις κρατήσεις σου.',
    tH: '6. Διαβιβάσεις εκτός ΕΕ',
    tP: 'Η Google και η Meta μπορεί να επεξεργάζονται δεδομένα στις ΗΠΑ, με βάση το EU–US Data Privacy Framework και τυποποιημένες συμβατικές ρήτρες.',
    more: 'Περισσότερα στην ', privacy: 'Πολιτική Απορρήτου', contact: '. Επικοινωνία: ',
  },
  en: {
    back: '← Washio',
    title: 'Cookie Policy',
    updatedLabel: 'Last updated:', updated: 'November 2026',
    intro: 'Cookies are small files stored on your device. We use the ones needed for Washio to work. Analytics and advertising cookies are used only with your consent, which you can withdraw at any time.',
    btn: 'Cookie settings',
    hName: 'Cookie', hProv: 'Provider', hPurpose: 'Purpose', hDur: 'Duration',
    nH: '1. Essential', nP: 'Required for login, booking and security. No consent needed.',
    n: [
      ['sb-*', 'Washio (Supabase)', 'Keeps you logged in', 'Until logout'],
      ['ws_consent', 'Washio', 'Stores your cookie choices', '6 months'],
      ['ws_dev', 'Washio', 'Prevents coupon abuse per device', '1 year'],
      ['ws_ref', 'Washio', 'Friend referral — so you both get the credit', '30 days'],
      ['ws_native', 'Washio', 'Detects that you use the app', '1 year'],
      ['__stripe_*', 'Stripe', 'Secure card payment, fraud prevention', 'Up to 1 year'],
    ] as Row[],
    fH: '2. First-party measurement', fP: 'We record which ad or page you came from, for our own use only. Not shared with third parties.',
    f: [
      ['ws_ad, ws_lp', 'Washio', 'Which campaign/page you came from', '30 days'],
      ['—', 'Vercel Analytics', 'Anonymous traffic stats, no cookies', '—'],
    ] as Row[],
    aH: '3. Analytics (with consent)', aP: 'Show us how Washio is used so we can improve it. Without consent, Google Analytics runs cookieless (Consent Mode) and does not identify you.',
    a: [
      ['_ga, _ga_*', 'Google Analytics', 'Usage statistics', '2 years'],
    ] as Row[],
    mH: '4. Advertising (with consent)', mP: 'Measure the effectiveness of our Facebook/Instagram ads. Only with consent do we send Meta data such as your hashed email and bookings. Inside the app (iOS/Android) we do not use ad tracking.',
    m: [
      ['_fbp, _fbc', 'Meta (Facebook)', 'Ad measurement', '90 days'],
    ] as Row[],
    cH: '5. Changing your choices',
    cP: 'Tap “Cookie settings” on this page or in your Profile. You can also delete cookies in your browser settings. Rejecting does not affect your bookings.',
    tH: '6. Transfers outside the EU',
    tP: 'Google and Meta may process data in the US under the EU–US Data Privacy Framework and standard contractual clauses.',
    more: 'More in our ', privacy: 'Privacy Policy', contact: '. Contact: ',
  },
}

function Table({ rows, h }: { rows: Row[]; h: string[] }) {
  return (
    <div className="mt-2 overflow-x-auto rounded-xl border border-gray-100">
      <table className="w-full text-[12.5px]">
        <thead className="bg-gray-50 text-gray-500">
          <tr>{h.map(x => <th key={x} className="text-left font-medium px-3 py-2">{x}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r[0] + r[1]} className="border-t border-gray-100 align-top">
              <td className="px-3 py-2 font-mono text-[11.5px] text-gray-900 whitespace-nowrap">{r[0]}</td>
              <td className="px-3 py-2">{r[1]}</td>
              <td className="px-3 py-2">{r[2]}</td>
              <td className="px-3 py-2 whitespace-nowrap">{r[3]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CookiesContent() {
  const t = useT(T)
  const h = [t.hName, t.hProv, t.hPurpose, t.hDur]
  const Sec = ({ title, p, rows }: { title: string; p: string; rows?: Row[] }) => (
    <section>
      <h2 className="text-base font-semibold text-gray-900 mb-1.5">{title}</h2>
      <p>{p}</p>
      {rows && <Table rows={rows} h={h} />}
    </section>
  )
  return (
    <main className="min-h-screen bg-white">
      <div className="w-full max-w-2xl mx-auto px-5 py-12">
        <Link href="/" className="text-[13px] text-gray-400">{t.back}</Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-4 mb-1 tracking-tight">{t.title}</h1>
        <p className="text-xs text-gray-400 mb-6">{t.updatedLabel} {t.updated}</p>

        <div className="flex flex-col gap-6 text-[14px] leading-relaxed text-gray-700">
          <p>{t.intro}</p>
          <button onClick={openConsentSettings} className="self-start h-10 px-4 rounded-xl bg-gray-900 text-white text-[13px] font-semibold">{t.btn}</button>
          <Sec title={t.nH} p={t.nP} rows={t.n} />
          <Sec title={t.fH} p={t.fP} rows={t.f} />
          <Sec title={t.aH} p={t.aP} rows={t.a} />
          <Sec title={t.mH} p={t.mP} rows={t.m} />
          <Sec title={t.cH} p={t.cP} />
          <Sec title={t.tH} p={t.tP} />
          <p className="text-xs text-gray-400 pt-2">
            {t.more}<Link href="/privacy" className="text-blue-600">{t.privacy}</Link>{t.contact}
            <a href="mailto:support@washio.gr" className="text-blue-600">support@washio.gr</a>
          </p>
        </div>
      </div>
    </main>
  )
}
