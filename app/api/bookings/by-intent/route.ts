import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { fulfillPaymentIntent } from '@/lib/fulfill-intent'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// ============================================================
// Σελίδα επιβεβαίωσης: βρες την κράτηση από το Stripe payment_intent.
// Service role → δεν εξαρτάται από το session του χρήστη (που μετά το
// redirect του Stripe συχνά δεν έχει φορτωθεί ακόμα, οπότε το RLS έκοβε
// το read και ο κωδικός έμενε «-----»).
//
// Ασφάλεια: το payment_intent id είναι μη-μαντεύσιμο και το έχει μόνο ο
// πληρωτής (από το return_url). Επιστρέφουμε ΜΟΝΟ ref + δημόσια στοιχεία
// πλυντηρίου — τίποτα ευαίσθητο.
// ============================================================

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const pi = req.nextUrl.searchParams.get('pi') || ''
  if (!/^pi_[A-Za-z0-9]+$/.test(pi)) {
    return NextResponse.json({ error: 'bad intent' }, { status: 400 })
  }
  const find = () => admin
    .from('bookings')
    .select('booking_ref, locations(name, address, city, lat, lng, extra_instructions)')
    .eq('stripe_payment_intent_id', pi)
    .maybeSingle()
  let { data } = await find()

  // ΑΥΤΟ-ΙΑΣΗ: η πληρωμή πέρασε αλλά το webhook δεν έφτασε (π.χ. απενεργοποιημένο endpoint)
  // → δημιούργησε την κράτηση εδώ (ίδια λογική, idempotent). Μόνο για succeeded intents.
  if (!data?.booking_ref) {
    try {
      const intent = await stripe.paymentIntents.retrieve(pi)
      if (intent.status === 'succeeded' && Date.now() / 1000 - intent.created < 7 * 86400) {
        await fulfillPaymentIntent(intent)
        ;({ data } = await find())
      }
    } catch { /* συνέχισε ως pending */ }
  }

  if (!data?.booking_ref) {
    return NextResponse.json({ pending: true })
  }
  const loc = (data.locations as { name?: string; address?: string; city?: string; lat?: number; lng?: number; extra_instructions?: string } | null) || null
  return NextResponse.json({
    ref: data.booking_ref,
    location: loc ? { name: loc.name, address: loc.address, city: loc.city, lat: loc.lat, lng: loc.lng, extra_instructions: loc.extra_instructions } : null,
  })
}
