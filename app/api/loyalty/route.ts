import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { loyaltyStatus, loyaltyFromRows, DROPS_FOR_REWARD, LOYALTY_EUR } from '@/lib/loyalty'

// Washio Club — σταγόνες του συνδεδεμένου χρήστη.
//   GET ?location=<id> → { drops, need, rewardNext, amount } για ένα πλυντήριο
//   GET               → λίστα ανά πλυντήριο (για το προφίλ)
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  let userId: string | null = null
  try {
    const sb = await createServerClient()
    const { data: { user } } = await sb.auth.getUser()
    userId = user?.id || null
  } catch { /* επισκέπτης */ }
  const empty = { drops: 0, need: DROPS_FOR_REWARD, rewardNext: false, amount: LOYALTY_EUR }
  const loc = req.nextUrl.searchParams.get('location') || ''
  if (loc) {
    if (!userId || !UUID.test(loc)) return NextResponse.json(empty)
    return NextResponse.json(await loyaltyStatus(admin, userId, loc))
  }
  if (!userId) return NextResponse.json({ need: DROPS_FOR_REWARD, amount: LOYALTY_EUR, locations: [] })
  const q = (cols: string) => admin.from('bookings').select(cols)
    .eq('user_id', userId).or('source.is.null,source.eq.platform').limit(1000)
  let res = await q('location_id, status, slot_date, slot_start_time, loyalty_discount, locations(name, slug)')
  if (res.error) res = await q('location_id, status, slot_date, slot_start_time, locations(name, slug)')
  type R = { location_id: string; status: string; slot_date: string | null; slot_start_time: string | null; loyalty_discount?: number | null; locations: { name?: string; slug?: string } | null }
  const by = new Map<string, { name: string; slug: string; rows: R[] }>()
  for (const r of (res.data || []) as unknown as R[]) {
    const e = by.get(r.location_id) || { name: r.locations?.name || '', slug: r.locations?.slug || '', rows: [] }
    e.rows.push(r); by.set(r.location_id, e)
  }
  const locations = [...by.entries()].map(([id, e]) => ({ id, name: e.name, slug: e.slug, ...loyaltyFromRows(e.rows) }))
    .sort((a, b) => Number(b.rewardNext) - Number(a.rewardNext) || b.drops - a.drops)
  return NextResponse.json({ need: DROPS_FOR_REWARD, amount: LOYALTY_EUR, locations })
}
