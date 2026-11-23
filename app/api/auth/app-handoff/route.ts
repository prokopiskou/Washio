import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { ipFrom, isThrottled } from '@/lib/throttle'

// Web → εφαρμογή ΣΥΝΔΕΔΕΜΕΝΟΣ: για τον ήδη συνδεδεμένο χρήστη φτιάχνουμε ένα μιας χρήσης
// magic-link token (δεν στέλνεται email). Ο browser ανοίγει gr.washio.app://auth-callback?open=/auth/link?token_hash=…
// → η εφαρμογή πάει στο /auth/link → verifyOtp → ίδιος λογαριασμός μέσα στην εφαρμογή.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function POST(req: NextRequest) {
  try {
    const sb = await createServerClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user?.email) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 })
    if (await isThrottled('handoff:' + user.id + ':' + ipFrom(req), 12, 3600_000)) return NextResponse.json({ error: 'rate' }, { status: 429 })
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: user.email })
    const th = data?.properties?.hashed_token
    if (error || !th) return NextResponse.json({ error: 'failed' }, { status: 500 })
    return NextResponse.json({ th })
  } catch { return NextResponse.json({ error: 'failed' }, { status: 500 }) }
}
