import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { ipFrom, isThrottled } from '@/lib/throttle'
import { couponBlockReason } from '@/lib/coupon-guard'

// Ζωντανός έλεγχος στο checkout (κινητό / πινακίδα / συσκευή): αν το −3€ πρώτου πλυσίματος
// έχει ήδη δοθεί → { blocked: 'phone' | 'device' | 'plate' | 'phone_invalid' } και η σύνοψη
// το αφαιρεί ΑΜΕΣΩΣ. Ίδιος κανόνας με τον server στην κράτηση (lib/coupon-guard).
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    if (await isThrottled('couponcheck:' + ipFrom(req), 60, 60 * 60 * 1000)) {
      return NextResponse.json({ blocked: null })
    }
    const body = await req.json().catch(() => ({}))
    let userId: string | null = null
    try {
      const sb = await createServerClient()
      const { data: { user } } = await sb.auth.getUser()
      userId = user?.id || null
    } catch { /* επισκέπτης */ }

    const blocked = await couponBlockReason(admin, {
      userId,
      deviceId: (req.cookies.get('ws_dev')?.value || '').slice(0, 64) || null,
      plate: String(body?.plate || '').slice(0, 16),
      phone: String(body?.phone || '').slice(0, 30),
    })
    return NextResponse.json({ blocked })
  } catch {
    return NextResponse.json({ blocked: null })
  }
}
