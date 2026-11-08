import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'
import { getCheckoutConfig } from '@/lib/checkout-config'
import { logChange } from '@/lib/metrics'

// Admin: ρύθμιση checkout + αναφορά «πριν / μετά» την τελευταία αλλαγή.
//  GET            → { config, report: { after, before } }
//  POST { defaultPay, cardFee } → αλλαγή (since = τώρα → νέα περίοδος σύγκρισης)
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const TEAM = /(withinsuccess|prokopis71|giwrgos2070|alexandr\.sph|sk5vhy6dhz|g7cbwtydrr|\+test)/i

async function adminUser() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  return user && isAdminEmail(user.email) ? user : null
}

type Bk = { status: string; stripe_payment_status: string | null; total_amount: number | null; coupon_amount: number | null; platform_fee: number | null; user_id: string | null; profiles: { email?: string | null } | null }

async function windowStats(from: Date, to: Date) {
  // Επισκέπτες checkout (μοναδικοί) — funnel booking_page
  const { data: fe } = await db.from('funnel_events').select('device_id, user_id').eq('step', 'booking_page')
    .gte('created_at', from.toISOString()).lt('created_at', to.toISOString()).limit(20000)
  const visitors = new Set((fe || []).map((r: { device_id: string | null; user_id: string | null }) => r.device_id || r.user_id || '')).size
  const { data: bks } = await db.from('bookings').select('status, stripe_payment_status, total_amount, coupon_amount, platform_fee, user_id, profiles(email)')
    .or('source.is.null,source.neq.manual').gte('created_at', from.toISOString()).lt('created_at', to.toISOString()).limit(5000)
  const rows = ((bks || []) as unknown as Bk[]).filter(b => !TEAM.test(String(b.profiles?.email || '')))
  const card = rows.filter(b => b.stripe_payment_status === 'paid' || b.stripe_payment_status === 'refunded')
  const venue = rows.filter(b => b.stripe_payment_status === 'pay_at_venue')
  const rate = (arr: Bk[], st: string) => arr.length ? Math.round(100 * arr.filter(b => b.status === st).length / arr.length) : null
  const commission = rows.filter(b => b.status !== 'cancelled').reduce((s, b) => s + (Number(b.platform_fee) || 0), 0)
  // Κόστος Stripe (εκτίμηση): 1,5% + 0,25€ ανά πληρωμή κάρτας
  const stripeCost = card.reduce((s, b) => s + 0.015 * Math.max(0, (Number(b.total_amount) || 0) - (Number(b.coupon_amount) || 0)) + 0.25, 0)
  return {
    days: Math.max(1, Math.round((to.getTime() - from.getTime()) / 864e5)),
    visitors, bookings: rows.length,
    conversion: visitors ? Math.round(100 * rows.length / visitors) : null,
    cardShare: rows.length ? Math.round(100 * card.length / rows.length) : null,
    card: { n: card.length, cancelled: rate(card, 'cancelled'), noShow: rate(card, 'no_show') },
    venue: { n: venue.length, cancelled: rate(venue, 'cancelled'), noShow: rate(venue, 'no_show') },
    netPerVisitor: visitors ? Math.round(100 * (commission - stripeCost) / visitors) / 100 : null,
    commission: Math.round(commission * 100) / 100, stripeCost: Math.round(stripeCost * 100) / 100,
  }
}

export async function GET() {
  if (!(await adminUser())) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const config = await getCheckoutConfig(db)
  const now = new Date()
  const since = config.since ? new Date(config.since) : new Date(now.getTime() - 7 * 864e5)
  const len = Math.max(864e5, now.getTime() - since.getTime())
  const before = new Date(since.getTime() - len)
  const [after, prev] = await Promise.all([windowStats(since, now), windowStats(before, since)])
  return NextResponse.json({ config, report: { after, before: prev, since: since.toISOString(), beforeFrom: before.toISOString() } })
}

export async function POST(req: NextRequest) {
  const user = await adminUser()
  if (!user) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { defaultPay?: string; cardFee?: boolean }
  const value = { default_pay: b.defaultPay === 'venue' ? 'venue' : 'card', card_fee: b.cardFee === true, since: new Date().toISOString() }
  const { error } = await db.from('app_settings').upsert({ key: 'checkout', value, updated_at: new Date().toISOString(), updated_by: user.email })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await logChange(db, { title: `Checkout: προεπιλογή ${value.default_pay === 'card' ? 'κάρτα' : 'στο πλυντήριο'}, τέλος κάρτας ${value.card_fee ? 'ναι' : 'όχι'}`, area: 'checkout', source: 'admin', by: user.email })
  return NextResponse.json({ ok: true })
}
