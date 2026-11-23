import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { ipFrom, isThrottled } from '@/lib/throttle'

// Επισκέπτης στην εφαρμογή (χωρίς λογαριασμό) έδωσε άδεια ειδοποιήσεων → FCM token ανά συσκευή
// (supabase/guest_push_tokens.sql). Αν είναι συνδεδεμένος, γράφεται και το user_id.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function POST(req: NextRequest) {
  try {
    if (await isThrottled('guestpush:' + ipFrom(req), 20, 3600_000)) return NextResponse.json({ ok: true })
    const b = await req.json().catch(() => ({})) as { token?: string; platform?: string; device?: string }
    const token = String(b.token || '').slice(0, 400)
    const device = String(b.device || '').slice(0, 64)
    if (token.length < 20 || !/^[a-z0-9-]{16,64}$/i.test(device)) return NextResponse.json({ ok: false }, { status: 400 })
    let userId: string | null = null
    try { const sb = await createServerClient(); const { data: { user } } = await sb.auth.getUser(); userId = user?.id || null } catch { /* επισκέπτης */ }
    await admin.from('guest_push_tokens').delete().eq('token', token).neq('device_id', device)
    await admin.from('guest_push_tokens').upsert({
      device_id: device, token, platform: b.platform === 'android' ? 'android' : 'ios',
      updated_at: new Date().toISOString(), ...(userId ? { user_id: userId } : {}),
    }, { onConflict: 'device_id' })
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ ok: false }, { status: 500 }) }
}
