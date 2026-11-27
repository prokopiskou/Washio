import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { alertCritical } from '@/lib/alert'

// POST { packId } → PaymentIntent (kind=pack). Η τιμή ΜΟΝΟ από τη βάση.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function POST(req: NextRequest) {
  try {
    const { packId } = await req.json().catch(() => ({}))
    const sb = await createServerClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })

    const { data: pack } = await admin.from('wash_packs').select('id, name, washes, price, location_id, is_active, locations(name)')
      .eq('id', String(packId || '')).maybeSingle()
    if (!pack || !pack.is_active) return NextResponse.json({ error: 'Το πακέτο δεν είναι διαθέσιμο' }, { status: 404 })

    // Stripe customer (για αποθηκευμένες κάρτες) — best-effort.
    let customerId: string | undefined
    try {
      if (user.email) {
        const ex = await stripe.customers.list({ email: user.email, limit: 100 })
        customerId = ex.data.find(c => c.metadata?.supabaseUserId === user.id)?.id
      }
      if (!customerId) customerId = (await stripe.customers.create({ email: user.email || undefined, metadata: { supabaseUserId: user.id } })).id
    } catch { customerId = undefined }
    // Αποθηκευμένες κάρτες (1-tap) — ίδιο με το checkout κράτησης (create-intent).
    let customerSessionClientSecret: string | undefined
    if (customerId) {
      try {
        const cs = await stripe.customerSessions.create({
          customer: customerId,
          components: { payment_element: { enabled: true, features: {
            payment_method_redisplay: 'enabled',
            payment_method_allow_redisplay_filters: ['always', 'limited', 'unspecified'],
            payment_method_save: 'disabled', payment_method_remove: 'enabled',
          } } },
        })
        customerSessionClientSecret = cs.client_secret
      } catch { /* χωρίς αποθηκευμένες */ }
    }

    const price = Number(pack.price)
    const locName = (pack.locations as { name?: string } | null)?.name || ''
    const pi = await stripe.paymentIntents.create({
      amount: Math.round(price * 100),
      currency: 'eur',
      payment_method_types: ['card'],
      ...(customerId ? { customer: customerId } : {}),
      description: `Washio · ${pack.name} · ${locName}`.slice(0, 200),
      metadata: {
        kind: 'pack', packId: pack.id, locationId: '', // locationId κενό: το fulfill κρατήσεων το αγνοεί
        packLocationId: pack.location_id, userId: user.id, userEmail: user.email || '',
        price: price.toString(), washes: String(pack.washes), name: String(pack.name).slice(0, 100),
      },
    })
    return NextResponse.json({ clientSecret: pi.client_secret, customerSessionClientSecret, price, name: pack.name, location: locName })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Σφάλμα'
    await alertCritical('Αποτυχία πακέτου (intent)', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
