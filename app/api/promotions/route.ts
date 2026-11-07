import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Δημόσιο: ενεργές προωθήσεις (που δεν έχουν λήξει) για ένα πλυντήριο → εμφάνιση στη σελίδα/κράτηση.
// Η πραγματική τιμή υπολογίζεται server-side στην κράτηση.  GET ?location=<id>
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const athensToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(new Date())

export async function GET(req: NextRequest) {
  const location = req.nextUrl.searchParams.get('location') || ''
  // ?all=1 → όλες οι ενεργές προωθήσεις (χάρτης: χρυσή πινέζα + λίστα).
  if (req.nextUrl.searchParams.get('all')) {
    // * → και by_booking_date (αν υπάρχει η στήλη)
    const { data: rows } = await admin.from('promotions').select('*').eq('is_active', true).gte('ends_on', athensToday())
    const data = (rows || []).map(({ id, location_id, service_id, discount_type, discount_value, starts_on, ends_on, by_booking_date }) => ({ id, location_id, service_id, discount_type, discount_value, starts_on, ends_on, by_booking_date: !!by_booking_date }))
    return NextResponse.json({ promotions: data || [] }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } })
  }
  if (!/^[0-9a-f-]{36}$/i.test(location)) return NextResponse.json({ promotions: [] })
  const { data: rows } = await admin.from('promotions').select('*').eq('location_id', location).eq('is_active', true).gte('ends_on', athensToday())
  const data = (rows || []).map(({ id, service_id, discount_type, discount_value, starts_on, ends_on, by_booking_date }) => ({ id, service_id, discount_type, discount_value, starts_on, ends_on, by_booking_date: !!by_booking_date }))
  return NextResponse.json({ promotions: data || [] }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } })
}
