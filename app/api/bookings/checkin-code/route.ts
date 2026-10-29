import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { checkinCode } from '@/lib/checkin'

// Ο πελάτης παίρνει τον κωδικό QR της ΔΙΚΗΣ του κράτησης (σελίδα κράτησης).
// GET ?id=<booking id>  → { code }
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })
  const { data } = await admin.from('bookings').select('booking_ref, user_id').eq('id', id).maybeSingle()
  if (!data || data.user_id !== user.id) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ code: checkinCode(data.booking_ref as string) })
}
