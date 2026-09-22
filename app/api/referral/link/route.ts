import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { linkReferral } from '@/lib/referral'

// Συνδέει έναν ΝΕΟ χρήστη με τον κωδικό παραπομπής (cookie ws_ref) — δίνει welcome
// credit και καταγράφει τον referrer. Authenticated: η ταυτότητα από το session.
// Idempotent & best-effort (το linkReferral κάνει όλους τους anti-abuse ελέγχους).
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const sb = await createServerClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    const code = req.cookies.get('ws_ref')?.value || null
    if (code) await linkReferral(admin, user.id, code)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
