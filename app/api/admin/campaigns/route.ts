import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'
import { campaignAudience, recipientsFor, sendCampaignTo, type Campaign } from '@/lib/campaign-send'

// Admin: προεπισκόπηση / δοκιμή καμπάνιας ΠΡΙΝ φύγει.
//  GET  ?id=<campaign>            → πόσοι θα τη λάβουν (σύνολο / push / email)
//  POST { id, mode: 'test' }      → στέλνει ΜΟΝΟ στον συνδεδεμένο admin (email + push), χωρίς καταγραφή
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function admin() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  return user && isAdminEmail(user.email) ? user : null
}

export async function GET(req: NextRequest) {
  if (!(await admin())) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const { data: c } = await db.from('campaigns').select('*').eq('id', req.nextUrl.searchParams.get('id') || '').maybeSingle()
  if (!c) return NextResponse.json({ error: 'Δεν βρέθηκε' }, { status: 404 })
  const people = await campaignAudience(db, c as Campaign)
  return NextResponse.json({
    channel: (c as Campaign).channels[0], status: c.status, scheduled_at: c.scheduled_at,
    total: people.length, push: recipientsFor(people, 'push').length, email_only: recipientsFor(people, 'email').length,
    this_wave: recipientsFor(people, (c as Campaign).channels[0]).length,
  })
}

export async function POST(req: NextRequest) {
  const user = await admin()
  if (!user) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { id?: string; mode?: string }
  const { data: c } = await db.from('campaigns').select('*').eq('id', b.id || '').maybeSingle()
  if (!c) return NextResponse.json({ error: 'Δεν βρέθηκε' }, { status: 404 })
  if (b.mode !== 'test') return NextResponse.json({ error: 'Άγνωστη ενέργεια' }, { status: 400 })
  const me = { user_id: user.id, email: user.email || null, can_push: true, can_email: true }
  // Δοκιμή: και τα δύο κανάλια στον admin (να δει και το email και το push).
  const email = await sendCampaignTo(db, { ...(c as Campaign), channels: ['email'] }, [me], { record: false })
  const push = await sendCampaignTo(db, { ...(c as Campaign), channels: ['push'] }, [me], { record: false })
  return NextResponse.json({ ok: true, email, push })
}
