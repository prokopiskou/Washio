import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { athensToday } from '@/lib/time'
import { athensHHMM } from '@/lib/packs'
import { checkinCode } from '@/lib/checkin'
import { alertCritical } from '@/lib/alert'

// POST { packId } — ΜΟΝΟ μεμονωμένο πλύσιμο (washes=1) τούνελ: «Πλήρωσε στο κατάστημα».
// Κράτηση για ΤΩΡΑ (pay_at_venue) + QR. Τα πακέτα πληρώνονται μόνο με κάρτα.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function POST(req: NextRequest) {
  try {
    const sb = await createServerClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })
    const { packId } = await req.json().catch(() => ({}))

    const { data: pack } = await admin.from('wash_packs').select('id, name, washes, price, location_id, service_id, is_active, locations(name, commission_rate)')
      .eq('id', String(packId || '')).maybeSingle()
    if (!pack || !pack.is_active) return NextResponse.json({ error: 'Δεν είναι διαθέσιμο' }, { status: 404 })
    if (Number(pack.washes) !== 1) return NextResponse.json({ error: 'Τα πακέτα πληρώνονται μόνο με κάρτα' }, { status: 400 })

    const today = athensToday()
    // Ήδη ανοιχτό (μη σκαναρισμένο) σημερινό «στο κατάστημα» για το ίδιο πλύσιμο → ίδιο QR (όχι διπλές κρατήσεις).
    const { data: open } = await admin.from('bookings').select('booking_ref')
      .eq('user_id', user.id).eq('location_id', pack.location_id).eq('service_id', pack.service_id)
      .eq('slot_date', today).eq('stripe_payment_status', 'pay_at_venue').is('checked_in_at', null).neq('status', 'cancelled').limit(1)
    const loc = (pack.locations || {}) as { name?: string; commission_rate?: number }
    if (open?.[0]) {
      const ref = open[0].booking_ref as string
      return NextResponse.json({ ok: true, ref, checkin: checkinCode(ref), price: Number(pack.price), service: pack.name, location: loc.name || '', reused: true })
    }

    const price = Number(pack.price)
    const rate = Number(loc.commission_rate ?? 10)
    const bookingRef = 'WS-' + Math.random().toString(16).slice(2, 10).toUpperCase()
    const { error } = await admin.from('bookings').insert({
      booking_ref: bookingRef, user_id: user.id, location_id: pack.location_id, service_id: pack.service_id,
      slot_id: null, slot_date: today, slot_start_time: athensHHMM(), duration_minutes: 15,
      source: 'platform', car_plate: null, total_amount: price, service_price: price, addons: [],
      coupon_amount: 0, platform_fee: +(price * rate / 100).toFixed(2),
      stripe_payment_intent_id: null, stripe_payment_status: 'pay_at_venue', paid_at: null, status: 'confirmed',
    })
    if (error) {
      await alertCritical('Τούνελ: μεμονωμένο στο κατάστημα ΑΠΕΤΥΧΕ', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, ref: bookingRef, checkin: checkinCode(bookingRef), price, service: pack.name, location: loc.name || '', reused: false })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Σφάλμα' }, { status: 500 })
  }
}
