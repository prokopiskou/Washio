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

    // Με κωδικό φίλου → σύνδεση referrer + −3€. ΧΩΡΙΣ κωδικό (το cookie χάθηκε: άλλος
    // browser, εφαρμογή, Apple/Google redirect, flyer, bio) → πάλι −3€ καλωσορίσματος,
    // γιατί το −3€ στο πρώτο πλύσιμο το υποσχόμαστε παντού. Το linkReferral δίνει
    // welcome ΜΟΝΟ σε χρήστη χωρίς καμία κράτηση και χωρίς προηγούμενο welcome.
    const code = req.cookies.get('ws_ref')?.value || 'WELCOME'
    await linkReferral(admin, user.id, code)

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
