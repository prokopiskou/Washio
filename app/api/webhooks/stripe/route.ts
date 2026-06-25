import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { alertCritical } from '@/lib/alert'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY)

const BASE_URL = 'https://washio.gr'
const MONTHS_SHORT = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']

function confirmationEmailHtml(data: {
  bookingRef: string
  locationName: string
  service: string
  date: string
  time: string
  plate: string
  total: string
}) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; background: #fff;">
      <div style="background: #0A0A0A; padding: 32px; text-align: center; border-radius: 16px 16px 0 0;">
        <h1 style="color: white; font-size: 22px; font-weight: 600; margin: 0; letter-spacing: -0.5px;">washio</h1>
        <p style="color: #666; font-size: 12px; margin: 6px 0 0;">Πλύσιμο αυτοκινήτου με ένα tap</p>
      </div>
      <div style="padding: 32px; border: 1px solid #F0F0F0; border-top: none; border-radius: 0 0 16px 16px;">
        <div style="text-align: center; margin-bottom: 28px;">
          <div style="width: 48px; height: 48px; background: #0A0A0A; border-radius: 50%; margin: 0 auto 12px auto; text-align: center; line-height: 48px;">
            <span style="color: white; font-size: 20px;">✓</span>
          </div>
          <h2 style="font-size: 18px; font-weight: 600; color: #0A0A0A; margin: 0 0 6px;">Η κράτησή σου επιβεβαιώθηκε!</h2>
          <p style="color: #999; font-size: 13px; margin: 0;">Τα στοιχεία της κράτησής σου παρακάτω.</p>
        </div>
        <div style="background: #F7F7F7; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Κωδικός κράτησης</td><td style="color: #0A0A0A; font-weight: 600; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF; font-family: monospace;">${data.bookingRef}</td></tr>
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Σταθμός</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">${data.locationName}</td></tr>
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Υπηρεσία</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">${data.service}</td></tr>
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Ημερομηνία</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">${data.date}</td></tr>
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Ώρα</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">${data.time}</td></tr>
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Πινακίδα</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">${data.plate}</td></tr>
            <tr><td style="color: #0A0A0A; font-weight: 600; padding: 8px 0 0;">Σύνολο</td><td style="color: #0A0A0A; font-weight: 700; text-align: right; padding: 8px 0 0; font-size: 15px;">€${data.total}</td></tr>
          </table>
        </div>
        <div style="background: #F0F7FF; border-radius: 10px; padding: 14px 16px; margin-bottom: 24px;">
          <p style="color: #1A6FD4; font-size: 12px; margin: 0; line-height: 1.6;">
            📍 Θα λάβεις υπενθύμιση <strong>1 ώρα πριν</strong> την κράτησή σου.<br/>
            Κράτα τον κωδικό <strong>${data.bookingRef}</strong> για οποιαδήποτε αλλαγή.
          </p>
        </div>
        <a href="${BASE_URL}" style="display: block; background: #0A0A0A; color: white; text-align: center; padding: 14px; border-radius: 12px; text-decoration: none; font-size: 14px; font-weight: 500; margin-bottom: 24px;">Δες τις κρατήσεις σου →</a>
        <p style="color: #CCC; font-size: 11px; text-align: center; margin: 0;">Washio · Γλυφάδα, Αττική</p>
      </div>
    </div>
  `
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'invalid signature'
    console.error('Stripe signature error:', msg)
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  if (event.type === 'payment_intent.succeeded') {
    const intent = event.data.object as Stripe.PaymentIntent
    const m = intent.metadata

    // Idempotency check — αν υπάρχει ήδη booking για αυτό το payment, skip
    const { data: existing } = await supabase
      .from('bookings')
      .select('id, booking_ref')
      .eq('stripe_payment_intent_id', intent.id)
      .maybeSingle()

    if (existing) {
      console.log('Booking already exists for payment:', intent.id, '— skipping')
      return NextResponse.json({ received: true, duplicate: true })
    }

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
      await alertCritical(
        'Πληρωμή ΟΚ αλλά booking ΑΠΕΤΥΧΕ',
        `payment_intent: ${intent.id}\nΠοσό: €${m.amount}\nΣφάλμα: ${error.message}`
      )
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Fetch location
    const { data: locationData } = await supabase
      .from('locations')
      .select('name')
      .eq('id', m.locationId)
      .single()

    // Get user email
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
      console.error('No user email for booking:', bookingRef)
      return NextResponse.json({ received: true, warning: 'no_email' })
    }

    const date = new Date(m.slotDate)
    const formattedDate = `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`

    // Send email DIRECTLY via Resend (no internal fetch)
    try {
      await resend.emails.send({
        from: 'Washio <noreply@washio.gr>',
        to: userEmail,
        subject: `✓ Η κράτησή σου επιβεβαιώθηκε — ${bookingRef}`,
        html: confirmationEmailHtml({
          bookingRef,
          locationName: locationData?.name || 'Washio',
          service: m.serviceName || 'Υπηρεσία',
          date: formattedDate,
          time: m.slotStartTime?.slice(0, 5) || '',
          plate: m.carPlate || '',
          total: parseFloat(m.amount).toFixed(0),
        }),
      })
      console.log('Confirmation email sent to:', userEmail)
    } catch (emailErr: unknown) {
      console.error('Email send error:', emailErr instanceof Error ? emailErr.message : 'unknown')
    }
  }

  if (event.type === 'charge.refunded') {
    const charge = event.data.object as Stripe.Charge
    const paymentIntentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id

    if (paymentIntentId) {
      const refundAmount = charge.amount_refunded / 100
      const isFullRefund = charge.amount_refunded >= charge.amount
      const stripePaymentStatus = isFullRefund ? 'refunded' : 'partially_refunded'

      const { error: refundUpdateError } = await supabase
        .from('bookings')
        .update({
          stripe_payment_status: stripePaymentStatus,
          refund_amount: refundAmount,
        })
        .eq('stripe_payment_intent_id', paymentIntentId)

      if (refundUpdateError) {
        console.error('Booking refund status update error:', refundUpdateError)
        return NextResponse.json({ error: refundUpdateError.message }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ received: true })
}