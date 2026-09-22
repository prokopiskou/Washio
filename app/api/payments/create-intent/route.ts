import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { alertCritical } from '@/lib/alert'
import { checkSlotAvailability } from '@/lib/availability-server'
import { ipFrom } from '@/lib/throttle'
import { SERVICE_FEE_EUR } from '@/lib/pricing'
import { computeRedeemable, isCreditEligible } from '@/lib/referral'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// Service-role client μόνο για server-side reads (τιμές, διαθεσιμότητα) — δεν αγγίζει input χρήστη.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const {
      serviceId, locationId, slotId, slotDate,
      slotStartTime, carPlate: rawPlate, vehicleType, addonIds,
    } = await req.json()
    // Πινακίδα: μόνο γράμματα/αριθμοί/κενό/παύλα, έως 12 χαρακτήρες (μπαίνει σε email/push).
    const carPlate = String(rawPlate || '').toUpperCase().replace(/[^A-ZΑ-Ω0-9 \-]/g, '').slice(0, 12)

    // 1) Authentication — η ταυτότητα ΔΕΝ έρχεται από τον client.
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })
    }

    if (!serviceId || !locationId || !slotDate || !slotStartTime) {
      return NextResponse.json({ error: 'Λείπουν στοιχεία κράτησης' }, { status: 400 })
    }

    // 2+3+4 ΠΑΡΑΛΛΗΛΑ — τιμή, addons, διαθεσιμότητα και Stripe customer
    //    τρέχουν ταυτόχρονα: ο συνολικός χρόνος πέφτει στο πιο αργό κομμάτι
    //    αντί για το άθροισμα όλων.
    const requestedAddonIds: string[] = Array.isArray(addonIds) ? addonIds : []

    // Αποθηκευμένες κάρτες: get-or-create Stripe Customer για τον χρήστη.
    // Αν οτιδήποτε αποτύχει, συνεχίζουμε ΧΩΡΙΣ saved-card features.
    const customerSetup = async (): Promise<{ customerId?: string; customerSessionClientSecret?: string }> => {
      try {
        let customerId: string | undefined
        if (user.email) {
          const existing = await stripe.customers.list({ email: user.email, limit: 100 })
          const match = existing.data.find((c) => c.metadata?.supabaseUserId === user.id)
          customerId = match?.id
        }
        if (!customerId) {
          const created = await stripe.customers.create({
            email: user.email || undefined,
            metadata: { supabaseUserId: user.id },
          })
          customerId = created.id
        }
        const session = await stripe.customerSessions.create({
          customer: customerId,
          components: {
            payment_element: {
              enabled: true,
              features: {
                // Ο επιστρέφων πελάτης ΒΛΕΠΕΙ τις αποθηκευμένες κάρτες του (1-tap).
                payment_method_redisplay: 'enabled',
                // ΚΛΕΙΣΤΟ το interactive save (checkbox + email/τηλέφωνο/όνομα Link) —
                // δημιουργούσε τριβή. Η κάρτα αποθηκεύεται σιωπηλά μέσω
                // setup_future_usage στο PaymentIntent παρακάτω.
                payment_method_save: 'disabled',
                payment_method_remove: 'enabled',
              },
            },
          },
        })
        return { customerId, customerSessionClientSecret: session.client_secret }
      } catch (custErr: unknown) {
        const m = custErr instanceof Error ? custErr.message : 'unknown'
        console.error('Customer/session setup skipped:', m)
        return {}
      }
    }

    const [
      { data: service, error: serviceErr },
      { data: locAddons },
      availability,
      { customerId, customerSessionClientSecret },
    ] = await Promise.all([
      // Υπηρεσία ΤΟΥ πλυντηρίου και ενεργή — όχι id από άλλο πλυντήριο.
      admin.from('services')
        .select('id, name, price, price_moto, price_suv')
        .eq('id', serviceId)
        .eq('location_id', locationId)
        .eq('is_active', true)
        .maybeSingle(),
      requestedAddonIds.length > 0
        ? admin.from('location_addons')
            .select('addon_id, price_override, addons(price)')
            .eq('location_id', locationId)
            .in('addon_id', requestedAddonIds)
        : Promise.resolve({ data: [] as any[] }),
      checkSlotAvailability(admin, { locationId, serviceId, slotDate, slotStartTime }),
      customerSetup(),
    ])

    if (serviceErr || !service) {
      return NextResponse.json({ error: 'Άκυρη υπηρεσία' }, { status: 400 })
    }

    if (!availability.ok) {
      return NextResponse.json({ error: availability.error }, { status: 409 })
    }

    // Τιμή ανά τύπο οχήματος — ΠΑΝΤΑ server-side από τη DB.
    const isMoto = vehicleType === 'Μοτοσικλέτα'
    const isSuv = vehicleType === 'SUV'
    let amount = isMoto && service.price_moto != null ? Number(service.price_moto)
      : isSuv && service.price_suv != null ? Number(service.price_suv)
      : Number(service.price)

    for (const a of locAddons || []) {
      const priceOverride = (a as { price_override: number | null }).price_override
      const basePrice = (a as { addons?: { price?: number } }).addons?.price
      amount += Number(priceOverride ?? basePrice ?? 0)
    }

    if (!(amount > 0)) {
      return NextResponse.json({ error: 'Μη έγκυρο ποσό' }, { status: 400 })
    }

    // Ο κωδικός κράτησης φτιάχνεται ΕΔΩ και μπαίνει στο metadata — ώστε (α) το
    // webhook να τον χρησιμοποιεί (όχι νέο τυχαίο) και (β) η σελίδα επιβεβαίωσης
    // να τον δείχνει ΑΜΕΣΩΣ (ποτέ «-----»).
    const bookingRef = 'WS-' + Math.random().toString(16).slice(2, 10).toUpperCase()

    // Meta signals από τον browser του checkout — μπαίνουν στο PI metadata ώστε
    // το webhook (Purchase CAPI) να τα προωθήσει· χωρίς αυτά το server-side event
    // δεν έχει fbp/fbc/IP και το match quality πέφτει.
    const fbp = req.cookies.get('_fbp')?.value || ''
    const fbc = req.cookies.get('_fbc')?.value || ''
    const clientIp = ipFrom(req) || ''
    const clientUa = (req.headers.get('user-agent') || '').slice(0, 350)

    // Εξαργύρωση πίστωσης wallet (κουπόνια/referral) — ΜΟΝΟ σε κάρτα. Μειώνει τη
    // χρέωση· ο πλυντηριάς παίρνει πλήρη τιμή (booking.total_amount = base) και το
    // credit το απορροφά η πλατφόρμα. Αφαιρείται από το wallet στο webhook (μετά
    // την επιτυχή πληρωμή), όχι εδώ — για να μη χαθεί αν δεν ολοκληρωθεί.
    let appliedCredit = 0
    try {
      // Μόνο σε πλήρες πλύσιμο (Μέσα-Έξω) ≥12€ — αλλιώς κανένα κουπόνι.
      if (isCreditEligible(amount)) {
        const { data: prof } = await admin.from('profiles').select('referral_credit').eq('id', user.id).maybeSingle()
        appliedCredit = computeRedeemable(Number(prof?.referral_credit) || 0, amount)
      }
    } catch { /* χωρίς credit αν αποτύχει */ }

    // Χρέωση κάρτας = (τιμή − πίστωση) + τέλος υπηρεσίας.
    const chargeAmount = (amount - appliedCredit) + SERVICE_FEE_EUR

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(chargeAmount * 100),
      currency: 'eur',
      payment_method_types: ['card'],
      ...(customerId ? { customer: customerId } : {}),
      metadata: {
        bookingRef,
        serviceId: serviceId || '',
        locationId: locationId || '',
        slotId: slotId || '',
        slotDate: slotDate || '',
        slotStartTime: slotStartTime || '',
        carPlate: carPlate || '',
        userId: user.id,
        userEmail: user.email || '',
        serviceName: service.name || '', // ΜΟΝΟ από τη βάση — όχι από τον client
        amount: amount.toString(),           // ΒΑΣΗ (booking + settlement)
        serviceFee: SERVICE_FEE_EUR.toString(),
        appliedCredit: appliedCredit.toString(),
        fbp, fbc, clientIp, clientUa,
      },
    })

    // Καταγραφή checkout attempt — για abandoned-checkout recovery (best-effort).
    try {
      await admin.from('checkout_attempts').insert({
        payment_intent_id: paymentIntent.id,
        user_id: user.id,
        email: user.email || null,
        service_name: service.name || '',
        location_id: locationId || null,
        slot_date: slotDate || null,
        slot_start_time: slotStartTime || null,
        amount,
      })
    } catch { /* μη-κρίσιμο — δεν μπλοκάρει το checkout */ }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      customerSessionClientSecret,
      bookingRef,
      appliedCredit,                 // πόσο κουπόνι εφαρμόστηκε (για εμφάνιση στο checkout)
      serviceFee: SERVICE_FEE_EUR,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Σφάλμα'
    await alertCritical('Αποτυχία create-intent (πληρωμή)', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
