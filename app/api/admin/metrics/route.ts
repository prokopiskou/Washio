import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'
import { windowStats, compare, verdict, logChange } from '@/lib/metrics'

// Admin → «Μετρήσεις»
//  GET  → { daily[], changes[] (με πριν/μετά + ετυμηγορία) }
//  POST { action: 'change', title, area, at? } · { action: 'spend', day, amount } · { action: 'delete_change', id }
export const maxDuration = 60
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function adminUser() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  return user && isAdminEmail(user.email) ? user : null
}

export async function GET() {
  if (!(await adminUser())) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const [{ data: daily, error: dErr }, { data: changes }] = await Promise.all([
    db.rpc('metrics_daily', { p_days: 21 }),
    db.from('change_log').select('*').order('at', { ascending: false }).limit(25),
  ])
  if (dErr) return NextResponse.json({ error: 'Τρέξε το supabase/metrics.sql — ' + dErr.message }, { status: 500 })
  const now = Date.now()
  const evaluated = await Promise.all((changes || []).slice(0, 15).map(async (c: { id: string; at: string; title: string; area: string | null; source: string }) => {
    const at = new Date(c.at).getTime()
    const end = Math.min(at + 7 * 864e5, now)
    if (end - at < 3 * 3600_000) return { ...c, days: 0, rows: [], verdict: { text: 'Μόλις άρχισε', tone: 'wait' } }
    const [before, after] = await Promise.all([
      windowStats(db, new Date(at - 7 * 864e5), new Date(end - 7 * 864e5)),
      windowStats(db, new Date(at), new Date(end)),
    ])
    const days = Math.round((end - at) / 864e5 * 10) / 10
    const rows = compare(before, after)
    return { ...c, days, before, after, rows, verdict: verdict(c.area, rows, days) }
  }))
  return NextResponse.json({ daily: daily || [], changes: evaluated })
}

export async function POST(req: NextRequest) {
  const user = await adminUser()
  if (!user) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { action?: string; title?: string; area?: string; at?: string; day?: string; amount?: number; id?: string }
  if (b.action === 'change') {
    if (!b.title?.trim()) return NextResponse.json({ error: 'Γράψε τι άλλαξε' }, { status: 400 })
    await logChange(db, { title: b.title.trim(), area: b.area, source: 'admin', by: user.email, at: b.at })
    return NextResponse.json({ ok: true })
  }
  if (b.action === 'spend') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.day)) || !(Number(b.amount) >= 0)) return NextResponse.json({ error: 'Λάθος μέρα/ποσό' }, { status: 400 })
    const { error } = await db.from('ad_spend').upsert({ day: b.day, amount: Number(b.amount), source: 'manual', updated_at: new Date().toISOString() })
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }
  if (b.action === 'delete_change') {
    const { error } = await db.from('change_log').delete().eq('id', b.id || '')
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Άγνωστη ενέργεια' }, { status: 400 })
}
