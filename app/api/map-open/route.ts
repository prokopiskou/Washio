import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Ένα άνοιγμα χάρτη → μία γραμμή στο map_opens: στρογγυλεμένη θέση (~1 χλμ.) + απόσταση από
// το κοντινότερο πλυντήριο. Η απόσταση υπολογίζεται ΕΔΩ με την ακριβή θέση, που δεν αποθηκεύεται.
// Σκοπός: να μετρήσουμε αν όσοι ανοίγουν τον χάρτη (και δεν κλείνουν) έχουν πλυντήριο κοντά τους.

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

type Loc = { id: string; lat: number; lng: number }
let locCache: { at: number; list: Loc[] } | null = null

async function activeLocations(): Promise<Loc[]> {
  if (locCache && Date.now() - locCache.at < 10 * 60_000) return locCache.list
  const { data } = await admin.from('locations').select('id, lat, lng').eq('is_active', true)
  const list = ((data || []) as { id: string; lat: number | null; lng: number | null }[])
    .filter(l => Number.isFinite(Number(l.lat)) && Number.isFinite(Number(l.lng)) && Number(l.lat) !== 0)
    .map(l => ({ id: l.id, lat: Number(l.lat), lng: Number(l.lng) }))
  locCache = { at: Date.now(), list }
  return list
}

function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, r = (d: number) => d * Math.PI / 180
  const dLat = r(bLat - aLat), dLng = r(bLng - aLng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

const clean = (v: unknown, max: number) => {
  const s = String(v ?? '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, max)
  return s || null
}

const safeDecode = (v: string | undefined) => {
  if (!v) return null
  try { return decodeURIComponent(v) } catch { return v }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const lat = Number(body?.lat), lng = Number(body?.lng)
    const hasLoc = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0)
    const source = ['cache', 'quick', 'precise'].includes(body?.source) ? body.source : 'none'

    // user_id ΜΟΝΟ από το session.
    let userId: string | null = null
    try {
      const auth = await createServerClient()
      const { data: { user } } = await auth.auth.getUser()
      userId = user?.id || null
    } catch { /* επισκέπτης */ }

    const jar = await cookies()
    const row: Record<string, unknown> = {
      user_id: userId,
      device_id: clean(body?.deviceId, 40),
      has_location: hasLoc,
      loc_source: hasLoc ? source : 'none',
      acq_ref: clean(jar.get('ws_ref')?.value, 40),
      acq_ad: clean(safeDecode(jar.get('ws_ad')?.value), 60),
      native: body?.native === true,
    }

    if (hasLoc) {
      const locs = await activeLocations()
      const d = locs.map(l => ({ id: l.id, km: km(lat, lng, l.lat, l.lng) })).sort((a, b) => a.km - b.km)
      row.lat_r = Math.round(lat * 100) / 100
      row.lng_r = Math.round(lng * 100) / 100
      row.nearest_km = d[0] ? Math.round(d[0].km * 10) / 10 : null
      row.nearest_location_id = d[0]?.id ?? null
      row.n_within_3km = d.filter(x => x.km <= 3).length
      row.n_within_5km = d.filter(x => x.km <= 5).length
      row.n_within_10km = d.filter(x => x.km <= 10).length
    }

    const { error } = await admin.from('map_opens').insert(row)
    if (error) console.error('map_opens insert', error.message)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
