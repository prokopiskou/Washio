import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { ipFrom, isThrottled } from '@/lib/throttle'

// Η εφαρμογή (Capacitor) ανοίγει → μία γραμμή ανά συσκευή στο app_installs (supabase/app_installs.sql).
// Μετράει ΚΑΙ όσους δεν έφτιαξαν λογαριασμό / δεν έδωσαν ειδοποιήσεις.
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function POST(req: NextRequest) {
  try {
    if (await isThrottled('appopen:' + ipFrom(req), 60, 3600_000)) return NextResponse.json({ ok: true })
    const b = await req.json().catch(() => ({})) as { device?: string; platform?: string; version?: string }
    const device = String(b.device || '').slice(0, 64)
    const platform = b.platform === 'ios' || b.platform === 'android' ? b.platform : ''
    if (!/^[a-z0-9-]{16,64}$/i.test(device) || !platform) return NextResponse.json({ ok: false }, { status: 400 })
    let userId: string | null = null
    try { const sb = await createServerClient(); const { data: { user } } = await sb.auth.getUser(); userId = user?.id || null } catch { /* επισκέπτης */ }
    const { data: ex } = await db.from('app_installs').select('opens, user_id').eq('device_id', device).maybeSingle()
    if (ex) {
      await db.from('app_installs').update({ last_open_at: new Date().toISOString(), opens: (ex.opens || 0) + 1, user_id: userId || ex.user_id, app_version: b.version?.slice(0, 20) || null }).eq('device_id', device)
    } else {
      await db.from('app_installs').insert({ device_id: device, platform, user_id: userId, app_version: b.version?.slice(0, 20) || null })
    }
    return NextResponse.json({ ok: true })
  } catch { return NextResponse.json({ ok: true }) }
}
