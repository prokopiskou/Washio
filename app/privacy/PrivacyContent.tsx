'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n'

const T = {
  el: {
    back: '← Washio',
    title: 'Πολιτική Απορρήτου',
    updatedLabel: 'Τελευταία ενημέρωση:',
    updated: 'Νοέμβριος 2026',

    s1h: '1. Ποιοι είμαστε',
    s1a: 'Το Washio είναι πλατφόρμα κράτησης πλυσίματος αυτοκινήτου (washio.gr). Υπεύθυνος επεξεργασίας: ',
    s1strong: 'ΠΡΟΚΟΠΙΟΣ ΚΟΥΚΗΣ (ατομική επιχείρηση), ΑΦΜ 154067080',
    s1b: '. Για κάθε θέμα σχετικά με τα προσωπικά σου δεδομένα: ',
    s1c: '.',

    s2h: '2. Τι δεδομένα συλλέγουμε',
    s2intro: 'Συλλέγουμε μόνο όσα χρειάζονται για τη λειτουργία της υπηρεσίας:',
    s2l1s: 'Λογαριασμός:', s2l1: ' email, ονοματεπώνυμο, τηλέφωνο.',
    s2l2s: 'Όχημα:', s2l2: ' αριθμός πινακίδας, τύπος οχήματος.',
    s2l3s: 'Κρατήσεις & πληρωμές:', s2l3: ' ιστορικό κρατήσεων, ποσά. Τα στοιχεία κάρτας τα διαχειρίζεται αποκλειστικά πιστοποιημένος πάροχος πληρωμών — δεν τα αποθηκεύουμε εμείς.',
    s2l4s: 'Τοποθεσία:', s2l4: ' μόνο εφόσον το επιτρέψεις, για εύρεση κοντινών πρατηρίων. Η ακριβής θέση δεν αποθηκεύεται· κρατάμε μόνο στρογγυλεμένη περιοχή (~1 χλμ.) για στατιστικά ζήτησης ανά περιοχή.',
    s2l5s: 'Τεχνικά:', s2l5: ' βασικά δεδομένα συσκευής/χρήσης για ασφάλεια, πρόληψη κατάχρησης κουπονιών και βελτίωση. Για τα cookies δες την Πολιτική Cookies.',

    s3h: '3. Γιατί τα χρησιμοποιούμε',
    s3p1: 'Για τη δημιουργία λογαριασμού, τη διαχείριση κρατήσεων και πληρωμών, την αποστολή επιβεβαιώσεων/υπενθυμίσεων, την υποστήριξη και την ασφάλεια.',
    s3p2a: 'Εφόσον το επιλέξεις, χρησιμοποιούμε επίσης το email/τηλέφωνό σου για να σου στέλνουμε προσφορές, νέα και ενημερώσεις για υπηρεσίες του Washio. Μπορείς να διαγραφείς ανά πάσα στιγμή (opt-out) με ένα κλικ ή στο ',
    s3p2b: '.',
    s3p3: 'Νομική βάση (GDPR): εκτέλεση σύμβασης (κρατήσεις/πληρωμές), έννομο συμφέρον (ασφάλεια, πρόληψη απάτης, βελτίωση, ενημέρωση πελατών για παρόμοιες υπηρεσίες) και η συγκατάθεσή σου (τοποθεσία, ειδοποιήσεις, εμπορική επικοινωνία, cookies στατιστικών και διαφήμισης).',
    s3ads: 'Διαφήμιση: μόνο αν αποδεχθείς τα cookies διαφήμισης, στέλνουμε στη Meta (Facebook/Instagram) δεδομένα όπως κρυπτογραφημένο (hash) email/τηλέφωνο και τις κρατήσεις σου, για να μετράμε την αποτελεσματικότητα των διαφημίσεών μας. Μέσα στην εφαρμογή (iOS/Android) δεν το κάνουμε. Μπορείς να ανακαλέσεις τη συγκατάθεση από τις Ρυθμίσεις cookies.',

    s4h: '4. Με ποιους τα μοιραζόμαστε',
    s4intro: 'Με εκτελούντες την επεξεργασία (data processors), αυστηρά για τη λειτουργία της υπηρεσίας:',
    s4l1: 'Supabase — βάση δεδομένων & ταυτοποίηση χρηστών.',
    s4l2: 'Stripe — πληρωμές με κάρτα.',
    s4l3: 'Resend (email), BulkGate (SMS), Apple/Google (ειδοποιήσεις push).',
    s4l4: 'Vercel — φιλοξενία (hosting) και ανώνυμα στατιστικά.',
    s4l5: 'Google — χάρτες· Google Analytics και Meta μόνο με τη συγκατάθεσή σου.',
    s4l6s: 'Συνεργαζόμενα πρατήρια', s4l6: ' — μόνο τα στοιχεία της δικής σου κράτησης (π.χ. ώρα, υπηρεσία, πινακίδα).',
    s4xfer: 'Ορισμένοι πάροχοι (π.χ. Stripe, Vercel, Google, Meta) μπορεί να επεξεργάζονται δεδομένα στις ΗΠΑ, με βάση το EU–US Data Privacy Framework ή τυποποιημένες συμβατικές ρήτρες της Ε.Ε.',
    s4outa: 'Δεν πουλάμε ποτέ τα δεδομένα σου. Για απορίες σχετικά με τους εκτελούντες: ',
    s4outb: '.',

    s5h: '5. Διατήρηση',
    s5: 'Κρατάμε τα δεδομένα όσο έχεις ενεργό λογαριασμό. Στοιχεία κρατήσεων/συναλλαγών διατηρούνται όσο απαιτεί η φορολογική/λογιστική νομοθεσία, ανωνυμοποιημένα όπου είναι δυνατό.',

    s6h: '6. Τα δικαιώματά σου',
    s6a: 'Έχεις δικαίωμα πρόσβασης, διόρθωσης, διαγραφής, περιορισμού, φορητότητας και εναντίωσης. Μπορείς να',
    s6strong: ' διαγράψεις τον λογαριασμό σου και τα στοιχεία σου απευθείας μέσα από την εφαρμογή',
    s6b: ' (Προφίλ → Διαγραφή λογαριασμού). Για οποιοδήποτε αίτημα: ',
    s6c: '. Έχεις επίσης δικαίωμα καταγγελίας στην Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα (dpa.gr).',

    s7h: '7. Ασφάλεια',
    s7: 'Χρησιμοποιούμε κρυπτογράφηση κατά τη μεταφορά, ελεγχόμενη πρόσβαση και έλεγχο δικαιωμάτων σε επίπεδο βάσης.',

    s8h: '8. Αλλαγές',
    s8: 'Ενδέχεται να επικαιροποιήσουμε την παρούσα πολιτική. Σημαντικές αλλαγές θα ανακοινώνονται μέσα στην εφαρμογή.',

    cookiesA: 'Για τα cookies και τις επιλογές σου: ', cookiesLink: 'Πολιτική Cookies',
    footerA: 'Δες επίσης τους ',
    footerLink: 'Όρους Χρήσης',
    footerB: '.',
  },
  en: {
    back: '← Washio',
    title: 'Privacy Policy',
    updatedLabel: 'Last updated:',
    updated: 'November 2026',

    s1h: '1. Who we are',
    s1a: 'Washio is a car wash booking platform (washio.gr). Data controller: ',
    s1strong: 'PROKOPIOS KOUKIS (sole proprietorship), VAT No. 154067080',
    s1b: '. For any matter regarding your personal data: ',
    s1c: '.',

    s2h: '2. What data we collect',
    s2intro: 'We collect only what is needed for the operation of the service:',
    s2l1s: 'Account:', s2l1: ' email, full name, phone.',
    s2l2s: 'Vehicle:', s2l2: ' license plate number, vehicle type.',
    s2l3s: 'Bookings & payments:', s2l3: ' booking history, amounts. Card details are handled exclusively by a certified payment provider — we do not store them.',
    s2l4s: 'Location:', s2l4: ' only if you allow it, to find nearby stations. Your exact position is not stored; we keep only a rounded area (~1 km) for demand statistics per area.',
    s2l5s: 'Technical:', s2l5: ' basic device/usage data for security, coupon-abuse prevention and improvement. For cookies see our Cookie Policy.',

    s3h: '3. Why we use it',
    s3p1: 'To create your account, manage bookings and payments, send confirmations/reminders, provide support and ensure security.',
    s3p2a: 'If you opt in, we also use your email/phone to send you offers, news and updates about Washio services. You can unsubscribe (opt out) at any time with one click or at ',
    s3p2b: '.',
    s3p3: 'Legal basis (GDPR): performance of a contract (bookings/payments), legitimate interest (security, fraud prevention, improvement, informing customers about similar services) and your consent (location, notifications, commercial communication, analytics and advertising cookies).',
    s3ads: 'Advertising: only if you accept advertising cookies do we send Meta (Facebook/Instagram) data such as your hashed email/phone and your bookings, to measure the effectiveness of our ads. We do not do this inside the app (iOS/Android). You can withdraw consent from Cookie settings.',

    s4h: '4. Who we share it with',
    s4intro: 'With data processors, strictly for the operation of the service:',
    s4l1: 'Supabase — database & user authentication.',
    s4l2: 'Stripe — card payments.',
    s4l3: 'Resend (email), BulkGate (SMS), Apple/Google (push notifications).',
    s4l4: 'Vercel — hosting and anonymous analytics.',
    s4l5: 'Google — maps; Google Analytics and Meta only with your consent.',
    s4l6s: 'Partner stations', s4l6: ' — only the details of your own booking (e.g. time, service, plate).',
    s4xfer: 'Some providers (e.g. Stripe, Vercel, Google, Meta) may process data in the US, under the EU–US Data Privacy Framework or EU standard contractual clauses.',
    s4outa: 'We never sell your data. Questions about our processors: ',
    s4outb: '.',

    s5h: '5. Retention',
    s5: 'We keep your data for as long as you have an active account. Booking/transaction records are retained for as long as tax/accounting law requires, anonymized where possible.',

    s6h: '6. Your rights',
    s6a: 'You have the right to access, rectification, erasure, restriction, portability and objection. You can',
    s6strong: ' delete your account and your data directly from within the app',
    s6b: ' (Profile → Delete account). For any request: ',
    s6c: '. You also have the right to lodge a complaint with the Hellenic Data Protection Authority (dpa.gr).',

    s7h: '7. Security',
    s7: 'We use encryption in transit, controlled access and permission checks at the database level.',

    s8h: '8. Changes',
    s8: 'We may update this policy. Significant changes will be announced within the app.',

    cookiesA: 'For cookies and your choices: ', cookiesLink: 'Cookie Policy',
    footerA: 'See also the ',
    footerLink: 'Terms of Use',
    footerB: '.',
  },
}

export default function PrivacyContent() {
  const t = useT(T)
  return (
    <main className="min-h-screen bg-white">
      <div className="w-full max-w-2xl mx-auto px-5 py-12">
        <Link href="/" className="text-[13px] text-gray-400">{t.back}</Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-4 mb-1 tracking-tight">{t.title}</h1>
        <p className="text-xs text-gray-400 mb-8">{t.updatedLabel} {t.updated}</p>

        <div className="flex flex-col gap-6 text-[14px] leading-relaxed text-gray-700">
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">{t.s1h}</h2>
            <p>
              {t.s1a}<strong>{t.s1strong}</strong>{t.s1b}<a href="mailto:support@washio.gr" className="text-blue-600">support@washio.gr</a>{t.s1c}
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">{t.s2h}</h2>
            <p>{t.s2intro}</p>
            <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
              <li><strong>{t.s2l1s}</strong>{t.s2l1}</li>
              <li><strong>{t.s2l2s}</strong>{t.s2l2}</li>
              <li><strong>{t.s2l3s}</strong>{t.s2l3}</li>
              <li><strong>{t.s2l4s}</strong>{t.s2l4}</li>
              <li><strong>{t.s2l5s}</strong>{t.s2l5}</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">{t.s3h}</h2>
            <p>
              {t.s3p1}
            </p>
            <p className="mt-2">
              {t.s3p2a}<a href="mailto:support@washio.gr" className="text-blue-600">support@washio.gr</a>{t.s3p2b}
            </p>
            <p className="mt-2">
              {t.s3p3}
            </p>
            <p className="mt-2">{t.s3ads}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">{t.s4h}</h2>
            <p>{t.s4intro}</p>
            <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
              <li>{t.s4l1}</li>
              <li>{t.s4l2}</li>
              <li>{t.s4l3}</li>
              <li>{t.s4l4}</li>
              <li>{t.s4l5}</li>
              <li><strong>{t.s4l6s}</strong>{t.s4l6}</li>
            </ul>
            <p className="mt-2">{t.s4xfer}</p>
            <p className="mt-2">{t.s4outa}<a href="mailto:support@washio.gr" className="text-blue-600">support@washio.gr</a>{t.s4outb}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">{t.s5h}</h2>
            <p>{t.s5}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">{t.s6h}</h2>
            <p>
              {t.s6a}<strong>{t.s6strong}</strong>{t.s6b}<a href="mailto:support@washio.gr" className="text-blue-600">support@washio.gr</a>{t.s6c}
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">{t.s7h}</h2>
            <p>{t.s7}</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">{t.s8h}</h2>
            <p>{t.s8}</p>
          </section>

          <p className="text-[14px]">
            {t.cookiesA}<Link href="/cookies" className="text-blue-600">{t.cookiesLink}</Link>.
          </p>
          <p className="text-xs text-gray-400 pt-4">
            {t.footerA}<Link href="/terms" className="text-blue-600">{t.footerLink}</Link>{t.footerB}
          </p>
        </div>
      </div>
    </main>
  )
}
