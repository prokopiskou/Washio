import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { fulfillPaymentIntent } from '@/lib/fulfill-intent'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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
    const r = await fulfillPaymentIntent(event.data.object as Stripe.PaymentIntent)
    return NextResponse.json(r.body, { status: r.status })
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