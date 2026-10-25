import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { loyaltyStatus, LOYALTY_EVERY, LOYALTY_EUR } from '@/lib/loyalty'

// Washio Club — σφραγίδες του συνδεδεμένου χρήστη.
//   GET ?location=<id> → { stamps, rewardNext, every, amount } για ένα πλυντήριο
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
  const empty = { stamps: 0, rewardNext: false, every: LOYALTY_EVERY, amount: LOYALTY_EUR }
  const loc = req.nextUrl.searchParams.get('location') || ''
  if (loc) {
    if (!userId || !UUID.test(loc)) return NextResponse.json(empty)
    const s = await loyaltyStatus(admin, userId, loc)
    return NextResponse.json({ stamps: s.stamps, rewardNext: s.rewardNext, every: s.every, amount: s.amount })
  }
  if (!userId) return NextResponse.json({ every: LOYALTY_EVERY, amount: LOYALTY_EUR, locations: [] })
  const { data } = await admin.from('bookings').select('location_id, locations(name, slug)')
    .eq('user_id', userId).not('status', 'in', '("cancelled","no_show")').or('source.is.null,source.eq.platform').limit(1000)
  const by = new Map<string, { id: string; name: string; slug: string; count: number }>()
  for (const b of (data || []) as unknown as { location_id: string; locations: { name?: string; slug?: string } | null }[]) {
    const e = by.get(b.location_id) || { id: b.location_id, name: b.locations?.name || '', slug: b.locations?.slug || '', count: 0 }
    e.count++; by.set(b.location_id, e)
  }
  const locations = [...by.values()].map(e => ({ ...e, stamps: e.count % LOYALTY_EVERY, rewardNext: (e.count + 1) % LOYALTY_EVERY === 0 }))
    .sort((a, b) => b.stamps - a.stamps)
  return NextResponse.json({ every: LOYALTY_EVERY, amount: LOYALTY_EUR, locations })
}
