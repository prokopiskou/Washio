import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

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

    // 2) Τιμή υπολογίζεται SERVER-SIDE από τη DB — ποτέ από τον client.
    const { data: service, error: serviceErr } = await admin
      .from('services')
      .select('id, name, price, price_moto')
      .eq('id', serviceId)
      .single()

    if (serviceErr || !service) {
      return NextResponse.json({ error: 'Άκυρη υπηρεσία' }, { status: 400 })
    }

    const isMoto = vehicleType === 'Μοτοσικλέτα'
    let amount = isMoto && service.price_moto != null ? Number(service.price_moto) : Number(service.price)

    // Addons: μόνο όσα ανήκουν πραγματικά στο location, με την τιμή της DB.
    const requestedAddonIds: string[] = Array.isArray(addonIds) ? addonIds : []
    if (requestedAddonIds.length > 0) {
      const { data: locAddons } = await admin
        .from('location_addons')
        .select('addon_id, price_override, addons(price)')
        .eq('location_id', locationId)
        .in('addon_id', requestedAddonIds)

      for (const a of locAddons || []) {
        const priceOverride = (a as { price_override: number | null }).price_override
        const basePrice = (a as { addons?: { price?: number } }).addons?.price
        amount += Number(priceOverride ?? basePrice ?? 0)
      }
    }

    if (!(amount > 0)) {
      return NextResponse.json({ error: 'Μη έγκυρο ποσό' }, { status: 400 })
    }

    // 3) Re-check διαθεσιμότητας slot (κλείνει το μεγαλύτερο μέρος του race· πλήρης ατομικότητα
    //    με DB unique index — βλ. supabase/slot_uniqueness.sql).
    const { data: existingBookings } = await admin
      .from('bookings')
      .select('id')
      .eq('location_id', locationId)
      .eq('slot_date', slotDate)
      .eq('slot_start_time', slotStartTime)
      .not('status', 'in', '("cancelled")')

    if (existingBookings && existingBookings.length > 0) {
      return NextResponse.json({ error: 'Το slot μόλις κλείστηκε. Διάλεξε άλλη ώρα.' }, { status: 409 })
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: 'eur',
      payment_method_types: ['card'],
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

    return NextResponse.json({ clientSecret: paymentIntent.client_secret })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Σφάλμα'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
