import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Δεδομένα χάρτη σε ΕΝΑ αίτημα, cached στο CDN της Vercel (dub1, δίπλα στη Supabase eu-west-1).
// Πριν: 4 αιτήματα από το κινητό προς Supabase (+ ανανέωση token πρώτα), ~1″ το καθένα →
// σε 4G/iPhone οι πινέζες άργαγαν 5–7″. Τώρα: 1 αίτημα, συνήθως από cache (~50–150ms).
// Μόνο δημόσια πεδία· οι πιασμένες ώρες χωρίς προσωπικά στοιχεία (ίδια λογική με busy_slots).

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date') || ''
  const dow = Number(req.nextUrl.searchParams.get('dow'))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(dow >= 1 && dow <= 7)) {
    return NextResponse.json({ error: 'bad params' }, { status: 400 })
  }

  const [locs, hours, busy, exc] = await Promise.all([
    admin.from('locations')
      .select('id, name, address, city, slug, lat, lng, capacity, photos, services(id, name, price, price_moto, price_suv, duration_minutes, is_range, price_min, price_max, price_min_suv, price_max_suv, is_active, sort_order), reviews(rating)')
      .eq('is_active', true),
    admin.from('location_hours').select('location_id, open_time, close_time, open_time2, close_time2, is_closed').eq('day_of_week', dow),
    admin.from('bookings').select('location_id, slot_start_time, duration_minutes')
      .eq('slot_date', date).not('status', 'in', '("cancelled","no_show")'),
    admin.from('location_hours_exceptions').select('location_id, is_closed, closed_from, closed_to, periods').eq('exception_date', date),
  ])

  if (locs.error || hours.error || busy.error || exc.error) {
    return NextResponse.json({ error: 'db' }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }

  return NextResponse.json(
    { locations: locs.data, hours: hours.data, busy: busy.data, exceptions: exc.data, at: Date.now() },
    // 20″ φρέσκο, μετά σερβίρεται το παλιό ενώ ανανεώνεται στο παρασκήνιο (έως 5').
    // Η τελική διαθεσιμότητα ελέγχεται ΠΑΝΤΑ στον server κατά την κράτηση.
    { headers: { 'Cache-Control': 'public, s-maxage=20, stale-while-revalidate=300' } }
  )
}
