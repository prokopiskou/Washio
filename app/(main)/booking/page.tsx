'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, Lock, Calendar, Sparkles, Mail } from 'lucide-react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { createClient } from '@/lib/supabase/client'
import { mediumTap, errorHaptic } from '@/lib/haptics'
import { track } from '@vercel/analytics'
import { track as trackEvent } from '@/lib/analytics'
import { WashioLoader } from '@/components/WashioLoader'
import { useT, useLocale, Locale } from '@/lib/i18n'
import { athensToday } from '@/lib/time'
import { SERVICE_FEE_EUR } from '@/lib/pricing'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const MONTHS_SHORT: Record<Locale, string[]> = {
  el: ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}
const WEEKDAYS: Record<Locale, string[]> = {
  el: ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
}

const T = {
  el: {
    paymentSystemNotReady: 'Το σύστημα πληρωμών δεν είναι έτοιμο. Δοκίμασε ξανά.',
    verifyError: 'Σφάλμα επαλήθευσης.', paymentFailed: 'Η πληρωμή απέτυχε.',
    unknownError: 'Άγνωστο σφάλμα. Δοκίμασε ξανά.',
    payment: 'Πληρωμή', paymentNotLoaded: 'Το σύστημα πληρωμών δεν φόρτωσε',
    paymentNotLoadedHint: 'Έλεγξε τη σύνδεσή σου και απενεργοποίησε τυχόν ad-blocker, VPN ή «Private DNS». Αν συνεχίζει, δοκίμασε σε κανονικό Chrome.',
    tryAgain: 'Δοκίμασε ξανά', processing: 'Επεξεργασία...', pay: 'Πληρωμή',
    securePayment: 'Ασφαλής πληρωμή μέσω Stripe',
    couldNotStartPayment: 'Δεν ήταν δυνατή η έναρξη πληρωμής. Δοκίμασε ξανά.',
    couldNotBook: 'Δεν ήταν δυνατή η κράτηση. Δοκίμασε ξανά.',
    somethingWrong: 'Κάτι πήγε στραβά. Δοκίμασε ξανά.',
    loading: 'Φόρτωση...', serviceNotFound: 'Δεν βρέθηκε υπηρεσία.',
    confirm: 'Επιβεβαίωση',
    noMoto: 'Δεν έχεις μοτοσικλέτα καταχωρημένη', noCar: 'Δεν έχεις ΙΧ καταχωρημένο',
    addPlateBelow: 'Πρόσθεσε την πινακίδα παρακάτω για να συνεχίσεις την κράτηση.',
    plate: 'Πινακίδα', newVehicle: '+ Νέο όχημα',
    serviceForA: 'Η υπηρεσία είναι για', vehicleWillBeSavedAs: '. Το όχημα που θα προσθέσεις θα καταχωρηθεί ως',
    plateExampleMoto: 'π.χ. ΑΒ-1234', plateExampleCar: 'π.χ. ΑΒΓ-1234',
    backToMyVehicles: '← Επιστροφή στα οχήματά μου',
    phone: 'Τηλέφωνο', addons: 'Πρόσθετες υπηρεσίες', addonsShort: 'Πρόσθετα', total: 'Σύνολο', serviceFee: 'Τέλος υπηρεσίας', coupon: 'Κουπόνι',
    freeCancel: 'Δωρεάν ακύρωση έως 2 ώρες πριν το ραντεβού.',
    or: 'ή', confirming: 'Επιβεβαίωση...', payCash: 'Πληρωμή με μετρητά στο κατάστημα',
    cashHint: 'Κλείνεις τώρα, πληρώνεις στο κατάστημα κατά την επίσκεψη.',
    fillPlatePhone: 'Συμπλήρωσε πινακίδα και τηλέφωνο',
  },
  en: {
    paymentSystemNotReady: 'The payment system is not ready. Please try again.',
    verifyError: 'Verification error.', paymentFailed: 'Payment failed.',
    unknownError: 'Unknown error. Please try again.',
    payment: 'Payment', paymentNotLoaded: 'The payment system did not load',
    paymentNotLoadedHint: 'Check your connection and disable any ad-blocker, VPN or "Private DNS". If it persists, try in regular Chrome.',
    tryAgain: 'Try again', processing: 'Processing...', pay: 'Pay',
    securePayment: 'Secure payment via Stripe',
    couldNotStartPayment: 'Could not start the payment. Please try again.',
    couldNotBook: 'Could not complete the booking. Please try again.',
    somethingWrong: 'Something went wrong. Please try again.',
    loading: 'Loading...', serviceNotFound: 'Service not found.',
    confirm: 'Confirmation',
    noMoto: 'You have no motorcycle registered', noCar: 'You have no car registered',
    addPlateBelow: 'Add the plate below to continue with your booking.',
    plate: 'Plate', newVehicle: '+ New vehicle',
    serviceForA: 'This service is for', vehicleWillBeSavedAs: '. The vehicle you add will be saved as',
    plateExampleMoto: 'e.g. AB-1234', plateExampleCar: 'e.g. ABC-1234',
    backToMyVehicles: '← Back to my vehicles',
    phone: 'Phone', addons: 'Add-on services', addonsShort: 'Add-ons', total: 'Total', serviceFee: 'Service fee', coupon: 'Coupon',
    freeCancel: 'Free cancellation up to 2 hours before your appointment.',
    or: 'or', confirming: 'Confirming...', payCash: 'Pay with cash at the store',
    cashHint: 'Book now, pay at the store during your visit.',
    fillPlatePhone: 'Fill in plate and phone',
  },
}

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
  price_moto?: number
  duration_minutes: number
  display_duration_minutes?: number | null
}

type Location = {
  id: string
  name: string
  address?: string
  city?: string
}

function MapThumb() {
  return (
    <div
      className="w-[52px] h-[52px] rounded-[10px] overflow-hidden relative shrink-0 border border-gray-100"
      style={{ background: '#EEF0F2' }}
    >
      <svg width="52" height="52" viewBox="0 0 52 52">
        <rect width="52" height="52" fill="#EEF0F2"/>
        <path d="M0 18 L52 22 M0 38 L52 36 M22 0 L24 52" stroke="#fff" strokeWidth="4"/>
        <rect x="6" y="6" width="14" height="10" fill="#F4F5F6" stroke="#E4E6E8"/>
        <rect x="28" y="6" width="18" height="10" fill="#F4F5F6" stroke="#E4E6E8"/>
        <rect x="6" y="28" width="14" height="6" fill="#F4F5F6" stroke="#E4E6E8"/>
        <rect x="6" y="40" width="40" height="10" fill="#DEE6EC"/>
        <circle cx="26" cy="28" r="4" fill="#0A0A0A"/>
      </svg>
    </div>
  )
}

function CheckoutForm({ total, baseTotal, appliedCredit, email, phone, service, formattedDate, slotTime, clientSecret, plate, bookingRef }: {
  total: number
  baseTotal: number
  appliedCredit: number
  email: string
  phone: string
  service: { name: string; price: number }
  formattedDate: string
  slotTime: string
  clientSecret: string
  plate: string
  bookingRef: string
}) {
  const t = useT(T)
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stripeFailed, setStripeFailed] = useState(false)

  useEffect(() => {
    if (stripe) { setStripeFailed(false); return }
    const t = setTimeout(() => setStripeFailed(true), 8000)
    return () => clearTimeout(t)
  }, [stripe])

  const handleSubmit = async () => {
    if (!stripe || !elements || !clientSecret) {
      setError(t.paymentSystemNotReady)
      errorHaptic()
      return
    }
    mediumTap()
    setLoading(true)
    setError('')
    try {
      // DEFERRED flow (το Element δημιουργείται με mode/amount, ΧΩΡΙΣ clientSecret):
      // ΠΡΩΤΑ elements.submit() (μαζεύει/validάρει την κάρτα), ΜΕΤΑ confirmPayment
      // με το clientSecret του server. Χωρίς το submit → IntegrationError.
      const { error: submitError } = await elements.submit()
      if (submitError) {
        setError(submitError.message || t.paymentFailed)
        errorHaptic()
        return
      }
      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/booking/confirmed?ref=${encodeURIComponent(bookingRef)}&email=${encodeURIComponent(email)}&date=${encodeURIComponent(formattedDate)}&time=${encodeURIComponent(slotTime)}&service=${encodeURIComponent(service.name)}&plate=${encodeURIComponent(plate)}&total=${encodeURIComponent(total.toString())}`,
          // Κρύβουμε τα billing πεδία στο Element (fields: 'never') → ΠΡΕΠΕΙ να τα
          // περάσουμε εδώ, αλλιώς το Stripe πετάει σφάλμα. Δεν εμφανίζεται τίποτα
          // επιπλέον στη φόρμα.
          payment_method_data: {
            billing_details: {
              name: email || 'Washio',
              email: email || undefined,
              phone: phone || undefined,
              // Η διεύθυνση/ΤΚ μαζεύεται από το Element — δεν την περνάμε εδώ.
            },
          },
        },
      })
      if (confirmError) {
        setError(confirmError.message || t.paymentFailed)
        errorHaptic()
      }
    } catch (e) {
      // Δείξε το πραγματικό μήνυμα (βοηθά στο debug WebView) αντί για γενικό.
      const msg = e instanceof Error ? e.message : ''
      setError(msg ? `${t.unknownError} (${msg})` : t.unknownError)
      errorHaptic()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="px-5">
      <p className="text-[11px] font-semibold text-gray-400 tracking-[1.8px] uppercase mb-2">
        {t.payment}
      </p>
      <div className="bg-white border border-gray-200 rounded-xl p-3.5 mb-4">
        <PaymentElement options={{
          layout: 'tabs',
          wallets: { applePay: 'auto', googlePay: 'auto' },
          // Ελάχιστη φόρμα: κρύβουμε ΟΛΑ τα billing πεδία (όνομα/email/τηλέφωνο/διεύθυνση)
          // που πρόσθετε το Stripe κάτω από το «αποθήκευση στοιχείων». Μένει κάρτα + tick.
          fields: {
            billingDetails: {
              name: 'never',
              email: 'never',
              phone: 'never',
              // Τη διεύθυνση την μαζεύει το ίδιο το Element (για κάρτα = μόνο
              // ένα μικρό πεδίο ΤΚ). Αν βάζαμε 'never' θα έπρεπε να περνάμε
              // ΚΑΘΕ subfield (postal_code/line1/city…) — ατέλειωτο loop.
            },
          },
        }} />
      </div>

      {stripeFailed && !stripe && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mb-3">
          <p className="text-[13px] font-semibold text-amber-900">{t.paymentNotLoaded}</p>
          <p className="text-[12px] text-amber-800 mt-1 leading-snug">
            {t.paymentNotLoadedHint}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 text-[12px] font-semibold text-amber-900 underline"
          >
            {t.tryAgain}
          </button>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 mb-3">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* Ανάλυση χρέωσης κάρτας — διαφανές τέλος υπηρεσίας */}
      <div className="rounded-xl bg-gray-50 px-3.5 py-2.5 mb-3">
        <div className="flex justify-between items-center text-[12px] text-gray-500">
          <span>{service.name}</span>
          <span>€{baseTotal.toFixed(2)}</span>
        </div>
        {appliedCredit > 0 && (
          <div className="flex justify-between items-center text-[12px] font-medium text-green-600 mt-1">
            <span>{t.coupon}</span>
            <span>−€{appliedCredit.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between items-center text-[12px] text-gray-500 mt-1">
          <span>{t.serviceFee}</span>
          <span>€{SERVICE_FEE_EUR.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center text-[13px] font-semibold text-gray-900 mt-1.5 pt-1.5 border-t border-gray-200">
          <span>{t.total}</span>
          <span>€{total.toFixed(2)}</span>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading || !stripe}
        className="w-full h-14 rounded-xl bg-gray-900 text-white text-[15px] font-semibold tracking-tight flex items-center justify-center gap-2 disabled:opacity-40"
      >
        {loading ? (
          t.processing
        ) : (
          <>
            <span>{t.pay}</span>
            <span className="w-px h-4 bg-white/25" />
            <span>€{total.toFixed(2)}</span>
          </>
        )}
      </button>

      <div className="flex items-center justify-center gap-1.5 mt-3">
        <Lock size={12} className="text-gray-400" strokeWidth={1.6} />
        <p className="text-[11px] font-medium text-gray-400 tracking-tight">
          {t.securePayment}
        </p>
      </div>
    </div>
  )
}

function BookingPageContent() {
  const router = useRouter()
  const t = useT(T)
  const { locale } = useLocale()
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
  const [customerSessionClientSecret, setCustomerSessionClientSecret] = useState<string | undefined>(undefined)
  const [appliedCredit, setAppliedCredit] = useState(0)
  const [bookingRef, setBookingRef] = useState('')
  const [cashLoading, setCashLoading] = useState(false)
  const paymentAnchorRef = useRef<HTMLDivElement>(null)

  // Με το που εμφανίζεται το payment (πρώτο tap), κατεβάζουμε την οθόνη στο σημείο της κάρτας.
  useEffect(() => {
    if (showPayment && clientSecret) {
      const id = setTimeout(() => {
        paymentAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 350)
      return () => clearTimeout(id)
    }
  }, [showPayment, clientSecret])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('')
  const [vehicleFormType, setVehicleFormType] = useState('ΙΧ')
  const [servicePrice, setServicePrice] = useState(0)

  const serviceId = params.get('service') || ''
  const locationId = params.get('location') || ''
  const dateStr = params.get('date') || athensToday()
  const slotTime = decodeURIComponent(params.get('slot') || '09:00')
  const vehicleType = decodeURIComponent(params.get('vehicleType') || 'ΙΧ')

  const date = new Date(dateStr)
  const formattedDate = `${date.getDate()} ${MONTHS_SHORT[locale][date.getMonth()]}`
  const fullFormattedDate = `${WEEKDAYS[locale][date.getDay()]}, ${date.getDate()} ${MONTHS_SHORT[locale][date.getMonth()]}`

  // ── PREFETCH PaymentIntent ──────────────────────────────────────────
  // Το intent στήνεται στο ΠΑΡΑΣΚΗΝΙΟ μόλις σταθεροποιηθούν οι επιλογές,
  // ώστε το «Πληρωμή» να ανοίγει το Stripe σχεδόν ακαριαία.
  const intentCacheRef = useRef<{
    key: string
    promise: Promise<{ clientSecret?: string; customerSessionClientSecret?: string; error?: string }>
  } | null>(null)

  type IntentResult = { clientSecret?: string; customerSessionClientSecret?: string; bookingRef?: string; appliedCredit?: number; error?: string }

  const fetchIntent = (serviceArg: Service, plateArg: string, addonsArg: string[]): Promise<IntentResult> => {
    const key = JSON.stringify([serviceArg.id, locationId, dateStr, slotTime, plateArg, vehicleType, [...addonsArg].sort()])
    if (intentCacheRef.current?.key === key) return intentCacheRef.current.promise
    const promise: Promise<IntentResult> = fetch('/api/payments/create-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceId: serviceArg.id,
        locationId,
        slotId: null,
        slotDate: dateStr,
        slotStartTime: slotTime,
        carPlate: plateArg,
        serviceName: serviceArg.name,
        vehicleType,
        addonIds: addonsArg,
      }),
    })
      .then(async res => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.clientSecret) {
          // Μην κρατάς αποτυχία στο cache — το επόμενο κάλεσμα ξαναδοκιμάζει.
          if (intentCacheRef.current?.key === key) intentCacheRef.current = null
          return { error: data.error || 'Αποτυχία εκκίνησης πληρωμής' }
        }
        return data as IntentResult
      })
      .catch(() => {
        if (intentCacheRef.current?.key === key) intentCacheRef.current = null
        return { error: 'Πρόβλημα σύνδεσης' }
      })
    intentCacheRef.current = { key, promise }
    return promise
  }

  // Αν αλλάξουν addons ΕΝΩ φαίνεται η πληρωμή, το intent έχει παλιό ποσό →
  // κλείσε την πληρωμή ώστε να ξαναπατήσει «Πληρωμή» με σωστό ποσό.
  // (Πριν: εμφανιζόμενο σύνολο ≠ πραγματική χρέωση.)
  useEffect(() => {
    if (!showPayment) return
    setShowPayment(false)
    setClientSecret('')
    intentCacheRef.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAddons])

  // Prefetch ΜΟΝΟ όταν αλλάζει κάτι που επηρεάζει το ποσό (υπηρεσία, addons).
  // Η πινακίδα δεν αλλάζει το ποσό — πριν, κάθε παύση στην πληκτρολόγηση
  // δημιουργούσε ΝΕΟ PaymentIntent (ορφανά στο Stripe, γραμμές checkout_attempts).
  // Στο «Πληρωμή» ζητείται intent με την τελική πινακίδα (το πολύ 1 επιπλέον).
  useEffect(() => {
    if (!service || sessionLoading || showPayment) return
    const t = setTimeout(() => { fetchIntent(service, plate, selectedAddons) }, 800)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, selectedAddons, sessionLoading, showPayment])
  // ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user

      if (!user) {
        router.replace(`/login?redirect=${encodeURIComponent(window.location.href)}`)
        return
      }

      track('checkout_started')
      // Άφιξη στο booking = πρόθεση κράτησης (book intent).
      trackEvent('AddToCart', { content_type: 'wash', content_ids: [locationId || serviceId] })

      if (serviceId) {
        const { data: serviceData } = await supabase
          .from('services').select('id, name, price, price_moto, price_suv, duration_minutes, display_duration_minutes')
          .eq('id', serviceId).single()
        if (serviceData) {
          setService(serviceData)
          const price = vehicleType === 'Μοτοσικλέτα' && serviceData.price_moto
            ? serviceData.price_moto
            : vehicleType === 'SUV' && serviceData.price_suv
            ? serviceData.price_suv
            : serviceData.price
          setServicePrice(price)
        }
      }

      if (locationId) {
        const { data: locationData } = await supabase
          .from('locations').select('id, name, address, city').eq('id', locationId).single()
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

      if (user.email) setEmail(user.email)

      const { data: profileData } = await supabase
        .from('profiles').select('phone').eq('id', user.id).single()
      if (profileData?.phone) setPhone(profileData.phone)
      else if (user.user_metadata?.phone) setPhone(user.user_metadata.phone as string)

      const { data: vehiclesData } = await supabase
        .from('vehicles').select('id, plate, type')
        .eq('user_id', user.id).order('created_at', { ascending: false })

      const vList = (vehiclesData as Vehicle[]) || []
      const filteredVehicles = vList.filter(v => {
        if (vehicleType === 'Μοτοσικλέτα') return v.type === 'Μοτοσικλέτα'
        // For ΙΧ booking: only show ΙΧ vehicles (not Motorcycles, not legacy SUV/Truck)
        return v.type === 'ΙΧ'
      })
      setVehicles(filteredVehicles)

      if (filteredVehicles.length > 0) {
        const matchingVehicle = filteredVehicles.find(v => v.type === vehicleType) || filteredVehicles[0]
        setSelectedVehicleId(matchingVehicle.id)
        setPlate(matchingVehicle.plate)
        setVehicleFormType(matchingVehicle.type as 'ΙΧ' | 'Μοτοσικλέτα')
      } else {
        setSelectedVehicleId('new')
        setVehicleFormType(vehicleType)
      }

      setSessionLoading(false)
    }
    loadData()
  }, [])

  const toggleAddon = (id: string) => {
    setSelectedAddons(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id])
  }

  const addonTotal = addons.filter(a => selectedAddons.includes(a.id)).reduce((sum, a) => sum + a.price, 0)
  const total = servicePrice + addonTotal
  // Χρέωση κάρτας = (τιμή − κουπόνι) + τέλος υπηρεσίας (μόνο κάρτα). Τα μετρητά
  // πληρώνουν την καθαρή τιμή στο κατάστημα. Το appliedCredit το γυρίζει το
  // create-intent (ισχύει μόνο σε Μέσα-Έξω ≥12€) — 0 μέχρι να απαντήσει.
  const cardTotal = Math.max(0, total - appliedCredit) + SERVICE_FEE_EUR
  const canProceed = phone.trim() && email.trim() && service && (
    selectedVehicleId !== 'new' ? true : plate.trim().length > 0
  )

  const handleProceedToPayment = async () => {
    if (!canProceed || !service) return
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (selectedVehicleId === 'new' && plate.trim()) {
      const existing = vehicles.find(v => v.plate === plate.trim())
      if (!existing) {
        await supabase.from('vehicles').insert({
          user_id: session?.user?.id,
          plate: plate.trim(),
          type: vehicleFormType,
        })
      }
    }

    if (phone.trim() && session?.user?.id) {
      await supabase.from('profiles').update({ phone: phone.trim() }).eq('id', session.user.id)
    }

    // Χρησιμοποίησε το ΗΔΗ προετοιμασμένο intent (prefetch) — αλλιώς φτιάξ' το τώρα.
    let data = await fetchIntent(service, plate, selectedAddons)
    if (data.error) {
      // Δεύτερη προσπάθεια με φρέσκο intent (π.χ. αν το πρώτο έπεσε σε στιγμιαίο σφάλμα).
      intentCacheRef.current = null
      data = await fetchIntent(service, plate, selectedAddons)
    }
    if (data.error || !data.clientSecret) {
      errorHaptic()
      alert(data.error || t.couldNotStartPayment)
      return
    }
    setClientSecret(data.clientSecret)
    setCustomerSessionClientSecret(data.customerSessionClientSecret)
    setAppliedCredit(Number(data.appliedCredit) || 0)
    setBookingRef(data.bookingRef || '')
    setShowPayment(true)
    // Έφτασε στην οθόνη πληρωμής (κάρτα).
    trackEvent('InitiateCheckout', { value: total, currency: 'EUR', content_ids: [locationId || serviceId] })
  }

  const handleCashBooking = async () => {
    if (!service || cashLoading) return
    mediumTap()
    setCashLoading(true)
    try {
      const res = await fetch('/api/bookings/create-cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: service.id,
          locationId,
          slotId: null,
          slotDate: dateStr,
          slotStartTime: slotTime,
          carPlate: plate,
          serviceName: service.name,
          vehicleType,
          addonIds: selectedAddons,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.bookingRef) {
        errorHaptic()
        alert(data.error || t.couldNotBook)
        setCashLoading(false)
        return
      }
      const q = new URLSearchParams({
        email, date: formattedDate, time: slotTime, service: service.name,
        plate, total: total.toString(), ref: data.bookingRef, method: 'cash',
      })
      router.push(`/booking/confirmed?${q.toString()}`)
    } catch {
      errorHaptic()
      alert(t.somethingWrong)
      setCashLoading(false)
    }
  }

  const handleVehicleChange = (value: string) => {
    setSelectedVehicleId(value)
    if (value === 'new') {
      setPlate('')
      setVehicleFormType(vehicleType)
    } else {
      const v = vehicles.find(v => v.id === value)
      setPlate(v?.plate || '')
      setVehicleFormType(v?.type || vehicleType)
    }
  }

  if (sessionLoading) {
    return <main className="min-h-screen bg-gray-50 flex items-center justify-center"><WashioLoader /></main>
  }

  if (!service) {
    return <main className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-xs text-gray-400">{t.serviceNotFound}</p></main>
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center">
      <div className="w-full max-w-md md:max-w-4xl pb-32 bg-gray-50">

        {/* Header */}
        <div className="px-5 pt-[calc(var(--safe-top)+14px)] pb-4 flex items-center gap-3.5 bg-gray-50">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-white border border-gray-100 flex items-center justify-center text-gray-900"
          >
            <ChevronLeft size={18} />
          </button>
          <h1 className="text-[18px] font-semibold tracking-tight text-gray-900">{t.confirm}</h1>
        </div>

        <div className="px-5 pb-5 md:flex md:gap-6 md:items-start">

          {/* LEFT (desktop): σύνοψη κράτησης */}
          <div className="mb-5 md:mb-0 md:w-[340px] md:shrink-0 md:sticky md:top-6">
          {/* Summary card */}
          <div
            className="bg-white rounded-2xl p-4 border border-gray-100"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <div className="flex gap-3.5 items-start">
              <MapThumb />
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold tracking-tight text-gray-900">{location?.name}</p>
                {location?.address && (
                  <p className="text-xs text-gray-500 mt-0.5">{location.address}{location.city ? `, ${location.city}` : ''}</p>
                )}
              </div>
            </div>

            <div className="h-px bg-gray-100 my-3.5" />

            <div className="flex flex-col gap-2.5">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Calendar size={14} className="text-gray-500" />
                  <span className="text-[13px] text-gray-500">{fullFormattedDate}</span>
                </div>
                <span className="text-[13px] font-medium text-gray-900">{slotTime}</span>
              </div>
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Sparkles size={14} className="text-gray-500" />
                  <span className="text-[13px] text-gray-500">{service.name} · {vehicleType}</span>
                </div>
                {/* Ενημερωτική διάρκεια που δήλωσε ο πλυντηριάς· fallback στη διάρκεια slot. */}
                <span className="text-[13px] font-medium text-gray-900">
                  ~{service.display_duration_minutes && service.display_duration_minutes > 0 ? service.display_duration_minutes : service.duration_minutes}′
                </span>
              </div>
            </div>
          </div>
          </div>

          {/* RIGHT (desktop): φόρμα κράτησης */}
          <div className="flex flex-col gap-5 md:flex-1">

          {/* No matching vehicle warning */}
          {vehicles.length === 0 && selectedVehicleId === 'new' && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3.5 flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-amber-900">
                  {vehicleType === 'Μοτοσικλέτα' ? t.noMoto : t.noCar}
                </p>
                <p className="text-[12px] text-amber-800 mt-0.5 leading-snug">
                  {t.addPlateBelow}
                </p>
              </div>
            </div>
          )}

          {/* Vehicle */}
          <div>
            <p className="text-[11px] font-semibold text-gray-400 tracking-[1.8px] uppercase mb-2">
              {t.plate}
            </p>

            {vehicles.length > 0 && selectedVehicleId !== 'new' ? (
              <div className="bg-white rounded-xl h-[52px] border border-gray-200 px-4 flex items-center justify-between">
                <span className="text-[15px] font-semibold text-gray-900 font-mono tracking-wider">
                  {plate}
                </span>
                <select
                  value={selectedVehicleId}
                  onChange={e => handleVehicleChange(e.target.value)}
                  className="text-[12px] font-medium text-blue-600 bg-transparent focus:outline-none"
                >
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.plate} · {v.type}</option>
                  ))}
                  <option value="new">{t.newVehicle}</option>
                </select>
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* Locked vehicle type info */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                  <p className="text-[12px] text-blue-900 leading-snug">
                    {t.serviceForA} <strong>{vehicleType}</strong>{t.vehicleWillBeSavedAs} {vehicleType}.
                  </p>
                </div>

                <input
                  type="text"
                  value={plate}
                  onChange={e => setPlate(e.target.value.toUpperCase())}
                  placeholder={vehicleType === 'Μοτοσικλέτα' ? t.plateExampleMoto : t.plateExampleCar}
                  className="w-full bg-white border border-gray-200 rounded-xl h-[52px] px-4 text-[15px] font-mono tracking-wider text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                />

                {vehicles.length > 0 && (
                  <button
                    onClick={() => handleVehicleChange(vehicles[0].id)}
                    className="text-xs text-blue-600 font-medium"
                  >
                    {t.backToMyVehicles}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Email */}
          <div>
            <p className="text-[11px] font-semibold text-gray-400 tracking-[1.8px] uppercase mb-2">
              Email
            </p>
            <div className="bg-white rounded-xl h-[52px] border border-gray-200 px-4 flex items-center gap-2.5">
              <Mail size={16} className="text-gray-500" />
              <span className="text-[15px] text-gray-900">{email}</span>
            </div>
          </div>

          {/* Phone */}
          <div>
            <p className="text-[11px] font-semibold text-gray-400 tracking-[1.8px] uppercase mb-2">
              {t.phone}
            </p>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="69x xxx xxxx"
              className="w-full bg-white border border-gray-200 rounded-xl h-[52px] px-4 text-[15px] text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
            />
          </div>

          {/* Addons */}
          {addons.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 tracking-[1.8px] uppercase mb-2">
                {t.addons}
              </p>
              <div className="flex flex-col gap-2">
                {addons.map(addon => {
                  const selected = selectedAddons.includes(addon.id)
                  return (
                    <button
                      key={addon.id}
                      onClick={() => toggleAddon(addon.id)}
                      className={`flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all text-left ${
                        selected ? 'border-gray-900 bg-gray-900' : 'border-gray-200 bg-white'
                      }`}
                    >
                      <span className={`text-[14px] font-medium ${selected ? 'text-white' : 'text-gray-900'}`}>{addon.name}</span>
                      <span className={`text-[14px] font-semibold ${selected ? 'text-white' : 'text-gray-900'}`}>
                        {selected ? '−' : '+'} €{addon.price}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Total breakdown */}
          <div
            className="bg-white rounded-2xl border border-gray-100 px-4"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          >
            <div className="flex justify-between items-center py-3 border-b border-gray-100">
              <span className="text-[13px] text-gray-500">{service.name}</span>
              <span className="text-[14px] font-medium text-gray-900">€{servicePrice.toFixed(2)}</span>
            </div>
            {selectedAddons.length > 0 && (
              <div className="flex justify-between items-center py-3 border-b border-gray-100">
                <span className="text-[13px] text-gray-500">{t.addonsShort}</span>
                <span className="text-[14px] font-medium text-gray-900">€{addonTotal.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center py-3.5">
              <span className="text-[15px] font-semibold text-gray-900">{t.total}</span>
              <span className="text-[20px] font-bold tracking-tight text-gray-900">€{total.toFixed(2)}</span>
            </div>
          </div>

          <p className="text-[11px] text-gray-400 text-center">
            {t.freeCancel}
          </p>
          </div>
        </div>

        {/* Payment */}
        {showPayment && clientSecret ? (
          <>
          <div ref={paymentAnchorRef} className="scroll-mt-4" />
          <Elements stripe={stripePromise} options={{
            // DEFERRED: mode/amount/currency ΑΝΤΙ για clientSecret. Το clientSecret
            // δίνεται μόνο στο confirmPayment. (Το hybrid clientSecret+submit έσκαγε.)
            mode: 'payment',
            amount: Math.round(cardTotal * 100),
            currency: 'eur',
            paymentMethodTypes: ['card'], // ίδιο με το PaymentIntent (κάρτα + wallets)
            ...(customerSessionClientSecret ? { customerSessionClientSecret } : {}),
            locale,
            appearance: {
              theme: 'stripe',
              // 16px: κάτω από αυτό το iOS Safari/WebView κάνει auto-zoom στο
              // πεδίο κάρτας (και το user-scalable=no αγνοείται) → κολλάει zoomed.
              variables: { colorPrimary: '#0A0A0A', borderRadius: '12px', fontSizeBase: '16px' }
            }
          }}>
            <CheckoutForm
              total={cardTotal} baseTotal={total} appliedCredit={appliedCredit} email={email} phone={phone} service={service}
              formattedDate={formattedDate} slotTime={slotTime}
              clientSecret={clientSecret} plate={plate} bookingRef={bookingRef}
            />
          </Elements>

          {/* Δευτερεύουσα επιλογή: μετρητά στο κατάστημα (διακριτική) */}
          <div className="px-5 mt-4 mb-2">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-[11px] text-gray-300">{t.or}</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
            <button
              onClick={handleCashBooking}
              disabled={cashLoading}
              className="w-full h-11 rounded-xl border border-gray-200 bg-white text-[13px] font-medium text-gray-500 flex items-center justify-center gap-2 disabled:opacity-40"
            >
              {cashLoading ? t.confirming : t.payCash}
            </button>
            <p className="text-[10px] text-gray-400 text-center mt-2 leading-snug">
              {t.cashHint}
            </p>
          </div>
          </>
        ) : (
          <div
            className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md px-5 pt-3.5 pb-8"
            style={{
              background: 'linear-gradient(180deg, rgba(249,250,251,0) 0%, #F9FAFB 28%)',
              paddingBottom: 'calc(env(safe-area-inset-bottom) + 28px)',
            }}
          >
            {!canProceed ? (
              <div className="w-full h-14 bg-gray-100 text-gray-400 text-[14px] font-medium rounded-xl flex items-center justify-center">
                {t.fillPlatePhone}
              </div>
            ) : (
              <button
                onClick={handleProceedToPayment}
                className="w-full h-14 rounded-xl bg-gray-900 text-white text-[15px] font-semibold tracking-tight flex items-center justify-center gap-2"
              >
                <span>{t.pay}</span>
                <span className="w-px h-4 bg-white/25" />
                <span>€{total}</span>
              </button>
            )}
            <div className="flex items-center justify-center gap-1.5 mt-3">
              <Lock size={12} className="text-gray-400" strokeWidth={1.6} />
              <p className="text-[11px] font-medium text-gray-400">
                {t.securePayment}
              </p>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}

export default function BookingPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-gray-50 flex items-center justify-center"><WashioLoader /></main>}>
      <BookingPageContent />
    </Suspense>
  )
}