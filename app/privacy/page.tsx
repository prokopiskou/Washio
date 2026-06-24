import Link from 'next/link'

export const metadata = {
  title: 'Πολιτική Απορρήτου — Washio',
  description: 'Πώς το Washio συλλέγει, χρησιμοποιεί και προστατεύει τα δεδομένα σου.',
}

const UPDATED = 'Ιούνιος 2026'

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white">
      <div className="w-full max-w-2xl mx-auto px-5 py-12">
        <Link href="/welcome" className="text-[13px] text-gray-400">← Washio</Link>
        <h1 className="text-2xl font-semibold text-gray-900 mt-4 mb-1 tracking-tight">Πολιτική Απορρήτου</h1>
        <p className="text-xs text-gray-400 mb-8">Τελευταία ενημέρωση: {UPDATED}</p>

        <div className="flex flex-col gap-6 text-[14px] leading-relaxed text-gray-700">
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">1. Ποιοι είμαστε</h2>
            <p>
              Το Washio είναι πλατφόρμα κράτησης πλυσίματος αυτοκινήτου (washio.gr). Υπεύθυνος επεξεργασίας:
              {' '}<strong>ΠΡΟΚΟΠΙΟΣ ΚΟΥΚΗΣ (ατομική επιχείρηση), ΑΦΜ 154067080</strong>. Για κάθε θέμα σχετικά με τα
              προσωπικά σου δεδομένα: <a href="mailto:support@washio.gr" className="text-blue-600">support@washio.gr</a>.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">2. Τι δεδομένα συλλέγουμε</h2>
            <p>Συλλέγουμε μόνο όσα χρειάζονται για τη λειτουργία της υπηρεσίας:</p>
            <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
              <li><strong>Λογαριασμός:</strong> email, ονοματεπώνυμο, τηλέφωνο.</li>
              <li><strong>Όχημα:</strong> αριθμός πινακίδας, τύπος οχήματος.</li>
              <li><strong>Κρατήσεις & πληρωμές:</strong> ιστορικό κρατήσεων, ποσά. Τα στοιχεία κάρτας τα διαχειρίζεται αποκλειστικά ο πάροχος πληρωμών (Stripe) — δεν τα αποθηκεύουμε εμείς.</li>
              <li><strong>Τοποθεσία:</strong> μόνο εφόσον το επιτρέψεις, για εύρεση κοντινών πρατηρίων. Δεν αποθηκεύεται.</li>
              <li><strong>Τεχνικά:</strong> βασικά δεδομένα συσκευής/χρήσης για ασφάλεια και βελτίωση.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">3. Γιατί τα χρησιμοποιούμε</h2>
            <p>
              Για τη δημιουργία λογαριασμού, τη διαχείριση κρατήσεων και πληρωμών, την αποστολή επιβεβαιώσεων/υπενθυμίσεων,
              την υποστήριξη και την ασφάλεια. Νομική βάση (GDPR): εκτέλεση σύμβασης, έννομο συμφέρον και η συγκατάθεσή σου
              (π.χ. τοποθεσία, ειδοποιήσεις).
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">4. Με ποιους τα μοιραζόμαστε</h2>
            <p>Με εκτελούντες την επεξεργασία, αυστηρά για τη λειτουργία της υπηρεσίας:</p>
            <ul className="list-disc pl-5 mt-2 flex flex-col gap-1">
              <li><strong>Supabase</strong> — βάση δεδομένων & ταυτοποίηση.</li>
              <li><strong>Stripe</strong> — επεξεργασία πληρωμών.</li>
              <li><strong>Resend</strong> — αποστολή email.</li>
              <li><strong>Vercel</strong> — φιλοξενία εφαρμογής.</li>
              <li><strong>Google Maps</strong> — χάρτης & εύρεση πρατηρίων.</li>
              <li><strong>Συνεργαζόμενα πρατήρια</strong> — μόνο τα στοιχεία της δικής σου κράτησης (π.χ. ώρα, υπηρεσία, πινακίδα).</li>
            </ul>
            <p className="mt-2">Δεν πουλάμε ποτέ τα δεδομένα σου.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">5. Διατήρηση</h2>
            <p>Κρατάμε τα δεδομένα όσο έχεις ενεργό λογαριασμό. Στοιχεία κρατήσεων/συναλλαγών διατηρούνται όσο απαιτεί η φορολογική/λογιστική νομοθεσία, ανωνυμοποιημένα όπου είναι δυνατό.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">6. Τα δικαιώματά σου</h2>
            <p>
              Έχεις δικαίωμα πρόσβασης, διόρθωσης, διαγραφής, περιορισμού, φορητότητας και εναντίωσης. Μπορείς να
              <strong> διαγράψεις τον λογαριασμό σου και τα στοιχεία σου απευθείας μέσα από την εφαρμογή</strong> (Προφίλ →
              Διαγραφή λογαριασμού). Για οποιοδήποτε αίτημα: <a href="mailto:support@washio.gr" className="text-blue-600">support@washio.gr</a>.
              Έχεις επίσης δικαίωμα καταγγελίας στην Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα (dpa.gr).
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">7. Ασφάλεια</h2>
            <p>Χρησιμοποιούμε κρυπτογράφηση κατά τη μεταφορά, ελεγχόμενη πρόσβαση και έλεγχο δικαιωμάτων σε επίπεδο βάσης.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-1.5">8. Αλλαγές</h2>
            <p>Ενδέχεται να επικαιροποιήσουμε την παρούσα πολιτική. Σημαντικές αλλαγές θα ανακοινώνονται μέσα στην εφαρμογή.</p>
          </section>

          <p className="text-xs text-gray-400 pt-4">
            Δες επίσης τους <Link href="/terms" className="text-blue-600">Όρους Χρήσης</Link>.
          </p>
        </div>
      </div>
    </main>
  )
}
