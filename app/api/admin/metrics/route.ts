import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'
import { windowStats, compare, verdict, logChange } from '@/lib/metrics'
import { isInternalEmail } from '@/lib/internal'

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
  return NextResponse.json({ daily: daily || [], changes: evaluated, cac: await cacSeries() })
}

// CAC: ανά μέρα (Ελλάδα) — κόστος διαφήμισης, κρατήσεις app (χωρίς ακυρωμένες / ομάδα),
// νέοι πελάτες (1η κράτηση του χρήστη ΕΚΕΙΝΗ τη μέρα). Από την 1η μέρα με κόστος διαφήμισης.
async function cacSeries() {
  const ymd = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(new Date(iso))
  const { data: spend } = await db.from('ad_spend').select('day, amount').order('day', { ascending: true })
  if (!spend?.length) return []
  const rows: { user_id: string | null; created_at: string; profiles: { email?: string | null } | null }[] = []
  for (let from = 0; from < 100000; from += 1000) {
    const { data, error } = await db.from('bookings').select('user_id, created_at, profiles(email)')
      .or('source.is.null,source.eq.platform').neq('status', 'cancelled')
      .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, from + 999)
    if (error) break
    rows.push(...((data || []) as unknown as typeof rows))
    if (!data || data.length < 1000) break
  }
  const seen = new Set<string>()
  const by = new Map<string, { bookings: number; new_customers: number }>()
  for (const b of rows) {
    if (isInternalEmail(b.profiles?.email)) continue
    const d = ymd(b.created_at)
    const e = by.get(d) || { bookings: 0, new_customers: 0 }
    e.bookings++
    if (b.user_id && !seen.has(b.user_id)) { seen.add(b.user_id); e.new_customers++ }
    by.set(d, e)
  }
  const start = String(spend[0].day), today = ymd(new Date().toISOString())
  const sp = new Map(spend.map(s => [String(s.day), Number(s.amount) || 0]))
  const out: { d: string; spend: number; bookings: number; new_customers: number }[] = []
  for (let t = Date.parse(start + 'T12:00:00Z'); ; t += 864e5) {
    const d = new Date(t).toISOString().slice(0, 10)
    if (d > today) break
    out.push({ d, spend: sp.get(d) || 0, ...(by.get(d) || { bookings: 0, new_customers: 0 }) })
  }
  return out
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
