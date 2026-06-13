<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Washio — Project context (για κάθε αλλαγή κώδικα)

## Τι είναι
Washio = η πρώτη πλατφόρμα κράτησης πλυσίματος αυτοκινήτου στην Ελλάδα. Mobile-first web app (washio.gr) + native wrapper μέσω Capacitor (hybrid, ΟΧΙ fully native).
Value proposition: «Βρες σημείο. Κλείσε ραντεβού. Πλήρωσε. Έτοιμος.»
Business model: commission-based, success-based — μικρή προμήθεια μόνο σε κρατήσεις της πλατφόρμας. Καμία συνδρομή/χρέωση εισόδου για partners.
Co-founders: Προκόπης Κούκης (Product & Tech), Γιώργος Καρίμαλης (Operations & Partners).

3 audiences:
- **Πελάτες** (οδηγοί ΙΧ/μοτό): βρίσκουν κοντινό πρατήριο, κλείνουν slot, πληρώνουν online.
- **Partners** (ιδιοκτήτες πρατηρίων): δέχονται κρατήσεις, διαχειρίζονται ωράριο/υπηρεσίες/προσωπικό, βλέπουν έσοδα.
- **Admin** (Προκόπης + Γιώργος): διαχειρίζονται network, αιτήσεις, εκκαθαρίσεις.

## Stack
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Supabase (auth + db) · Stripe · Resend · Capacitor 8 · recharts · lucide-react · web-push. Deploy: Vercel.

## Route map (ΑΛΗΘΙΝΟΣ — από τον κώδικα)
- `/welcome` (`app/welcome/page.tsx`) → **η ΑΡΧΙΚΗ σελίδα**. Marketing hero «Γρήγορο πλύσιμο. Έξυπνη εμπειρία.», με μεγάλο logo στο hero. **Όταν ο Προκόπης λέει «αρχική», εννοεί ΑΥΤΗ τη σελίδα.**
- `/landing` (`app/landing/page.tsx`) → δημόσια landing (έχει logo σε header + footer).
- `/` (`app/page.tsx`) → home για logged-in (booking entry, «Που θες να κλείσεις ραντεβού;»).
- `/map` (`app/(main)/map/page.tsx`) → Google Maps με SVG pins, αναζήτηση περιοχής.
- `/locations/[slug]` → location detail: vehicle type, υπηρεσία, ημερομηνία, slot.
- `/booking` → checkout (Stripe PaymentElement, login required). `/booking/confirmed` → ticket/success.
- `/profile`, `/profile/bookings`, `/profile/bookings/[id]`, `/profile/favorites` → προφίλ, κρατήσεις, αγαπημένα.
- `/login`, `/register` (`app/(auth)/`) → Supabase Auth (email OTP, Google, Facebook).
- `/apply` → partner application form → Resend email + Supabase `applications`.
- `/dashboard` → Partner dashboard (tabs: Overview, Κρατήσεις, Ημερολόγιο, Ωράριο, Υπηρεσίες, Προσωπικό, Feedback).
- `/admin` → Admin dashboard (tabs: Overview, Κρατήσεις, Πρατήρια, Χρήστες, Αιτήσεις, Οικονομικά, Εκκαθαρίσεις, Υπηρεσίες). `/admin/locations/new`.
- `app/api/`: `stripe/webhook`, `bookings/cancel`, `email/*`.

## Logo — προσοχή (υπάρχει σε ΠΟΛΛΑ σημεία)
Δύο αρχεία: `/washio-logo.png` (με παύλα) και `/washio_logo.png` (με κάτω παύλα) — και τα δύο χρησιμοποιούνται.
Logo εμφανίζεται σε: `welcome` (hero), `landing` (×2), `/` (page.tsx), `apply`, `login`, `register`, `profile`, και `layout.tsx` (apple-touch-icon).
➜ Όταν ζητείται αλλαγή/αφαίρεση logo «στην αρχική», αφορά **ΜΟΝΟ** το `app/welcome/page.tsx`. Μην αγγίζεις τα logo σε άλλες σελίδες εκτός αν ζητηθεί ρητά.

## Ορολογία (canonical, customer-facing στα ελληνικά)
- Πρατήριο / πρατήρια (ΟΧΙ «σταθμός», ΟΧΙ «βενζινάδικο»).
- Κράτηση / κρατήσεις (ΟΧΙ «ραντεβού» στο UI).
- Ωράριο / slots / πληρότητα ωραρίου.
- Εκκαθαρίσεις (ΟΧΙ «payouts» customer-facing). Προμήθεια (ΟΧΙ «commission» customer-facing).
- Vehicle types: **ΙΧ / Μοτοσικλέτα** (ΟΧΙ «auto»/«bike»).
- Υπηρεσίες/τιμές (Αττική): Μέσα €5 · Έξω €7 · Μέσα & Έξω €12.
- Brand: **Washio** (κεφαλαίο W μόνο, ΟΧΙ «WASHIO»). Domain: washio.gr.
- Αποφυγή αγγλικών σε customer-facing UI («online» → «εύκολα και γρήγορα»).

## Design tokens (ΜΗΝ τα αλλάζεις)
- Colors: `#0A0A0A` ink · `#FFFFFF` · `#F7F7F7`/`#FAFAFA` surfaces · `#1A6FD4` blue · `#10B981` success · `#F59E0B` warning · `#EF4444` error.
- Typography: SF Pro Display · sizes 32/24/18/14/12/11 · tabular-nums.
- Spacing: 4px grid · radii 12/16/24px.
- Aesthetic: premium minimal, «calm power». **Όχι emojis. Όχι gradients. Μόνο lucide icons.** Status pills με dot indicators.

## Hard rules — ΔΕΝ σπάνε
- Stripe webhook URL ΠΡΕΠΕΙ να είναι το primary domain `https://www.washio.gr` (ΟΧΙ vercel preview).
- Stripe PaymentElement: ΜΗΝ περνάς `fields: { billingDetails: 'never' }` → προκαλεί IntegrationError.
- `useSearchParams()` ΠΑΝΤΑ μέσα σε `<Suspense>` boundary (αλλιώς Vercel build fail).
- Authentication required πριν booking/checkout — guest checkout αφαιρέθηκε σκόπιμα.
- Vehicle type: strict ΙΧ/Μοτοσικλέτα, locked μετά την επιλογή.
- Partners επιλέγουν από master service list — ΟΧΙ custom service creation. Service durations αφαιρέθηκαν από owner dashboard (μόνο τιμή).
- `btoa()` σπάει με Unicode → χρήση `encodeURIComponent` για SVG data URLs.
- Κάνε ΜΟΝΟ τις αλλαγές που ζητά το issue. Μην αγγίζεις άσχετα αρχεία/σελίδες.

## Στυλ απαντήσεων (PR descriptions)
Σύντομα, στα ελληνικά, direct, χωρίς fluff. Πλήρη αρχεία (όχι μισά snippets). Σημείωσε ρητά κάθε υπόθεση που έκανες.
