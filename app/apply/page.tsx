'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

type FormValues = {
  businessName: string
  address: string
  city: string
  taxId: string
  contactName: string
  phone: string
  email: string
  hours: string
  hoursFrom: string
  hoursTo: string
  lanes: string
  washType: string
  termsAccepted: boolean
}

type FieldErrors = Partial<Record<keyof FormValues, string>>

const initialValues: FormValues = {
  businessName: '',
  address: '',
  city: '',
  taxId: '',
  contactName: '',
  phone: '',
  email: '',
  hours: '',
  hoursFrom: '',
  hoursTo: '',
  lanes: '',
  washType: '',
  termsAccepted: false,
}

export default function ApplyPage() {
  const router = useRouter()
  const [values, setValues] = useState<FormValues>(initialValues)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const validate = () => {
    const nextErrors: FieldErrors = {}

    if (!values.businessName.trim()) nextErrors.businessName = 'Συμπλήρωσε την επωνυμία πλυντηρίου.'
    if (!values.address.trim()) nextErrors.address = 'Συμπλήρωσε τη διεύθυνση.'
    if (!values.city.trim()) nextErrors.city = 'Συμπλήρωσε πόλη ή περιοχή.'
    if (!values.contactName.trim()) nextErrors.contactName = 'Συμπλήρωσε το ονοματεπώνυμο υπεύθυνου.'
    if (!values.phone.trim()) nextErrors.phone = 'Συμπλήρωσε τηλέφωνο.'
    if (!values.email.trim()) nextErrors.email = 'Συμπλήρωσε email.'
    if (!values.washType.trim()) nextErrors.washType = 'Επίλεξε τύπο πλυντηρίου.'
    if (!values.termsAccepted) nextErrors.termsAccepted = 'Πρέπει να αποδεχτείς τους όρους χρήσης.'

    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (loading || submitted) return // 2ο/3ο πάτημα όσο στέλνεται → αγνοείται
    setSubmitError('')

    if (!validate()) return

    setLoading(true)
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })

      if (!res.ok) throw new Error('Submit failed')

      setSubmitted(true)
      setErrors({})
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      setSubmitError('Παρουσιάστηκε σφάλμα. Δοκίμασε ξανά σε λίγο.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md px-5 py-8 pt-[calc(var(--safe-top)+16px)]">
        {/* Back — σελίδα χωρίς bottom nav */}
        <button
          onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}
          aria-label="Back"
          className="w-10 h-10 -ml-1 mb-4 rounded-full bg-white border border-gray-100 flex items-center justify-center text-gray-900"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="mb-6">
          <img src="/washio_logo.png" alt="Washio" className="h-10 w-auto mb-4" />
          <h1 className="text-lg font-semibold text-gray-900">Γίνε μέλος του Washio</h1>
          <p className="text-sm text-gray-400 mt-1">
            Συμπλήρωσε την αίτηση και θα επικοινωνήσουμε μαζί σου σύντομα.
          </p>
        </div>

        {submitted ? (
          <div className="flex flex-col items-center text-center py-10 gap-4">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <h2 className="text-[22px] font-bold text-gray-900">Η αίτησή σου στάλθηκε!</h2>
            <p className="text-[15px] text-gray-600 leading-relaxed">Τη λάβαμε για το <b>{values.businessName}</b>.<br />Θα σε καλέσουμε στο <b>{values.phone}</b> σύντομα.</p>
            <p className="text-[13px] text-gray-400">Δεν χρειάζεται να τη στείλεις ξανά.</p>
            <button onClick={() => router.push('/')} className="mt-2 h-12 px-8 rounded-xl bg-gray-900 text-white text-sm font-semibold">Επιστροφή</button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <section>
            <h2 className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-3">Στοιχεία πλυντηρίου</h2>
            <div className="space-y-2">
              <div>
                <input
                  type="text"
                  value={values.businessName}
                  onChange={e => setValues(v => ({ ...v, businessName: e.target.value }))}
                  placeholder="Επωνυμία πλυντηρίου"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                />
                {errors.businessName && <p className="text-red-500 text-xs mt-1">{errors.businessName}</p>}
              </div>
              <div>
                <input
                  type="text"
                  value={values.address}
                  onChange={e => setValues(v => ({ ...v, address: e.target.value }))}
                  placeholder="Διεύθυνση"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                />
                {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address}</p>}
              </div>
              <div>
                <input
                  type="text"
                  value={values.city}
                  onChange={e => setValues(v => ({ ...v, city: e.target.value }))}
                  placeholder="Πόλη / Περιοχή"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                />
                {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-3">Στοιχεία επικοινωνίας</h2>
            <div className="space-y-2">
              <div>
                <input
                  type="text"
                  value={values.contactName}
                  onChange={e => setValues(v => ({ ...v, contactName: e.target.value }))}
                  placeholder="Ονοματεπώνυμο υπεύθυνου"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                />
                {errors.contactName && <p className="text-red-500 text-xs mt-1">{errors.contactName}</p>}
              </div>
              <div>
                <input
                  type="tel"
                  value={values.phone}
                  onChange={e => setValues(v => ({ ...v, phone: e.target.value }))}
                  placeholder="Τηλέφωνο"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                />
                {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
              </div>
              <div>
                <input
                  type="email"
                  value={values.email}
                  onChange={e => setValues(v => ({ ...v, email: e.target.value }))}
                  placeholder="Email"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                />
                {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-3">Λειτουργικά στοιχεία</h2>
            <div className="space-y-2">
              <div>
                <select
                  value={values.washType}
                  onChange={e => setValues(v => ({ ...v, washType: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 bg-white focus:outline-none focus:border-gray-400"
                >
                  <option value="">Τύπος πλυντηρίου</option>
                  <option value="Αυτόματο">Αυτόματο</option>
                  <option value="Χειροκίνητο">Χειροκίνητο</option>
                  <option value="Και τα δύο">Και τα δύο</option>
                </select>
                {errors.washType && <p className="text-red-500 text-xs mt-1">{errors.washType}</p>}
              </div>
            </div>
          </section>

          <section>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={values.termsAccepted}
                onChange={e => setValues(v => ({ ...v, termsAccepted: e.target.checked }))}
                className="mt-0.5"
              />
              <span className="text-sm text-gray-700">
                Αποδέχομαι τους{' '}
                <a href="/oroi-xrisis.pdf" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">όρους χρήσης</a>
              </span>
            </label>
            {errors.termsAccepted && <p className="text-red-500 text-xs mt-1">{errors.termsAccepted}</p>}
          </section>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gray-900 text-white text-sm font-medium py-3.5 rounded-xl disabled:opacity-40"
          >
            {loading ? 'Αποστολή…' : 'Υποβολή αίτησης'}
          </button>

          {submitError && <p className="text-red-500 text-xs">{submitError}</p>}
        </form>
        )}
      </div>
    </main>
  )
}