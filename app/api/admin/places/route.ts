import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'

// Λίστα ΟΛΩΝ των πλυντηρίων της Αττικής από το Google Places API (New) — επίσημο API, όχι scraping.
// GET /api/admin/places → CSV (όνομα, περιοχή, τηλέφωνο, site, βαθμολογία, κριτικές, Maps link, «ήδη στο Washio»).
// Κλειδί: GOOGLE_PLACES_API_KEY (Vercel env, server-only, περιορισμένο στο «Places API (New)»).
// Κόστος: ~40 περιοχές × έως 3 σελίδες ≈ 120 αιτήματα ≈ 4–5$.
export const maxDuration = 300

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const AREAS = [
  'Αθήνα Κέντρο', 'Κυψέλη', 'Πατήσια', 'Αμπελόκηποι', 'Παγκράτι', 'Καισαριανή', 'Βύρωνας', 'Ζωγράφου', 'Ηλιούπολη',
  'Δάφνη', 'Άγιος Δημήτριος', 'Νέα Σμύρνη', 'Καλλιθέα', 'Μοσχάτο', 'Ταύρος', 'Παλαιό Φάληρο', 'Άλιμος', 'Αργυρούπολη',
  'Ελληνικό', 'Γλυφάδα', 'Βούλα', 'Βάρη', 'Πειραιάς', 'Νίκαια', 'Κορυδαλλός', 'Κερατσίνι', 'Πέραμα', 'Αιγάλεω',
  'Περιστέρι', 'Χαϊδάρι', 'Πετρούπολη', 'Ίλιον', 'Αγία Παρασκευή', 'Χαλάνδρι', 'Μαρούσι', 'Κηφισιά', 'Νέα Ιωνία',
  'Γαλάτσι', 'Χολαργός', 'Παπάγου', 'Μεταμόρφωση', 'Ηράκλειο Αττικής', 'Μελίσσια', 'Βριλήσσια', 'Γέρακας', 'Παλλήνη',
]
const FIELDS = [
  'places.id', 'places.displayName', 'places.formattedAddress', 'places.location', 'places.rating', 'places.userRatingCount',
  'places.nationalPhoneNumber', 'places.websiteUri', 'places.googleMapsUri', 'places.businessStatus', 'nextPageToken',
].join(',')

type P = {
  id: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude: number; longitude: number }
  rating?: number; userRatingCount?: number; nationalPhoneNumber?: string; websiteUri?: string; googleMapsUri?: string; businessStatus?: string
}

function km(a: number, b: number, c: number, d: number) {
  const R = 6371, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r
  const h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
const csv = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

export async function GET() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const KEY = process.env.GOOGLE_PLACES_API_KEY
  if (!KEY) return NextResponse.json({ error: 'Λείπει το GOOGLE_PLACES_API_KEY στο Vercel' }, { status: 500 })

  const found = new Map<string, P & { area: string }>()
  const errors: string[] = []
  for (const area of AREAS) {
    let token: string | undefined
    for (let page = 0; page < 3; page++) {
      const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': FIELDS },
        body: JSON.stringify({ textQuery: `πλυντήριο αυτοκινήτων ${area}`, languageCode: 'el', regionCode: 'GR', pageSize: 20, ...(token ? { pageToken: token } : {}) }),
      })
      const j = await r.json().catch(() => ({})) as { places?: P[]; nextPageToken?: string; error?: { message?: string } }
      if (!r.ok) { errors.push(`${area}: ${j.error?.message || r.status}`); break }
      for (const p of j.places || []) if (!found.has(p.id) && p.businessStatus !== 'CLOSED_PERMANENTLY') found.set(p.id, { ...p, area })
      token = j.nextPageToken
      if (!token) break
      await new Promise(res => setTimeout(res, 1000)) // το pageToken θέλει λίγο χρόνο να ενεργοποιηθεί
    }
    if (errors.length > 3) break
  }
  if (!found.size) return NextResponse.json({ error: 'Κανένα αποτέλεσμα', errors }, { status: 502 })

  const { data: locs } = await admin.from('locations').select('name, lat, lng')
  const ours = (locs || []).filter(l => l.lat && l.lng) as { name: string; lat: number; lng: number }[]

  const rows = [...found.values()].map(p => {
    const lat = p.location?.latitude, lng = p.location?.longitude
    const near = lat != null && lng != null
      ? ours.map(o => ({ o, d: km(lat, lng, Number(o.lat), Number(o.lng)) })).sort((a, b) => a.d - b.d)[0]
      : undefined
    const inWashio = near && near.d < 0.12 ? near.o.name : ''
    return {
      name: p.displayName?.text || '', area: p.area, address: p.formattedAddress || '', phone: p.nationalPhoneNumber || '',
      website: p.websiteUri || '', rating: p.rating ?? '', reviews: p.userRatingCount ?? 0, maps: p.googleMapsUri || '',
      inWashio, nearestKm: near ? Math.round(near.d * 10) / 10 : '',
    }
  }).sort((a, b) => Number(!!a.inWashio) - Number(!!b.inWashio) || Number(b.reviews) - Number(a.reviews))

  const head = ['Όνομα', 'Περιοχή', 'Διεύθυνση', 'Τηλέφωνο', 'Site', 'Βαθμολογία', 'Κριτικές', 'Google Maps', 'Ήδη στο Washio', 'Απόσταση από δικό μας (χλμ)']
  const body = rows.map(r => [r.name, r.area, r.address, r.phone, r.website, r.rating, r.reviews, r.maps, r.inWashio, r.nearestKm].map(csv).join(','))
  const out = '﻿' + [head.map(csv).join(','), ...body].join('\n')
  return new NextResponse(out, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="plyntiria_attikis_${new Date().toISOString().slice(0, 10)}.csv"`,
      'X-Errors': String(errors.length),
    },
  })
}
