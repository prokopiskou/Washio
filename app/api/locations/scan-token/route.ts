import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'

// «Σκάνερ καταστήματος»: link ανά πλυντήριο (washio.gr/s/<token>) για check-in χωρίς login.
// GET ?locationId → { token, url } (το φτιάχνει αν δεν υπάρχει) · POST { locationId } → νέο token (το παλιό σταματά).
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const url = (t: string) => `https://www.washio.gr/s/${t}`
const newToken = () => randomBytes(18).toString('base64url')

async function authorize(locationId: string) {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 }) }
  const { data: loc } = await admin.from('locations').select('id, owner_id, scan_token').eq('id', locationId).maybeSingle()
  if (!loc || (loc.owner_id !== user.id && !isAdminEmail(user.email))) return { error: NextResponse.json({ error: 'Δεν επιτρέπεται' }, { status: 403 }) }
  return { loc }
}

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get('locationId') || ''
  const a = await authorize(locationId); if (a.error) return a.error
  let t = (a.loc!.scan_token as string | null) || ''
  if (!t) {
    t = newToken()
    const { error } = await admin.from('locations').update({ scan_token: t }).eq('id', locationId)
    if (error) return NextResponse.json({ error: 'Τρέξε πρώτα το supabase/scan_token.sql' }, { status: 500 })
  }
  return NextResponse.json({ token: t, url: url(t) })
}

export async function POST(req: NextRequest) {
  const { locationId } = await req.json().catch(() => ({}))
  const a = await authorize(String(locationId || '')); if (a.error) return a.error
  const t = newToken()
  const { error } = await admin.from('locations').update({ scan_token: t }).eq('id', locationId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ token: t, url: url(t) })
}
