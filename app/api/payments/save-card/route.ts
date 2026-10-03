import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Συγκατάθεση «Αποθήκευση κάρτας για επόμενες πληρωμές» (checkbox στο checkout).
// Καλείται ΑΜΕΣΩΣ πριν το confirmPayment. Αν save=true → setup_future_usage=off_session
// στο PaymentIntent (το Stripe κάνει attach την κάρτα στον customer μετά την πληρωμή)
// και metadata.saveCard=1 (το webhook τη σημαδεύει allow_redisplay=always → εμφανίζεται
// την επόμενη φορά). save=false → τίποτα δεν αποθηκεύεται.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })

    const { paymentIntentId, save } = await req.json()
    if (typeof paymentIntentId !== 'string' || !/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) {
      return NextResponse.json({ error: 'Άκυρο αίτημα' }, { status: 400 })
    }
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
    // Μόνο ο ιδιοκτήτης του intent, και μόνο πριν πληρωθεί.
    if (pi.metadata?.userId !== user.id) return NextResponse.json({ error: 'Δεν επιτρέπεται' }, { status: 403 })
    if (pi.status === 'succeeded' || pi.status === 'canceled') return NextResponse.json({ ok: true, skipped: true })

    const wantSave = save === true && !!pi.customer
    const already = pi.setup_future_usage === 'off_session'
    if (wantSave !== already || (pi.metadata?.saveCard === '1') !== wantSave) {
      await stripe.paymentIntents.update(paymentIntentId, {
        // '' = αφαίρεση (αν ο χρήστης ξε-τσέκαρε).
        setup_future_usage: wantSave ? 'off_session' : ('' as unknown as Stripe.PaymentIntentUpdateParams.SetupFutureUsage),
        metadata: { saveCard: wantSave ? '1' : '0' },
      })
    }
    return NextResponse.json({ ok: true, save: wantSave })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Σφάλμα' }, { status: 500 })
  }
}
