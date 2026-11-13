import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'
import { classify, allocate, loadTierData, TIER_META, RULES } from '@/lib/tiers'

// Admin → «Κατηγορίες»: winners / υποψήφιοι / νέα / νεκρά + πλάνο ημερήσιου ad spend ανά περιοχή.
//  GET  → { plan, stats[], meta, rules }
//  POST { daily }  → αλλάζει το ημερήσιο budget του πλάνου (app_settings.ad_plan). daily=0 → αυτόματο (μ.ό. 7 ημερών).
export const maxDuration = 60
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function isAdmin() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  return !!user && isAdminEmail(user.email)
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const d = await loadTierData(db)
  const q = Number(req.nextUrl.searchParams.get('daily'))
  const daily = q > 0 ? q : d.daily
  const stats = classify(d.locs, d.bookings, d.reviews, d.prev)
  const plan = allocate(stats, daily)
  stats.sort((a, b) => b.budget - a.budget || b.n14 - a.n14 || b.n30 - a.n30)
  return NextResponse.json({ plan, stats, meta: TIER_META, rules: RULES, dailySource: q > 0 ? 'δοκιμή' : d.dailySource, prevAt: d.prevAt },
    { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { daily?: number }
  const daily = Math.max(0, Math.min(1000, Number(body.daily) || 0))
  const { error } = await db.from('app_settings').upsert({ key: 'ad_plan', value: { daily, since: new Date().toISOString() } }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, daily })
}
