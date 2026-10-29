import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { checkinCode } from '@/lib/checkin'

// Ο πελάτης παίρνει τον κωδικό QR της ΔΙΚΗΣ του κράτησης (σελίδα κράτησης).
// GET ?id=<booking id> ή ?ref=WS-XXXX  → { code }
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') || ''
  const ref = String(req.nextUrl.searchParams.get('ref') || '').toUpperCase()
  const byId = /^[0-9a-f-]{36}$/i.test(id)
  if (!byId && !/^WS-[A-Z0-9]{4,16}$/.test(ref)) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })
  const q = admin.from('bookings').select('booking_ref, user_id')
  const { data } = await (byId ? q.eq('id', id) : q.eq('booking_ref', ref)).maybeSingle()
  if (!data || data.user_id !== user.id) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ code: checkinCode(data.booking_ref as string) })
}
