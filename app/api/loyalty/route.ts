import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { loyaltyStatus, DROPS_FOR_REWARD, LOYALTY_EUR } from '@/lib/loyalty'

// Washio Club — σταγόνες του συνδεδεμένου χρήστη.
//   GET [?location=<id>] → { drops, need, rewardNext, amount } — ΚΟΙΝΗ πρόοδος σε όλα τα πλυντήρια
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
  // Χωρίς location → η ΚΟΙΝΗ πρόοδος (ίδια για όλα τα πλυντήρια) — για το προφίλ.
  if (!userId) return NextResponse.json({ ...empty, locations: [] })
  return NextResponse.json({ ...(await loyaltyStatus(admin, userId, null)), locations: [] })
}
