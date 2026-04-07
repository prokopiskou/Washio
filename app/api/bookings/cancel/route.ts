import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  try {
    const { bookingId, paymentIntentId } = await req.json()
    const supabase = await createClient()

    if (paymentIntentId) {
      await stripe.refunds.create({ payment_intent: paymentIntentId })
    }

    await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', bookingId)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}