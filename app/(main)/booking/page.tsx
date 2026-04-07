'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, CreditCard, Plus, Minus, Shield } from 'lucide-react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const MONTHS_SHORT = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']

const services: Record<string, { name: string; price: number; duration: number }> = {
  '1': { name: 'Μέσα', price: 10, duration: 30 },
  '2': { name: 'Έξω', price: 6, duration: 15 },
  '3': { name: 'Μέσα-Έξω', price: 15, duration: 45 },
}

const slots: Record<string, string> = {
  '1': '09:00', '2': '09:30', '3': '10:00', '4': '10:30',
  '5': '11:00', '6': '11:30', '7': '12:00', '8': '12:30',
  '9': '13:00', '10': '13:30', '11': '14:00', '12': '14:30',
}

const addons = [
  { id: 1, name: 'Αλλαγή λαδιών', price: 25 },
  { id: 2, name: 'Αλλαγή υαλοκαθαριστήρων', price: 15 },
  { id: 3, name: 'Έλεγχος τυρών', price: 8 },
  { id: 4, name: 'Αρωματικό εσωτερικού', price: 5 },
]

function CheckoutForm({ total, email, service, formattedDate, slotTime, clientSecret, firstName, lastName, phone }: {
  total: number
  email: string
  service: { name: string; price: number }
  formattedDate: string
  slotTime: string
  clientSecret: string
  firstName: string
  lastName: string
  phone: string
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!stripe || !elements || !clientSecret) {
      setError('Το σύστημα πληρωμών δεν είναι έτοιμο. Δοκίμασε ξανά.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const { error: submitError } = await elements.submit()
      if (submitError) {
        setError(submitError.message || 'Σφάλμα επαλήθευσης.')
        return
      }

      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/booking/confirmed?email=${encodeURIComponent(email)}&date=${encodeURIComponent(formattedDate)}&time=${encodeURIComponent(slotTime)}&service=${encodeURIComponent(service.name)}`,
          payment_method_data: {
            billing_details: {
              name: `${firstName} ${lastName}`,
              email: email,
              phone: phone,
            }
          }
        },
      })

      if (confirmError) {
        setError(confirmError.message || 'Η πληρωμή απέτυχε.')
      }
    } catch (err) {
      setError('Άγνωστο σφάλμα. Δοκίμασε ξανά.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-5 py-4">
      <p className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-3">Πληρωμή</p>
      <div className="border border-gray-200 rounded-xl p-4 mb-2">
        <PaymentElement options={{
          layout: 'tabs',
          wallets: { applePay: 'auto', googlePay: 'auto' },
          fields: { billingDetails: 'never' },
          terms: { card: 'never' }
        }} />
      </div>
      <div className="flex items-center gap-2 mb-4 px-1">
        <Shield size={12} className="text-green-500 shrink-0" />
        <span className="text-xs text-gray-400">Ασφαλής πληρωμή 256-bit SSL · Powered by Stripe</span>
      </div>
      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
      <button
        onClick={handleSubmit}
        disabled={loading || !stripe}
        className="w-full bg-gray-900 text-white text-sm font-medium py-3.5 rounded-xl flex items-center justify-center gap-2 disabled:opacity-40"
      >
        {loading ? <span className="text-gray-400">Επεξεργασία...</span> : <><CreditCard size={15} />Πλήρωσε €{total}</>}
      </button>
    </div>
  )
}

function BookingPageContent() {
  const router = useRouter()
  const params = useSearchParams()

  const serviceId = params.get('service') || '1'
  const slotId = params.get('slot') || '1'
  const dateStr = params.get('date') || new Date().toISOString().split('T')[0]

  const service = services[serviceId]
  const slotTime = slots[slotId]
  const date = new Date(dateStr)
  const formattedDate = `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [plate, setPlate] = useState('')
  const [phone, setPhone] = useState('')
  const [selectedAddons, setSelectedAddons] = useState<number[]>([])
  const [showPayment, setShowPayment] = useState(false)
  const [clientSecret, setClientSecret] = useState('')

  const toggleAddon = (id: number) => {
    setSelectedAddons(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
    )
  }

  const addonTotal = addons.filter(a => selectedAddons.includes(a.id)).reduce((sum, a) => sum + a.price, 0)
  const total = service.price + addonTotal
  const canProceed = firstName.trim() && lastName.trim() && email.trim() && plate.trim() && phone.trim()

  const handleProceedToPayment = async () => {
    if (!canProceed) return
    const res = await fetch('/api/payments/create-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: total, serviceId, locationId: '1' }),
    })
    const { clientSecret: secret } = await res.json()
    setClientSecret(secret)
    setShowPayment(true)
  }

  return (
    <main className="min-h-screen bg-white max-w-md mx-auto pb-32">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
        <button onClick={() => router.back()} className="text-gray-400"><ArrowLeft size={18} /></button>
        <span className="text-sm font-medium text-gray-900">Ολοκλήρωση κράτησης</span>
      </div>

      <section className="px-5 py-4 border-b border-gray-100">
        <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-gray-900">Avin Γλυφάδα · {service.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{formattedDate} · {slotTime}</p>
          </div>
          <p className="text-sm font-semibold text-gray-900">€{service.price}</p>
        </div>
      </section>

      <section className="px-5 py-4 border-b border-gray-100">
        <p className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-3">Στοιχεία</p>
        <div className="flex gap-2 mb-2">
          <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Όνομα"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400" />
          <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Επώνυμο"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400" />
        </div>
        <div className="flex gap-2 mb-2">
          <input type="text" value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} placeholder="Πινακίδα"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400" />
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Τηλέφωνο"
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400" />
        </div>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email για επιβεβαίωση"
          className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400" />
      </section>

      <section className="px-5 py-4 border-b border-gray-100">
        <p className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-3">Πρόσθετες υπηρεσίες</p>
        <div className="flex flex-col gap-2">
          {addons.map(addon => {
            const selected = selectedAddons.includes(addon.id)
            return (
              <button key={addon.id} onClick={() => toggleAddon(addon.id)}
                className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-all ${selected ? 'border-gray-900 bg-gray-900' : 'border-gray-100 bg-white'}`}>
                <span className={`text-sm ${selected ? 'text-white' : 'text-gray-900'}`}>{addon.name}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${selected ? 'text-white' : 'text-gray-900'}`}>+€{addon.price}</span>
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selected ? 'border-white' : 'border-gray-300'}`}>
                    {selected ? <Minus size={10} className="text-white" /> : <Plus size={10} className="text-gray-400" />}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <section className="px-5 py-4 border-b border-gray-100">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-gray-400">Βασική υπηρεσία</span>
          <span className="text-xs text-gray-700">€{service.price}</span>
        </div>
        {selectedAddons.length > 0 && (
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-gray-400">Πρόσθετες υπηρεσίες</span>
            <span className="text-xs text-gray-700">€{addonTotal}</span>
          </div>
        )}
        <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
          <span className="text-sm font-semibold text-gray-900">Σύνολο</span>
          <span className="text-base font-bold text-gray-900">€{total}</span>
        </div>
      </section>

      {showPayment && clientSecret ? (
        <Elements stripe={stripePromise} options={{
          clientSecret,
          locale: 'el',
          appearance: {
            theme: 'stripe',
            variables: { colorPrimary: '#0A0A0A', borderRadius: '12px', fontSizeBase: '14px' }
          }
        }}>
          <CheckoutForm
            total={total} email={email} service={service}
            formattedDate={formattedDate} slotTime={slotTime}
            clientSecret={clientSecret} firstName={firstName}
            lastName={lastName} phone={phone}
          />
        </Elements>
      ) : (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md px-5 py-4 bg-white border-t border-gray-100">
          {!canProceed ? (
            <div className="w-full bg-gray-100 text-gray-400 text-sm font-medium py-3.5 rounded-xl flex items-center justify-center">
              Συμπλήρωσε τα στοιχεία σου
            </div>
          ) : (
            <button onClick={handleProceedToPayment}
              className="w-full bg-gray-900 text-white text-sm font-medium py-3.5 rounded-xl flex items-center justify-center gap-2">
              <CreditCard size={15} />
              Συνέχεια στην πληρωμή — €{total}
            </button>
          )}
        </div>
      )}
    </main>
  )
}

export default function BookingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-xs text-gray-400">Φόρτωση...</p></div>}>
      <BookingPageContent />
    </Suspense>
  )
}