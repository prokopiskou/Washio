import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'

// ============================================================
// Lead «από τον δρόμο» (cold, μπαίνουμε στο πλυντήριο).
//   GET  ?url=<Google Maps link>  → { name, address, phone, lat, lng, mapsUrl, already? }
//        Short link (maps.app.goo.gl) → ακολουθούμε το redirect → όνομα + συντεταγμένες
//        → Places (searchText κοντά στο σημείο) για διεύθυνση + τηλέφωνο.
//   POST { mapsUrl, name, address, phone, owner, outcome, followupAt, note }
//        → γραμμή στις «Αιτήσεις» (wash_type 'Πεδίο'), στο σωστό στάδιο.
//        outcome: 'followup' (ξαναπέρνα / ενδιαφέρεται) · 'no' (δεν ενδιαφέρεται) · 'onboarding' (θέλει συμφωνητικό)
// ============================================================

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function requireAdmin() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  return user && isAdminEmail(user.email) ? user : null
}

const MAPS_HOST = /^(https?:\/\/)?((www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps)/i

function parseMapsUrl(u: string): { name: string; lat: number | null; lng: number | null } {
  let name = ''
  const place = u.match(/\/place\/([^/@?]+)/)
  if (place) name = decodeURIComponent(place[1].replace(/\+/g, ' ')).trim()
  if (!name) { try { name = new URL(u).searchParams.get('q') || '' } catch { /* */ } }
  // Ακριβές σημείο του μαγαζιού (!3d lat !4d lng) — αλλιώς το κέντρο του χάρτη (@lat,lng)
  const pin = u.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
  const at = u.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  const m = pin || at
  return { name, lat: m ? Number(m[1]) : null, lng: m ? Number(m[2]) : null }
}

async function expand(url: string): Promise<string> {
  let cur = url.startsWith('http') ? url : `https://${url}`
  for (let i = 0; i < 4; i++) {
    if (!/goo\.gl/i.test(cur)) break
    const r = await fetch(cur, { redirect: 'manual', cache: 'no-store' })
    const loc = r.headers.get('location')
    if (!loc) break
    cur = loc
  }
  return cur
}

function km(a: number, b: number, c: number, d: number) {
  const R = 6371, r = Math.PI / 180, x = (c - a) * r, y = (d - b) * r
  const h = Math.sin(x / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(y / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const raw = (req.nextUrl.searchParams.get('url') || '').trim()
  const link = raw.match(/https?:\/\/\S+/)?.[0] || raw // από «Κοινοποίηση» έρχεται και κείμενο μαζί
  if (!MAPS_HOST.test(link)) return NextResponse.json({ error: 'Δεν είναι link Google Maps' }, { status: 400 })

  const full = await expand(link).catch(() => link)
  const p = parseMapsUrl(full)
  let name = p.name, address = '', phone = '', lat = p.lat, lng = p.lng

  const KEY = process.env.GOOGLE_PLACES_API_KEY
  if (KEY && (name || (lat != null && lng != null))) {
    try {
      const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location,places.nationalPhoneNumber' },
        body: JSON.stringify({
          textQuery: name || 'πλυντήριο αυτοκινήτων', languageCode: 'el', regionCode: 'GR', pageSize: 1,
          ...(lat != null && lng != null ? { locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 300 } } } : {}),
        }),
      })
      const j = await r.json().catch(() => ({})) as { places?: { displayName?: { text?: string }; formattedAddress?: string; location?: { latitude: number; longitude: number }; nationalPhoneNumber?: string }[] }
      const g = j.places?.[0]
      if (g) {
        name = name || g.displayName?.text || ''
        address = g.formattedAddress || ''
        phone = g.nationalPhoneNumber || ''
        if (g.location) { lat = g.location.latitude; lng = g.location.longitude }
      }
    } catch { /* χωρίς Places: μόνο όνομα/σημείο από το link */ }
  }

  // Υπάρχει ήδη; (πλυντήριο Washio σε <120μ. ή lead με το ίδιο όνομα)
  let already = ''
  if (lat != null && lng != null) {
    const { data: locs } = await admin.from('locations').select('name, lat, lng')
    const hit = (locs || []).find(l => l.lat && l.lng && km(lat!, lng!, Number(l.lat), Number(l.lng)) < 0.12)
    if (hit) already = `Είναι ήδη στο Washio: ${hit.name}`
  }
  if (!already && name) {
    const { data: apps } = await admin.from('applications').select('business_name, stage').ilike('business_name', name).limit(1)
    if (apps?.length) already = `Υπάρχει ήδη lead: ${apps[0].business_name}`
  }
  return NextResponse.json({ name, address, phone, lat, lng, mapsUrl: link, already })
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as {
    mapsUrl?: string; name?: string; address?: string; phone?: string; owner?: string
    outcome?: 'followup' | 'no' | 'onboarding'; followupAt?: string; note?: string
  }
  const name = String(b.name || '').trim()
  if (name.length < 2) return NextResponse.json({ error: 'Γράψε το όνομα του πλυντηρίου' }, { status: 400 })
  const outcome = b.outcome === 'no' || b.outcome === 'onboarding' ? b.outcome : 'followup'
  let followupAt: string | null = null
  if (outcome === 'followup') {
    const d = b.followupAt ? new Date(b.followupAt) : null
    if (!d || isNaN(d.getTime())) return NextResponse.json({ error: 'Διάλεξε πότε το ξαναπιάνουμε' }, { status: 400 })
    followupAt = d.toISOString()
  }
  const now = new Date().toISOString()
  const notes = [b.mapsUrl ? `📍 ${String(b.mapsUrl).trim()}` : '', `🚶 Επίσκεψη ${new Date().toLocaleDateString('el-GR', { timeZone: 'Europe/Athens' })} (${user.email})`, String(b.note || '').trim()]
    .filter(Boolean).join('\n')
  const { error } = await admin.from('applications').insert({
    business_name: name, address: String(b.address || '').trim(), city: '', afm: '',
    owner_name: String(b.owner || '').trim(), phone: String(b.phone || '').trim(), email: '',
    hours: '', lanes: '', wash_type: 'Πεδίο',
    status: outcome === 'no' ? 'rejected' : 'pending',
    stage: outcome === 'no' ? 'lost' : outcome === 'onboarding' ? 'onboarding' : 'followup',
    stage_updated_at: now, call_attempts: 0, last_call_at: now, last_call_by: user.email,
    followup_at: followupAt, followup_by: followupAt ? user.email : null, followup_notified_at: null,
    pipeline_notes: notes,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
