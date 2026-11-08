import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCheckoutConfig } from '@/lib/checkout-config'

// Δημόσιο: προεπιλογή πληρωμής + τέλος κάρτας για το checkout.
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function GET() {
  const c = await getCheckoutConfig(db)
  return NextResponse.json({ defaultPay: c.defaultPay, cardFee: c.cardFee, fee: c.fee }, { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } })
}
