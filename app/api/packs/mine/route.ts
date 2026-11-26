import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { fulfillPackIntent } from '@/lib/packs'

// GET /api/packs/mine[?pi=pi_…] → τα πακέτα μου. Με ?pi: αυτο-ίαση αν χάθηκε το webhook.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function GET(req: NextRequest) {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })

  const piId = String(req.nextUrl.searchParams.get('pi') || '')
  if (/^pi_[A-Za-z0-9]+$/.test(piId)) {
    try {
      const pi = await stripe.paymentIntents.retrieve(piId)
      if (pi.metadata?.userId === user.id) await fulfillPackIntent(admin, pi)
    } catch { /* το webhook θα το πιάσει */ }
  }

  const { data } = await admin.from('pack_purchases')
    .select('id, name, washes_total, washes_left, price, expires_at, status, created_at, location_id, payment_intent_id, locations(name, address)')
    .eq('user_id', user.id).order('created_at', { ascending: false })
  const packs = (data || []).map((p: Record<string, unknown>) => {
    const loc = (p.locations || {}) as { name?: string; address?: string }
    return {
      id: p.id, name: p.name, total: p.washes_total, left: p.washes_left, price: p.price,
      expiresAt: p.expires_at, status: p.status, location: loc.name || '', address: loc.address || '',
      locationId: p.location_id, fresh: p.payment_intent_id === piId,
      usable: p.status === 'active' && Number(p.washes_left) > 0 && Date.parse(String(p.expires_at)) > Date.now(),
    }
  })
  return NextResponse.json({ packs })
}
