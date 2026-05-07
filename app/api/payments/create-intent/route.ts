import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  try {
    const { 
      amount, serviceId, locationId, slotId, slotDate, 
      slotStartTime, carPlate, userId, userEmail, serviceName 
    } = await req.json()

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
        userId: userId || '',
        userEmail: userEmail || '',
        serviceName: serviceName || '',
        amount: amount.toString(),
      },
    })

    return NextResponse.json({ clientSecret: paymentIntent.client_secret })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
