import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'
import { parseCheckin } from '@/lib/checkin'
import { athensToday } from '@/lib/time'
import { loyaltyStatus } from '@/lib/loyalty'
import { sendPush } from '@/lib/push'
import { rangeLabel, type RangeSvc } from '@/lib/range-price'

// Check-in με QR: το πλυντήριο σκανάρει → η κράτηση περνάει ΑΜΕΣΩΣ «Ήρθε» (χωρίς κουμπί).
// POST { code } — code = ό,τι διάβασε η κάμερα (URL / κωδικός) ή πληκτρολογημένο WS-XXXX.
// Κανόνες: μόνο κρατήσεις ΤΟΥ πλυντηρίου του χρήστη · μόνο σημερινές · όχι ακυρωμένες.
// «Δεν ήρθε» της ίδιας μέρας → διορθώνεται σε «Ήρθε» (ήρθε τελικά αργότερα).
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

type Row = {
  id: string; booking_ref: string; status: string; user_id: string | null; location_id: string
  slot_date: string; slot_start_time: string; duration_minutes: number | null
  total_amount: number | null; coupon_amount: number | null; stripe_payment_status: string | null; source: string | null
  car_plate: string | null; car_model: string | null; customer_name: string | null; customer_phone: string | null
  addons: { name: string; price: number }[] | null; checked_in_at?: string | null
  services: ({ name?: string } & NonNullable<RangeSvc>) | null; locations: { owner_id?: string; name?: string } | null
  profiles: { full_name?: string; phone?: string } | null
}

const SEL = 'id, booking_ref, status, user_id, location_id, slot_date, slot_start_time, duration_minutes, total_amount, coupon_amount, stripe_payment_status, source, car_plate, car_model, customer_name, customer_phone, addons, services(name, is_range, price_min, price_max, price_min_suv, price_max_suv), locations(owner_id, name), profiles(full_name, phone)'

function view(b: Row, extra: Record<string, unknown>) {
  const total = Number(b.total_amount) || 0
  const coupon = Number(b.coupon_amount) || 0
  const pay = b.source === 'manual' ? 'manual' : b.stripe_payment_status === 'paid' ? 'card' : b.stripe_payment_status === 'pay_at_venue' ? 'cash' : 'other'
  return {
    bookingId: b.id,
    ref: b.booking_ref,
    status: b.status,
    date: b.slot_date,
    time: String(b.slot_start_time || '').slice(0, 5),
    duration: Number(b.duration_minutes) || 30,
    service: b.services?.name || 'Υπηρεσία',
    addons: (b.addons || []).map(a => a?.name).filter(Boolean),
    plate: b.car_plate || '',
    car: b.car_model || '',
    name: b.customer_name || b.profiles?.full_name || '',
    phone: b.customer_phone || b.profiles?.phone || '',
    pay,
    collect: pay === 'cash' ? Math.max(0, total - coupon) : 0,
    range: rangeLabel(b.total_amount, b.services),
    location: b.locations?.name || '',
    ...extra,
  }
}

export async function POST(req: NextRequest) {
  try {
    const { code, via } = await req.json().catch(() => ({}))
    const p = parseCheckin(String(code || ''))
    if (!p) return NextResponse.json({ ok: false, error: 'Μη έγκυρος κωδικός QR' }, { status: 400 })

    const sb = await createServerClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ ok: false, error: 'Απαιτείται σύνδεση' }, { status: 401 })

    let res = await admin.from('bookings').select(SEL + ', checked_in_at').eq('booking_ref', p.ref).maybeSingle()
    const hasCol = !res.error
    if (res.error) res = await admin.from('bookings').select(SEL).eq('booking_ref', p.ref).maybeSingle()
    const b = res.data as unknown as Row | null
    if (!b) return NextResponse.json({ ok: false, error: 'Η κράτηση δεν βρέθηκε' }, { status: 404 })

    // Από link (κάμερα κινητού → /c/...): ΜΟΝΟ ο ιδιοκτήτης — ο admin που ανοίγει QR πελάτη δεν κάνει check-in.
    const isOwner = b.locations?.owner_id === user.id
    if (!isOwner && (via === 'link' || !isAdminEmail(user.email))) {
      return NextResponse.json({ ok: false, error: 'Η κράτηση δεν είναι για το πλυντήριό σου' }, { status: 403 })
    }
    if (b.status === 'cancelled') {
      return NextResponse.json({ ok: false, error: 'Η κράτηση έχει ακυρωθεί', booking: view(b, {}) }, { status: 409 })
    }
    const today = athensToday()
    if (b.slot_date !== today) {
      const [y, m, d] = String(b.slot_date).split('-')
      return NextResponse.json({ ok: false, error: `Η κράτηση είναι για ${d}/${m}/${y} — όχι για σήμερα`, booking: view(b, {}) }, { status: 409 })
    }
    if (hasCol && b.checked_in_at) {
      return NextResponse.json({ ok: true, already: true, booking: view(b, { checkedInAt: b.checked_in_at }) })
    }
    if (!hasCol) {
      return NextResponse.json({ ok: false, error: 'Το check-in δεν έχει ενεργοποιηθεί ακόμα (supabase/checkin.sql)' }, { status: 500 })
    }

    const now = new Date().toISOString()
    const { data: upd, error: updErr } = await admin.from('bookings')
      .update({ checked_in_at: now, checked_in_by: user.id, status: 'confirmed' })
      .eq('id', b.id).is('checked_in_at', null).in('status', ['confirmed', 'pending', 'no_show'])
      .select('id')
    if (updErr) return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 })
    if (!upd || upd.length === 0) {
      return NextResponse.json({ ok: true, already: true, booking: view(b, { checkedInAt: now }) })
    }

    // Push στον πελάτη: καλωσόρισμα + σταγόνα Washio Club (best-effort).
    if (b.user_id && b.source !== 'manual') {
      try {
        const lo = await loyaltyStatus(admin, b.user_id, b.location_id)
        const place = b.locations?.name || 'το πλυντήριο'
        const body = lo.rewardNext
          ? `Μάζεψες ${lo.need} σταγόνες στο ${place} — το επόμενο πλύσιμο εκεί έχει −${lo.amount}€ 🎉`
          : `+1 σταγόνα στο ${place} (${lo.drops}/${lo.need}). Στις ${lo.need}, −${lo.amount}€ στο επόμενο.`
        await sendPush(b.user_id, { title: 'Καλό πλύσιμο! 💧', body, url: '/profile/bookings' })
      } catch { /* best-effort */ }
    }

    return NextResponse.json({ ok: true, already: false, wasNoShow: b.status === 'no_show', booking: view(b, { checkedInAt: now, status: 'confirmed' }) })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Σφάλμα' }, { status: 500 })
  }
}
