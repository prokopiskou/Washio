import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Σκάνερ καταστήματος: όνομα πλυντηρίου για ένα token (για τη σελίδα /s/<token>).
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function GET(req: NextRequest) {
  const t = String(req.nextUrl.searchParams.get('t') || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)
  if (t.length < 16) return NextResponse.json({ ok: false }, { status: 400 })
  const { data } = await admin.from('locations').select('name').eq('scan_token', t).maybeSingle()
  if (!data) return NextResponse.json({ ok: false }, { status: 404 })
  return NextResponse.json({ ok: true, name: data.name })
}
