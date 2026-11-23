import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { ipFrom, isThrottled } from '@/lib/throttle'

// Σύνδεση web → εφαρμογή (supabase/app_handoffs.sql).
//  POST {}            (συνδεδεμένος στο web) → { token }  — μιας χρήσης, λήγει σε 2 ώρες
//  POST { redeem, via } (η εφαρμογή / η σελίδα /h/…)  → { th } για verifyOtp (magic link, χωρίς email)
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/

export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({})) as { redeem?: string; via?: string }
    if (b.redeem) {
      if (await isThrottled('handoff-r:' + ipFrom(req), 20, 3600_000)) return NextResponse.json({ error: 'rate' }, { status: 429 })
      const token = String(b.redeem)
      if (!TOKEN_RE.test(token)) return NextResponse.json({ error: 'invalid' }, { status: 400 })
      // Ατομικά: μόνο αν δεν έχει χρησιμοποιηθεί και δεν έληξε.
      const { data: row } = await admin.from('app_handoffs')
        .update({ used_at: new Date().toISOString(), used_via: String(b.via || '').slice(0, 20) || null })
        .eq('token', token).is('used_at', null).gt('expires_at', new Date().toISOString())
        .select('user_id').maybeSingle()
      if (!row?.user_id) return NextResponse.json({ error: 'expired' }, { status: 410 })
      const { data: u } = await admin.auth.admin.getUserById(row.user_id)
      const email = u?.user?.email
      if (!email) return NextResponse.json({ error: 'no_user' }, { status: 404 })
      const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
      const th = data?.properties?.hashed_token
      if (error || !th) return NextResponse.json({ error: 'failed' }, { status: 500 })
      return NextResponse.json({ th })
    }
    const sb = await createServerClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user?.email) return NextResponse.json({ error: 'not_signed_in' }, { status: 401 })
    if (await isThrottled('handoff-c:' + user.id, 15, 3600_000)) return NextResponse.json({ error: 'rate' }, { status: 429 })
    const token = randomBytes(24).toString('base64url')
    const { error } = await admin.from('app_handoffs').insert({ token, user_id: user.id })
    if (error) return NextResponse.json({ error: 'failed' }, { status: 500 })
    return NextResponse.json({ token })
  } catch { return NextResponse.json({ error: 'failed' }, { status: 500 }) }
}
