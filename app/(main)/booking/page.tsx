'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, CreditCard, Plus, Minus, Shield } from 'lucide-react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { createClient } from '@/lib/supabase/client'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const MONTHS_SHORT = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']

type Addon = {
  id: string
  name: string
  price: number
}

type Vehicle = {
  id: string
  plate: string
  type: string
}

type Service = {
  id: string
  name: string
  price: number
  duration_minutes: number
}

type Location = {
  id: string
  name: string
}

function CheckoutForm({ total, email, service, formattedDate, slotTime, clientSecret, plate }: {
  total: number
  email: string
  service: { name: string; price: number }
  formattedDate: string
  slotTime: string
  clientSecret: string
  plate: string
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
          return_url: `${window.location.origin}/booking/confirmed?email=${encodeURIComponent(email)}&date=${encodeURIComponent(formattedDate)}&time=${encodeURIComponent(slotTime)}&service=${encodeURIComponent(service.name)}&plate=${encodeURIComponent(plate)}&total=${encodeURIComponent(total.toString())}`,
        },
      })
      if (confirmError) {
        setError(confirmError.message || 'Η πληρωμή απέτυχε.')
      }
    } catch {
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
  const [sessionLoading, setSessionLoading] = useState(true)
  const [service, setService] = useState<Service | null>(null)
  const [location, setLocation] = useState<Location | null>(null)
  const [addons, setAddons] = useState<Addon[]>([])
  const [email, setEmail] = useState('')
  const [plate, setPlate] = useState('')
  const [phone, setPhone] = useState('')
  const [selectedAddons, setSelectedAddons] = useState<string[]>([])
  const [showPayment, setShowPayment] = useState(false)
  const [clientSecret, setClientSecret] = useState('')
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('')

  const serviceId = params.get('service') || ''
  const locationId = params.get('location') || ''
  const dateStr = params.get('date') || new Date().toISOString().split('T')[0]
  const slotTime = decodeURIComponent(params.get('slot') || '09:00')

  const date = new Date(dateStr)
  const formattedDate = `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user

      if (!user) {
        router.replace(`/login?redirect=${encodeURIComponent(window.location.href)}`)
        return
      }

      if (serviceId) {
        const { data: serviceData } = await supabase
          .from('services').select('id, name, price, duration_minutes')
          .eq('id', serviceId).single()
        if (serviceData) setService(serviceData)
      }

      if (locationId) {
        const { data: locationData } = await supabase
          .from('locations').select('id, name').eq('id', locationId).single()
        if (locationData) setLocation(locationData)

        const { data: addonsData } = await supabase
          .from('location_addons')
          .select('addon_id, price_override, addons(name, price, sort_order)')
          .eq('location_id', locationId)

        setAddons((addonsData || []).map((a: any) => ({
          id: a.addon_id,
          name: a.addons?.name || '',
          price: a.price_override ?? a.addons?.price ?? 0,
        })).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0)))
      }

      // Email από session
      if (user.email) setEmail(user.email)

      // Τηλέφωνο από profile
      const { data: profileData } = await supabase
        .from('profiles').select('phone').eq('id', user.id).single()
      if (profileData?.phone) setPhone(profileData.phone)
      else if (user.user_metadata?.phone) setPhone(user.user_metadata.phone as string)

      // Οχήματα
      const { data: vehiclesData } = await supabase
        .from('vehicles').select('id, plate, type')
        .eq('user_id', user.id).order('created_at', { ascending: false })

      const vList = (vehiclesData as Vehicle[]) || []
      setVehicles(vList)

      // Προεπιλογή πρώτου οχήματος
      if (vList.length > 0) {
        setSelectedVehicleId(vList[0].id)
        setPlate(vList[0].plate)
      } else {
        setSelectedVehicleId('new')
      }

      setSessionLoading(false)
    }
    loadData()
  }, [])

  const toggleAddon = (id: string) => {
    setSelectedAddons(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id])
  }

  const addonTotal = addons.filter(a => selectedAddons.includes(a.id)).reduce((sum, a) => sum + a.price, 0)
  const total = (service?.price || 0) + addonTotal
  const canProceed = plate.trim() && phone.trim() && email.trim() && service

  const handleProceedToPayment = async () => {
    if (!canProceed || !service) return
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    const res = await fetch('/api/payments/create-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: total,
        serviceId: service.id,
        locationId,
        slotId: null,
        slotDate: dateStr,
        slotStartTime: slotTime,
        carPlate: plate,
        userId: session?.user?.id || '',
      }),
    })
    const { clientSecret: secret } = await res.json()
    setClientSecret(secret)
    setShowPayment(true)
  }

  const handleVehicleChange = (value: string) => {
    setSelectedVehicleId(value)
    if (value === 'new') {
      setPlate('')
    } else {
      const v = vehicles.find(v => v.id === value)
      setPlate(v?.plate || '')
    }
  }

  if (sessionLoading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-xs text-gray-400">Φόρτωση...</p></div>
  }

  if (!service) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-xs text-gray-400">Δεν βρέθηκε υπηρεσία.</p></div>
  }

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md pb-32">

        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <button onClick={() => router.back()} className="text-gray-400"><ArrowLeft size={18} /></button>
          <span className="text-sm font-medium text-gray-900">Ολοκλήρωση κράτησης</span>
        </div>

        {/* Booking summary */}
        <section className="px-5 py-4 border-b border-gray-100">
          <div className="bg-gray-50 rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-900">{location?.name || 'Σημείο'} · {service.name}</p>
              <p className="text-xs text-gray-400 mt-0.5">{formattedDate} · {slotTime}</p>
            </div>
            <p className="text-sm font-semibold text-gray-900">€{service.price}</p>
          </div>
        </section>

        {/* Στοιχεία — μόνο όχημα + τηλέφωνο */}
        <section className="px-5 py-4 border-b border-gray-100">
          <p className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-3">Στοιχεία οχήματος</p>

          {/* Vehicle selector */}
          {vehicles.length > 0 && (
            <select value={selectedVehicleId} onChange={e => handleVehicleChange(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 bg-white focus:outline-none focus:border-gray-400 mb-2">
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.plate} · {v.type}</option>
              ))}
              <option value="new">+ Άλλο όχημα</option>
            </select>
          )}

          {/* Plate — εμφανίζεται πάντα */}
          <input
            type="text"
            value={plate}
            onChange={e => setPlate(e.target.value.toUpperCase())}
            placeholder="Πινακίδα"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400 mb-2"
          />

          {/* Τηλέφωνο */}
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="Τηλέφωνο"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
          />
        </section>

        {/* Addons */}
        {addons.length > 0 && (
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
        )}

        {/* Σύνολο */}
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
          <p className="text-xs text-gray-400 mt-2">Δωρεάν ακύρωση έως 2 ώρες πριν το ραντεβού.</p>
        </section>

        {/* Payment */}
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
              clientSecret={clientSecret} plate={plate}
            />
          </Elements>
        ) : (
          <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md px-5 py-4 bg-white border-t border-gray-100">
            {!canProceed ? (
              <div className="w-full bg-gray-100 text-gray-400 text-sm font-medium py-3.5 rounded-xl flex items-center justify-center">
                Συμπλήρωσε πινακίδα και τηλέφωνο
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

      </div>
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