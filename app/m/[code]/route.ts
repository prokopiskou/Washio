import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { directionsWebUrl } from '@/lib/open-directions'

// Σύντομο link χάρτη για SMS: washio.gr/m/4CDABF13 → Google Maps (οδηγίες) προς το πλυντήριο
// της κράτησης WS-4CDABF13. Δείχνει μόνο τη θέση του πλυντηρίου — κανένα στοιχείο πελάτη.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const clean = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
  if (clean.length >= 6) {
    type Loc = { name?: string; address?: string; city?: string; lat?: number; lng?: number; google_maps_url?: string | null }
    let res = await admin.from('bookings')
      .select('locations(name, address, city, lat, lng, google_maps_url)')
      .eq('booking_ref', `WS-${clean}`).maybeSingle()
    // Χωρίς στήλη google_maps_url (πριν το supabase/location_maps_url.sql) → μόνο συντεταγμένες.
    if (res.error) res = await admin.from('bookings').select('locations(name, address, city, lat, lng)').eq('booking_ref', `WS-${clean}`).maybeSingle()
    const loc = (res.data as { locations?: Loc | null } | null)?.locations
    // Το επίσημο link Google Maps του πλυντηρίου (κριτικές, φωτογραφίες, ωράριο) — αλλιώς οδηγίες προς τις συντεταγμένες.
    const url = String(loc?.google_maps_url || '').trim()
    if (/^https:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|(www\.)?google\.[a-z.]+\/maps)/i.test(url)) return NextResponse.redirect(url, 302)
    if (loc) return NextResponse.redirect(directionsWebUrl(loc), 302)
  }
  return NextResponse.redirect(new URL('/map', req.url), 302)
}
