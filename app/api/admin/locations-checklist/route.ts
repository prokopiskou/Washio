import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'

// Admin → λίστα πλυντηρίων (view locations_checklist: IBAN, προμήθεια, ΑΦΜ κ.λπ.).
// Το view ΔΕΝ είναι πλέον προσβάσιμο από anon/authenticated (supabase/lockdown_public.sql) → μόνο μέσω εδώ.
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function GET(req: Request) {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  // ?phones=1 → κινητά πλυντηρίων (locations.phone δεν διαβάζεται πλέον από τον browser).
  if (new URL(req.url).searchParams.get('phones')) {
    const { data, error } = await db.from('locations').select('id, phone, owner_id')
    return NextResponse.json({ data: data || null, error: error?.message || null }, { headers: { 'Cache-Control': 'no-store' } })
  }
  const { data, error } = await db.from('locations_checklist').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } })
}
