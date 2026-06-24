import Link from 'next/link'

export const metadata = {
  title: 'Όροι Χρήσης — Washio',
  description: 'Οι όροι χρήσης της πλατφόρμας Washio.',
}

const UPDATED = 'Ιούνιος 2026'

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="w-full max-w-2xl mx-auto px-5 py-12">
        <Link href="/welcome" className="text-[13px] text-gray-400">← Washio</Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-4 mb-1 tracking-tight">Όροι Χρήσης</h1>
        <p className="text-xs text-gray-400 mb-8">Τελευταία ενημέρωση: {UPDATED}</p>

        <div className="flex flex-col gap-6 text-[14px] leading-relaxed text-gray-700">
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">1. Η υπηρεσία</h2>
            <p>
              Το Washio (washio.gr), που λειτουργεί ο <strong>ΠΡΟΚΟΠΙΟΣ ΚΟΥΚΗΣ (ατομική επιχείρηση), ΑΦΜ 154067080</strong>, είναι πλατφόρμα
              που συνδέει οδηγούς με συνεργαζόμενα πρατήρια πλυσίματος αυτοκινήτου για κράτηση και online πληρωμή. Το Washio
              διαμεσολαβεί· την υπηρεσία πλυσίματος την παρέχει το εκάστοτε πρατήριο.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">2. Λογαριασμός</h2>
            <p>Απαιτείται λογαριασμός για κράτηση. Είσαι υπεύθυνος/η για την ακρίβεια των στοιχείων σου και την ασφάλεια της πρόσβασής σου. Μπορείς να διαγράψεις τον λογαριασμό σου ανά πάσα στιγμή μέσα από το Προφίλ.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">3. Κρατήσεις & πληρωμές</h2>
            <p>
              Η τιμή κάθε υπηρεσίας εμφανίζεται πριν την κράτηση και υπολογίζεται από το σύστημα. Η πληρωμή γίνεται online μέσω
              Stripe. Η επιβεβαίωση της κράτησης ισχύει μετά την επιτυχή πληρωμή. Το Washio λαμβάνει προμήθεια από το πρατήριο
              ανά ολοκληρωμένη κράτηση.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">4. Ακυρώσεις & επιστροφές</h2>
            <p>Μπορείς να ακυρώσεις σύμφωνα με την πολιτική που εμφανίζεται κατά την κράτηση (δωρεάν ακύρωση έως 2 ώρες πριν). Σε επιλέξιμη ακύρωση, η επιστροφή γίνεται στην κάρτα πληρωμής εντός λίγων εργάσιμων ημερών.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">5. Υποχρεώσεις χρήστη</h2>
            <p>Δεσμεύεσαι να χρησιμοποιείς την υπηρεσία νόμιμα, να δίνεις σωστά στοιχεία οχήματος και να εμφανίζεσαι στην ώρα της κράτησης. Καταχρηστική χρήση μπορεί να οδηγήσει σε αναστολή λογαριασμού.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">6. Ευθύνη</h2>
            <p>Το Washio δεν ευθύνεται για την ποιότητα της υπηρεσίας που παρέχει το πρατήριο ή για ζημίες που προκύπτουν κατά το πλύσιμο· σχετικά αιτήματα απευθύνονται στο πρατήριο, ενώ το Washio συνδράμει στη διαμεσολάβηση.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">7. Δεδομένα</h2>
            <p>Η επεξεργασία προσωπικών δεδομένων περιγράφεται στην <Link href="/privacy" className="text-blue-600">Πολιτική Απορρήτου</Link>.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">8. Αλλαγές & επικοινωνία</h2>
            <p>Ενδέχεται να τροποποιήσουμε τους όρους· η συνέχιση χρήσης σημαίνει αποδοχή. Εφαρμοστέο δίκαιο: ελληνικό. Επικοινωνία: <a href="mailto:support@washio.gr" className="text-blue-600">support@washio.gr</a>.</p>
          </section>
        </div>
      </div>
    </main>
  )
}
