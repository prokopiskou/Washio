import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { sendCapiEvent } from '@/lib/meta-capi'
import { ipFrom } from '@/lib/throttle'

// Server-side CompleteRegistration → Meta CAPI. Backup του browser Pixel, ώστε
// τα sign-ups να μη χάνονται σε iOS ATT / ad-blockers. Το event_id είναι ίδιο με
// το client ('reg_' + userId) → το Meta κάνει dedup, δεν διπλομετριέται.
//
// ΑΣΦΑΛΕΙΑ: authenticated μόνο — τα email/userId έρχονται από το session (ΟΧΙ
// από τον client), οπότε δεν μπορεί κανείς να σπαμάρει ψεύτικες εγγραφές.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    let eventSourceUrl: string | null = null
    try {
      const b = await req.json()
      eventSourceUrl = typeof b?.url === 'string' ? b.url : null
    } catch { /* no body */ }

    await sendCapiEvent('CompleteRegistration', {
      eventId: 'reg_' + user.id, // ίδιο με το client Pixel → dedup
      email: user.email || null,
      externalId: user.id,
      phone: (user.phone as string | undefined) || null,
      fbp: req.cookies.get('_fbp')?.value || null,
      fbc: req.cookies.get('_fbc')?.value || null,
      clientIp: ipFrom(req) || null,
      clientUserAgent: (req.headers.get('user-agent') || '').slice(0, 350) || null,
      eventSourceUrl,
    })

    return NextResponse.json({ ok: true })
  } catch {
    // Best-effort — ποτέ δεν μπλοκάρει τον χρήστη.
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
