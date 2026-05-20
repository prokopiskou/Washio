import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://washio-ten.vercel.app'

const MONTHS_SHORT = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    console.error('Stripe signature error:', err.message)
    return NextResponse.json({ error: err.message }, { status: 400 })
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent
    const m = intent.metadata

    // Generate booking_ref
    const bookingRef = 'WS-' + Math.random().toString(16).slice(2, 10).toUpperCase()

    const { error } = await supabase.from('bookings').insert({
      booking_ref: bookingRef,
      user_id: m.userId || null,
      location_id: m.locationId,
      service_id: m.serviceId,
      slot_id: m.slotId || null,
      slot_date: m.slotDate,
      slot_start_time: m.slotStartTime,
      car_plate: m.carPlate || null,
      total_amount: parseFloat(m.amount),
      platform_fee: parseFloat(m.amount) * 0.10,
      stripe_payment_intent_id: intent.id,
      stripe_payment_status: 'paid',
      paid_at: new Date().toISOString(),
      status: 'confirmed',
    })

    if (error) {
      console.error('Booking insert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Fetch location info for email
    const { data: locationData } = await supabase
      .from('locations')
      .select('name, address, city')
      .eq('id', m.locationId)
      .single()

    // Fetch user email — first from metadata, fallback to profile
    let userEmail = m.userEmail || null
    if (!userEmail && m.userId) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', m.userId)
        .single()
      userEmail = profileData?.email || null
    }

    if (!userEmail) {
      console.error('No user email found for booking:', bookingRef)
      return NextResponse.json({ received: true, warning: 'no_email' })
    }

    const date = new Date(m.slotDate)
    const formattedDate = `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`

    // Send confirmation email
    try {
      const emailRes = await fetch(`${BASE_URL}/api/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'confirmation',
          to: userEmail,
          bookingRef,
          locationName: locationData?.name || 'Washio',
          service: m.serviceName || 'Υπηρεσία',
          date: formattedDate,
          time: m.slotStartTime?.slice(0, 5) || '',
          plate: m.carPlate || '',
          total: parseFloat(m.amount).toFixed(0),
        }),
      })

      if (!emailRes.ok) {
        const errText = await emailRes.text()
        console.error('Email send failed:', errText)
      } else {
        console.log('Confirmation email sent to:', userEmail)
      }
    } catch (emailErr) {
      console.error('Email send error:', emailErr)
    }
  }

  return NextResponse.json({ received: true })
}

export const config = { api: { bodyParser: false } }