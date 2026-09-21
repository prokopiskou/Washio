import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { alertCritical } from '@/lib/alert'
import { checkSlotAvailability } from '@/lib/availability-server'

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
      slotStartTime, carPlate, serviceName, vehicleType, addonIds,
    } = await req.json()

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
                payment_method_redisplay: 'enabled',
                payment_method_save: 'enabled',
                payment_method_save_usage: 'on_session',
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

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'eur',
      payment_method_types: ['card'],
      ...(customerId ? { customer: customerId } : {}),
      metadata: {
        serviceId: serviceId || '',
        locationId: locationId || '',
        slotId: slotId || '',
        slotDate: slotDate || '',
        slotStartTime: slotStartTime || '',
        carPlate: carPlate || '',
        userId: user.id,
        userEmail: user.email || '',
        serviceName: serviceName || service.name || '',
        amount: amount.toString(),
      },
    })

    // Καταγραφή checkout attempt — για abandoned-checkout recovery (best-effort).
    try {
      await admin.from('checkout_attempts').insert({
        payment_intent_id: paymentIntent.id,
        user_id: user.id,
        email: user.email || null,
        service_name: serviceName || service.name || '',
        location_id: locationId || null,
        slot_date: slotDate || null,
        slot_start_time: slotStartTime || null,
        amount,
      })
    } catch { /* μη-κρίσιμο — δεν μπλοκάρει το checkout */ }

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      customerSessionClientSecret,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Σφάλμα'
    await alertCritical('Αποτυχία create-intent (πληρωμή)', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
