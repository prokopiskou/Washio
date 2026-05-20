import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  try {
    const {
      bookingId,
      paymentIntentId,
      cancellationReason,
      cancellationDetails,
    } = await req.json()

    if (!bookingId) {
      return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 })
    }

    const supabase = await createClient()

    if (paymentIntentId) {
      await stripe.refunds.create({ payment_intent: paymentIntentId })
    }

    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancellation_reason: cancellationReason || null,
        cancellation_details: cancellationDetails || null,
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', bookingId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}