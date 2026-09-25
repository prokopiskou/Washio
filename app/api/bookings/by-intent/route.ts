import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  const { data } = await admin
    .from('bookings')
    .select('booking_ref, locations(name, address, city, extra_instructions)')
    .eq('stripe_payment_intent_id', pi)
    .maybeSingle()

  if (!data?.booking_ref) {
    return NextResponse.json({ pending: true })
  }
  const loc = (data.locations as { name?: string; address?: string; city?: string; extra_instructions?: string } | null) || null
  return NextResponse.json({
    ref: data.booking_ref,
    location: loc ? { name: loc.name, address: loc.address, city: loc.city, extra_instructions: loc.extra_instructions } : null,
  })
}
