import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isInternalUser } from '@/lib/internal'

// Ένα βήμα της διαδρομής κράτησης → funnel_events. user_id μόνο από το session.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

const STEPS = new Set(['map_open', 'washer_open', 'washer_page', 'no_slots', 'service_select', 'slot_select',
  'book_click', 'login_wall', 'booking_page', 'pay_click', 'booked',
  'cancel_open', 'cancel_save_click', 'rescheduled', 'cancelled'])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const short = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[^\w-]/g, '').slice(0, n) : '') || null

function cleanMeta(m: unknown): Record<string, unknown> | null {
  if (!m || typeof m !== 'object') return null
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(m as Record<string, unknown>).slice(0, 8)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k.slice(0, 20)] = Math.round(v * 100) / 100
    else if (typeof v === 'boolean') out[k.slice(0, 20)] = v
    else if (typeof v === 'string') out[k.slice(0, 20)] = v.slice(0, 40)
  }
  return Object.keys(out).length ? out : null
}

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => null) as Record<string, unknown> | null
    const step = typeof b?.step === 'string' ? b.step : ''
    if (!STEPS.has(step)) return NextResponse.json({ ok: false }, { status: 400 })

    let userId: string | null = null
    try {
      const auth = await createServerClient()
      const { data: { user } } = await auth.auth.getUser()
      if (isInternalUser(user)) return NextResponse.json({ ok: true, skipped: 'internal' })
      userId = user?.id || null
    } catch { /* επισκέπτης */ }

    const loc = typeof b?.locationId === 'string' && UUID.test(b.locationId) ? b.locationId : null
    const { error } = await admin.from('funnel_events').insert({
      step,
      session_id: short(b?.sessionId, 40),
      device_id: short(b?.deviceId, 40),
      user_id: userId,
      location_id: loc,
      meta: cleanMeta(b?.meta),
      native: b?.native === true,
    })
    if (error) console.error('funnel insert', error.message)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
