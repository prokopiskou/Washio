import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'

// Admin: μέγεθος κοινού για ένα πλυντήριο (audience_segment — supabase/audience.sql).
// Επιστρέφει ΜΟΝΟ αριθμούς — ποτέ λίστα χρηστών.
//  GET ?location=<uuid>&km=3&days=60&viewed=60&booked=1&fav=1&lapsed=21
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function requireAdmin() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  return user && isAdminEmail(user.email) ? user : null
}

const num = (v: string | null) => (v === null || v === '' ? null : Number(v))

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const p = req.nextUrl.searchParams

  if (!p.get('location')) {
    const { data } = await admin.from('locations').select('id, name').eq('is_active', true).order('name')
    return NextResponse.json({ locations: (data || []).map(l => ({ id: l.id, name: String(l.name).trim() })) })
  }

  const { data, error } = await admin.rpc('audience_segment', {
    p_location: p.get('location'),
    p_km: num(p.get('km')),
    p_days: num(p.get('days')) ?? 60,
    p_viewed_days: num(p.get('viewed')),
    p_booked: p.get('booked') === '1',
    p_favorite: p.get('fav') === '1',
    p_lapsed_days: num(p.get('lapsed')),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = (data || []) as { near: boolean; viewed: boolean; booked: boolean; favorite: boolean; can_push: boolean; can_email: boolean; last_wash_date: string | null }[]
  const c = (f: (r: typeof rows[number]) => boolean) => rows.filter(f).length
  return NextResponse.json({
    total: rows.length,
    byReason: { near: c(r => r.near), viewed: c(r => r.viewed), booked: c(r => r.booked), favorite: c(r => r.favorite) },
    channels: { push: c(r => r.can_push), email: c(r => r.can_email), pushOrEmail: c(r => r.can_push || r.can_email), none: c(r => !r.can_push && !r.can_email) },
    neverWashed: c(r => !r.last_wash_date),
  })
}
