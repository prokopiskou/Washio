'use client'

import { FormEvent, useState } from 'react'

type FormValues = {
  businessName: string
  afm: string
  doy: string
  address: string
  ibanHolder: string
  iban: string
  contactName: string
  phone: string
  email: string
  declarationAccepted: boolean
}

type FieldErrors = Partial<Record<keyof FormValues, string>>

const initialValues: FormValues = {
  businessName: '',
  afm: '',
  doy: '',
  address: '',
  ibanHolder: '',
  iban: '',
  contactName: '',
  phone: '',
  email: '',
  declarationAccepted: false,
}

const inputClass =
  'w-full border-2 border-gray-300 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 transition-colors'

/** Έλεγχος ελληνικού ΑΦΜ (9 ψηφία + ψηφίο ελέγχου mod 11). */
function isValidAfm(value: string): boolean {
  const afm = value.trim()
  if (!/^\d{9}$/.test(afm)) return false
  if (afm === '000000000') return false
  const digits = afm.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 8; i++) sum += digits[i] * 2 ** (8 - i)
  return ((sum % 11) % 10) === digits[8]
}

function normalizeIban(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

/** Έλεγχος IBAN με mod-97 (ISO 13616). Ελληνικά IBAN = 27 χαρακτήρες. */
function isValidIban(value: string): boolean {
  const iban = normalizeIban(value)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false
  if (iban.length < 15 || iban.length > 34) return false
  if (iban.startsWith('GR') && iban.length !== 27) return false
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  const expanded = rearranged.replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55))
  let remainder = 0
  for (const ch of expanded) remainder = (remainder * 10 + Number(ch)) % 97
  return remainder === 1
}

function formatIban(value: string): string {
  return normalizeIban(value).replace(/(.{4})/g, '$1 ').trim()
}

export default function OnboardingPage() {
  const [values, setValues] = useState<FormValues>(initialValues)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues(v => ({ ...v, [key]: value }))

  const validate = () => {
    const e: FieldErrors = {}

    if (!values.businessName.trim()) e.businessName = 'Συμπλήρωσε την επωνυμία.'

    if (!values.afm.trim()) e.afm = 'Συμπλήρωσε τον ΑΦΜ.'
    else if (!isValidAfm(values.afm)) e.afm = 'Ο ΑΦΜ δεν είναι έγκυρος. Έλεγξε τα 9 ψηφία.'

    if (!values.doy.trim()) e.doy = 'Συμπλήρωσε τη ΔΟΥ.'
    if (!values.address.trim()) e.address = 'Συμπλήρωσε τη διεύθυνση έδρας.'
    if (!values.ibanHolder.trim()) e.ibanHolder = 'Συμπλήρωσε τον δικαιούχο του λογαριασμού.'

    if (!values.iban.trim()) e.iban = 'Συμπλήρωσε το IBAN.'
    else if (!isValidIban(values.iban)) e.iban = 'Το IBAN δεν είναι έγκυρο. Έλεγξέ το ξανά.'

    if (!values.contactName.trim()) e.contactName = 'Συμπλήρωσε το ονοματεπώνυμο υπεύθυνου.'
    if (!values.phone.trim()) e.phone = 'Συμπλήρωσε τηλέφωνο.'

    if (!values.email.trim()) e.email = 'Συμπλήρωσε email.'
    else if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) e.email = 'Το email δεν είναι έγκυρο.'

    if (!values.declarationAccepted) e.declarationAccepted = 'Πρέπει να αποδεχτείς τη δήλωση.'

    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    setSubmitError('')
    if (!validate()) return

    setLoading(true)
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, iban: normalizeIban(values.iban) }),
      })
      if (!res.ok) throw new Error('Submit failed')
      setSubmitted(true)
      setValues(initialValues)
      setErrors({})
    } catch {
      setSubmitError('Παρουσιάστηκε σφάλμα. Δοκίμασε ξανά σε λίγο.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <main className="min-h-screen bg-white flex flex-col items-center">
        <div className="w-full max-w-md px-5 py-8 pt-[calc(var(--safe-top)+16px)]">
          <img src="/washio_logo.png" alt="Washio" className="h-10 w-auto mb-6" />
          <h1 className="text-lg font-semibold text-gray-900">Τα στοιχεία στάλθηκαν</h1>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            Ευχαριστούμε. Θα ελέγξουμε τα στοιχεία και θα επικοινωνήσουμε μαζί σου για την
            ενεργοποίηση του λογαριασμού σου και μια σύντομη εκπαίδευση στο dashboard.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md px-5 py-8 pt-[calc(var(--safe-top)+16px)]">
        <div className="mb-6">
          <img src="/washio_logo.png" alt="Washio" className="h-10 w-auto mb-4" />
          <h1 className="text-lg font-semibold text-gray-900">Στοιχεία συνεργασίας</h1>
          <p className="text-sm text-gray-400 mt-1 leading-relaxed">
            Δύο λεπτά. Χρειαζόμαστε μόνο αυτά για να σε τιμολογήσουμε και να σε πληρώνουμε
            σωστά. Δεν απαιτείται κανένα έγγραφο.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          <section>
            <h2 className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-3">
              Στοιχεία τιμολόγησης
            </h2>
            <div className="space-y-2">
              <div>
                <input
                  type="text"
                  value={values.businessName}
                  onChange={e => set('businessName', e.target.value)}
                  placeholder="Επωνυμία επιχείρησης"
                  className={inputClass}
                />
                {errors.businessName && <p className="text-red-500 text-xs mt-1">{errors.businessName}</p>}
              </div>
              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={9}
                  value={values.afm}
                  onChange={e => set('afm', e.target.value.replace(/\D/g, ''))}
                  placeholder="ΑΦΜ (9 ψηφία)"
                  className={inputClass}
                />
                {errors.afm && <p className="text-red-500 text-xs mt-1">{errors.afm}</p>}
              </div>
              <div>
                <input
                  type="text"
                  value={values.doy}
                  onChange={e => set('doy', e.target.value)}
                  placeholder="ΔΟΥ"
                  className={inputClass}
                />
                {errors.doy && <p className="text-red-500 text-xs mt-1">{errors.doy}</p>}
              </div>
              <div>
                <input
                  type="text"
                  value={values.address}
                  onChange={e => set('address', e.target.value)}
                  placeholder="Διεύθυνση έδρας (οδός, αριθμός, ΤΚ, πόλη)"
                  className={inputClass}
                />
                {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address}</p>}
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-3">
              Λογαριασμός πληρωμής
            </h2>
            <div className="space-y-2">
              <div>
                <input
                  type="text"
                  value={values.ibanHolder}
                  onChange={e => set('ibanHolder', e.target.value)}
                  placeholder="Δικαιούχος λογαριασμού"
                  className={inputClass}
                />
                {errors.ibanHolder && <p className="text-red-500 text-xs mt-1">{errors.ibanHolder}</p>}
              </div>
              <div>
                <input
                  type="text"
                  value={values.iban}
                  onChange={e => set('iban', e.target.value.toUpperCase())}
                  onBlur={e => set('iban', formatIban(e.target.value))}
                  placeholder="IBAN (π.χ. GR16 0110 1250 0000 0001 2300 695)"
                  className={inputClass}
                />
                {errors.iban && <p className="text-red-500 text-xs mt-1">{errors.iban}</p>}
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              Ο δικαιούχος πρέπει να είναι η επιχείρηση ή ο νόμιμος εκπρόσωπός της.
            </p>
          </section>

          <section>
            <h2 className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-3">
              Επικοινωνία
            </h2>
            <div className="space-y-2">
              <div>
                <input
                  type="text"
                  value={values.contactName}
                  onChange={e => set('contactName', e.target.value)}
                  placeholder="Ονοματεπώνυμο υπεύθυνου"
                  className={inputClass}
                />
                {errors.contactName && <p className="text-red-500 text-xs mt-1">{errors.contactName}</p>}
              </div>
              <div>
                <input
                  type="tel"
                  value={values.phone}
                  onChange={e => set('phone', e.target.value)}
                  placeholder="Τηλέφωνο"
                  className={inputClass}
                />
                {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
              </div>
              <div>
                <input
                  type="email"
                  value={values.email}
                  onChange={e => set('email', e.target.value)}
                  placeholder="Email"
                  className={inputClass}
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
              </div>
            </div>
          </section>

          <section>
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={values.declarationAccepted}
                onChange={e => set('declarationAccepted', e.target.checked)}
                className="mt-0.5 shrink-0 w-4 h-4 accent-gray-900"
              />
              <span className="text-xs text-gray-600 leading-relaxed">
                Δηλώνω υπεύθυνα ότι η επιχείρηση λειτουργεί νόμιμα και διαθέτει τις απαιτούμενες
                άδειες για την παροχή υπηρεσιών πλυσίματος και περιποίησης οχημάτων, ότι τα
                στοιχεία που υποβάλλω είναι αληθή και ακριβή, ότι ο λογαριασμός IBAN ανήκει στην
                επιχείρηση ή σε εμένα ως νόμιμο εκπρόσωπό της, και ότι θα ενημερώσω άμεσα τη
                Washio για κάθε μεταβολή. Συναινώ στην επεξεργασία των δεδομένων μου από την
                ατομική επιχείρηση «Προκόπιος Κούκης» (Washio, ΑΦΜ 154067080) αποκλειστικά για
                τους σκοπούς της συνεργασίας, σύμφωνα με τον ΓΚΠΔ (ΕΕ 2016/679).
              </span>
            </label>
            {errors.declarationAccepted && (
              <p className="text-red-500 text-xs mt-1">{errors.declarationAccepted}</p>
            )}
          </section>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white text-sm font-medium py-3.5 rounded-xl disabled:opacity-40"
          >
            {loading ? 'Υποβολή...' : 'Υποβολή στοιχείων'}
          </button>

          {submitError && <p className="text-red-500 text-xs">{submitError}</p>}
        </form>
      </div>
    </main>
  )
}
