'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n'

const T = {
  el: {
    back: '← Washio',
    title: 'Όροι Χρήσης',
    updatedLabel: 'Τελευταία ενημέρωση:',
    updated: 'Ιούνιος 2026',

    s1h: '1. Η υπηρεσία',
    s1a: 'Το Washio (washio.gr), που λειτουργεί ο ',
    s1strong: 'ΠΡΟΚΟΠΙΟΣ ΚΟΥΚΗΣ (ατομική επιχείρηση), ΑΦΜ 154067080',
    s1b: ', είναι πλατφόρμα που συνδέει οδηγούς με συνεργαζόμενα πρατήρια πλυσίματος αυτοκινήτου για κράτηση και online πληρωμή. Το Washio διαμεσολαβεί· την υπηρεσία πλυσίματος την παρέχει το εκάστοτε πρατήριο.',

    s2h: '2. Λογαριασμός',
    s2: 'Απαιτείται λογαριασμός για κράτηση. Είσαι υπεύθυνος/η για την ακρίβεια των στοιχείων σου και την ασφάλεια της πρόσβασής σου. Μπορείς να διαγράψεις τον λογαριασμό σου ανά πάσα στιγμή μέσα από το Προφίλ.',

    s3h: '3. Κρατήσεις & πληρωμές',
    s3: 'Η τιμή κάθε υπηρεσίας εμφανίζεται πριν την κράτηση και υπολογίζεται από το σύστημα. Η πληρωμή γίνεται online μέσω Stripe. Η επιβεβαίωση της κράτησης ισχύει μετά την επιτυχή πληρωμή. Το Washio λαμβάνει προμήθεια από το πρατήριο ανά ολοκληρωμένη κράτηση.',

    s4h: '4. Ακυρώσεις & επιστροφές',
    s4: 'Μπορείς να ακυρώσεις σύμφωνα με την πολιτική που εμφανίζεται κατά την κράτηση (δωρεάν ακύρωση έως 2 ώρες πριν). Σε επιλέξιμη ακύρωση, η επιστροφή γίνεται στην κάρτα πληρωμής εντός λίγων εργάσιμων ημερών.',

    s5h: '5. Υποχρεώσεις χρήστη',
    s5: 'Δεσμεύεσαι να χρησιμοποιείς την υπηρεσία νόμιμα, να δίνεις σωστά στοιχεία οχήματος και να εμφανίζεσαι στην ώρα της κράτησης. Καταχρηστική χρήση μπορεί να οδηγήσει σε αναστολή λογαριασμού.',

    s6h: '6. Ευθύνη',
    s6: 'Το Washio δεν ευθύνεται για την ποιότητα της υπηρεσίας που παρέχει το πρατήριο ή για ζημίες που προκύπτουν κατά το πλύσιμο· σχετικά αιτήματα απευθύνονται στο πρατήριο, ενώ το Washio συνδράμει στη διαμεσολάβηση.',

    s7h: '7. Δεδομένα',
    s7a: 'Η επεξεργασία προσωπικών δεδομένων περιγράφεται στην ',
    s7link: 'Πολιτική Απορρήτου',
    s7b: '.',

    s8h: '8. Αλλαγές & επικοινωνία',
    s8a: 'Ενδέχεται να τροποποιήσουμε τους όρους· η συνέχιση χρήσης σημαίνει αποδοχή. Εφαρμοστέο δίκαιο: ελληνικό. Επικοινωνία: ',
    s8b: '.',
  },
  en: {
    back: '← Washio',
    title: 'Terms of Use',
    updatedLabel: 'Last updated:',
    updated: 'June 2026',

    s1h: '1. The service',
    s1a: 'Washio (washio.gr), operated by ',
    s1strong: 'PROKOPIOS KOUKIS (sole proprietorship), VAT No. 154067080',
    s1b: ', is a platform that connects drivers with partner car wash stations for booking and online payment. Washio acts as an intermediary; the wash service is provided by the respective station.',

    s2h: '2. Account',
    s2: 'An account is required to make a booking. You are responsible for the accuracy of your details and the security of your access. You can delete your account at any time from your Profile.',

    s3h: '3. Bookings & payments',
    s3: 'The price of each service is shown before booking and is calculated by the system. Payment is made online via Stripe. Booking confirmation takes effect after successful payment. Washio receives a commission from the station for each completed booking.',

    s4h: '4. Cancellations & refunds',
    s4: 'You can cancel in accordance with the policy shown at the time of booking (free cancellation up to 2 hours before). For an eligible cancellation, the refund is issued to the payment card within a few business days.',

    s5h: '5. User obligations',
    s5: 'You agree to use the service lawfully, to provide correct vehicle details and to show up at the time of your booking. Abusive use may lead to suspension of your account.',

    s6h: '6. Liability',
    s6: 'Washio is not liable for the quality of the service provided by the station or for any damage arising during the wash; related claims should be addressed to the station, while Washio assists with mediation.',

    s7h: '7. Data',
    s7a: 'The processing of personal data is described in the ',
    s7link: 'Privacy Policy',
    s7b: '.',

    s8h: '8. Changes & contact',
    s8a: 'We may amend these terms; continued use means acceptance. Applicable law: Greek. Contact: ',
    s8b: '.',
  },
}

export default function TermsContent() {
  const t = useT(T)
  return (
    <main className="min-h-screen bg-white">
      <div className="w-full max-w-2xl mx-auto px-5 py-12">
        <Link href="/welcome" className="text-[13px] text-gray-400">{t.back}</Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-4 mb-1 tracking-tight">{t.title}</h1>
        <p className="text-xs text-gray-400 mb-8">{t.updatedLabel} {t.updated}</p>

        <div className="flex flex-col gap-6 text-[14px] leading-relaxed text-gray-700">
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">{t.s1h}</h2>
            <p>
              {t.s1a}<strong>{t.s1strong}</strong>{t.s1b}
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">{t.s2h}</h2>
            <p>{t.s2}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">{t.s3h}</h2>
            <p>
              {t.s3}
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">{t.s4h}</h2>
            <p>{t.s4}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">{t.s5h}</h2>
            <p>{t.s5}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">{t.s6h}</h2>
            <p>{t.s6}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">{t.s7h}</h2>
            <p>{t.s7a}<Link href="/privacy" className="text-blue-600">{t.s7link}</Link>{t.s7b}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">{t.s8h}</h2>
            <p>{t.s8a}<a href="mailto:support@washio.gr" className="text-blue-600">support@washio.gr</a>{t.s8b}</p>
          </section>
        </div>
      </div>
    </main>
  )
}
