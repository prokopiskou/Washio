import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Dashboard πλυντηρίου → «Ενημερώσεις».
//  GET            → οι ενημερώσεις του συνδεδεμένου ιδιοκτήτη (μη διαβασμένες πρώτα) · σημειώνει «άνοιξε»
//  POST { id }    → «Το διάβασα ✓»
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function me() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  return user
}

export async function GET() {
  const user = await me()
  if (!user) return NextResponse.json({ items: [] })
  const { data, error } = await db.from('announcement_receipts')
    .select('id, sent_at, opened_at, acked_at, announcements(title, body, important, created_at), locations(name)')
    .eq('owner_id', user.id).order('sent_at', { ascending: false }).limit(50)
  if (error) return NextResponse.json({ items: [] })
  const unopened = (data || []).filter((r: { opened_at: string | null }) => !r.opened_at).map((r: { id: string }) => r.id)
  if (unopened.length) await db.from('announcement_receipts').update({ opened_at: new Date().toISOString() }).in('id', unopened)
  const items = (data || []).map((r: Record<string, unknown>) => {
    const a = r.announcements as { title: string; body: string; important: boolean } | null
    return { id: r.id, sentAt: r.sent_at, ackedAt: r.acked_at, title: a?.title || '', body: a?.body || '', important: !!a?.important, location: (r.locations as { name?: string } | null)?.name || '' }
  }).sort((x, y) => Number(!!x.ackedAt) - Number(!!y.ackedAt))
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Σύνδεση' }, { status: 401 })
  const b = await req.json().catch(() => ({})) as { id?: string }
  const { error } = await db.from('announcement_receipts').update({ acked_at: new Date().toISOString(), acked_by: user.email })
    .eq('id', b.id || '').eq('owner_id', user.id).is('acked_at', null)
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
}
