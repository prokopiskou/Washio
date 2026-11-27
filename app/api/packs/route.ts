import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET /api/packs?locationId=… → ενεργά πακέτα ενός πλυντηρίου (δημόσιο).
// GET /api/packs?tunnels=1   → ids πλυντηρίων-τούνελ με πακέτα (για badge στον χάρτη).
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  if (sp.get('tunnels')) {
    const { data } = await admin.from('wash_packs').select('location_id, service_id').eq('is_active', true)
    const ids = [...new Set((data || []).map(r => r.location_id as string))]
    // Υπηρεσίες που καλύπτονται από πακέτα/μεμονωμένα (χωρίς ραντεβού) → κρύβονται από το «Με ραντεβού».
    const svc = [...new Set((data || []).map(r => r.service_id as string))]
    return NextResponse.json({ ids, svc }, { headers: { 'Cache-Control': 'public, s-maxage=300' } })
  }
  const locationId = String(sp.get('locationId') || '')
  if (!/^[0-9a-f-]{36}$/i.test(locationId)) return NextResponse.json({ packs: [] })
  const [{ data: packs }, { data: loc }] = await Promise.all([
    admin.from('wash_packs').select('id, name, washes, price, valid_days, service_id, services(name, price)')
      .eq('location_id', locationId).eq('is_active', true).order('sort_order'),
    admin.from('locations').select('id, name, address, is_tunnel').eq('id', locationId).maybeSingle(),
  ])
  const out = (packs || []).map((p: Record<string, unknown>) => {
    const svc = (p.services || {}) as { name?: string; price?: number }
    const single = Number(svc.price) || 0
    const price = Number(p.price)
    const washes = Number(p.washes)
    return {
      id: p.id, name: p.name, washes, price, validDays: p.valid_days,
      service: svc.name || '', perWash: +(price / washes).toFixed(2), single,
      save: single > 0 ? Math.max(0, +(single * washes - price).toFixed(2)) : 0,
    }
  })
  return NextResponse.json({ location: loc, packs: out })
}
