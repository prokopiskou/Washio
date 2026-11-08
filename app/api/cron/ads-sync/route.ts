import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'

// Έξοδα ΑΝΑ ΔΙΑΦΗΜΙΣΗ από το Meta Marketing API → ad_spend_by_ad (+ σύνολο ημέρας → ad_spend).
// Χρειάζεται env META_ADS_TOKEN (System User token με ads_read) — το βάζεις εσύ στο Vercel.
// Τρέχει από /api/cron/emails· συγχρονίζει τις τελευταίες 3 μέρες, το πολύ μία φορά την ώρα.
// POST (admin) → συγχρονισμός τώρα (30 μέρες).
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const ACT = 'act_1007918605199290'
const V = 'v21.0'

type Row = { date_start: string; campaign_name?: string; ad_name?: string; spend?: string; inline_link_clicks?: string }

async function sync(days: number) {
  const token = process.env.META_ADS_TOKEN
  if (!token) return { ok: false, skipped: 'no META_ADS_TOKEN' }
  const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(d)
  const since = ymd(new Date(Date.now() - (days - 1) * 864e5)), until = ymd(new Date())
  const params = new URLSearchParams({
    level: 'ad', fields: 'ad_name,campaign_name,spend,inline_link_clicks', time_increment: '1',
    time_range: JSON.stringify({ since, until }), limit: '500', access_token: token,
  })
  let url: string | null = `https://graph.facebook.com/${V}/${ACT}/insights?${params}`
  const rows: Row[] = []
  for (let i = 0; url && i < 20; i++) {
    const r: Response = await fetch(url, { cache: 'no-store' })
    const j = await r.json().catch(() => ({})) as { data?: Row[]; paging?: { next?: string }; error?: { message?: string } }
    if (!r.ok || j.error) return { ok: false, error: j.error?.message || `HTTP ${r.status}` }
    rows.push(...(j.data || []))
    url = j.paging?.next || null
  }
  // Αθροισμα ανά (μέρα, καμπάνια, διαφήμιση) — ίδιο όνομα διαφήμισης σε 2 σύνολα → μία γραμμή.
  const agg = new Map<string, { day: string; campaign: string; ad_name: string; spend: number; clicks: number }>()
  for (const x of rows) {
    const k = `${x.date_start}|${x.campaign_name || ''}|${x.ad_name || ''}`
    const cur = agg.get(k) || { day: x.date_start, campaign: x.campaign_name || '', ad_name: x.ad_name || '(χωρίς όνομα)', spend: 0, clicks: 0 }
    cur.spend += Number(x.spend) || 0; cur.clicks += Number(x.inline_link_clicks) || 0
    agg.set(k, cur)
  }
  const list = [...agg.values()].map(a => ({ ...a, spend: Math.round(a.spend * 100) / 100, updated_at: new Date().toISOString() }))
  if (list.length) {
    const { error } = await db.from('ad_spend_by_ad').upsert(list)
    if (error) return { ok: false, error: error.message }
  }
  // Σύνολο ημέρας → ad_spend (το διαβάζουν οι υπόλοιπες μετρήσεις) — χωρίς να πατάει χειροκίνητες τιμές με 0.
  const byDay = new Map<string, number>()
  for (const a of list) byDay.set(a.day, (byDay.get(a.day) || 0) + a.spend)
  for (const [day, amount] of byDay) {
    if (amount > 0) await db.from('ad_spend').upsert({ day, amount: Math.round(amount * 100) / 100, source: 'meta_api', updated_at: new Date().toISOString() })
  }
  return { ok: true, rows: list.length, days: byDay.size }
}

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!process.env.META_ADS_TOKEN) return NextResponse.json({ skipped: 'no META_ADS_TOKEN' })
  const hourKey = new Date().toISOString().slice(0, 13)
  const { data: flag } = await db.from('app_settings').select('value').eq('key', 'ads_sync_last').maybeSingle()
  if ((flag?.value as { hour?: string } | null)?.hour === hourKey) return NextResponse.json({ skipped: 'recent' })
  await db.from('app_settings').upsert({ key: 'ads_sync_last', value: { hour: hourKey }, updated_at: new Date().toISOString() })
  return NextResponse.json(await sync(3))
}

export async function POST() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  return NextResponse.json(await sync(30))
}
