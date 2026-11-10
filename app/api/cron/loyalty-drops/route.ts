import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPush } from '@/lib/push'
import { loyaltyStatus } from '@/lib/loyalty'
import { noShowDeadline } from '@/lib/no-show'
import { athensToday } from '@/lib/time'

// Push «+1 σταγόνα» (Washio Club) για πλυσίματα που ολοκληρώθηκαν ΧΩΡΙΣ σκανάρισμα QR —
// η σταγόνα μετράει όταν κλείσει το παράθυρο «Δεν εμφανίστηκε» (τέλος της ημέρας).
// Με σκανάρισμα το push φεύγει ήδη από το /api/bookings/checkin (και σημαδεύει drop_notified_at).
// Τρέχει από το /api/cron/emails (κάθε 15'), μόνο 10:00–20:59. Μία φορά ανά κράτηση (claim στη στήλη).
// Στήλη: supabase/loyalty_push.sql
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

function ymdMinus(days: number): string {
  const [y, m, d] = athensToday().split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const athH = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  if (athH < 10 || athH > 20) return NextResponse.json({ ok: true, skipped: 'hours' })

  // Μόνο πρόσφατα (2 μέρες πίσω) — ποτέ μαζικά push για παλιό ιστορικό.
  const { data: rows, error } = await db.from('bookings')
    .select('id, user_id, location_id, slot_date, slot_start_time, status, loyalty_discount, checked_in_at, locations(name)')
    .gte('slot_date', ymdMinus(2)).lte('slot_date', athensToday())
    .not('user_id', 'is', null).is('drop_notified_at', null).is('checked_in_at', null)
    .not('status', 'in', '(cancelled,no_show)')
    .or('source.is.null,source.eq.platform')
    .limit(300)
  if (error) return NextResponse.json({ ok: false, skipped: 'column', error: error.message })

  const now = Date.now()
  let sent = 0
  for (const b of (rows || []) as unknown as {
    id: string; user_id: string; location_id: string; slot_date: string; slot_start_time: string
    loyalty_discount: number | null; locations: { name?: string } | null
  }[]) {
    if (!b.slot_date || !b.slot_start_time || now < noShowDeadline(b.slot_date, b.slot_start_time)) continue
    // Claim: αν το πήρε άλλο run, προχωράμε.
    const { data: claimed } = await db.from('bookings').update({ drop_notified_at: new Date().toISOString() })
      .eq('id', b.id).is('drop_notified_at', null).select('id')
    if (!claimed?.length) continue
    if ((Number(b.loyalty_discount) || 0) > 0) continue // πλύσιμο με το δώρο → δεν δίνει σταγόνα
    try {
      const lo = await loyaltyStatus(db, b.user_id, b.location_id)
      const place = b.locations?.name || 'το πλυντήριο'
      const body = lo.rewardNext
        ? `Μάζεψες ${lo.need} σταγόνες στο ${place} — το επόμενο πλύσιμο εκεί έχει −${lo.amount}€ 🎉`
        : `+1 σταγόνα στο ${place} (${lo.drops}/${lo.need}). Στις ${lo.need}, −${lo.amount}€ στο επόμενο.`
      await sendPush(b.user_id, { title: 'Ευχαριστούμε για το πλύσιμο 💧', body, url: '/profile/bookings' })
      sent++
    } catch { /* best-effort */ }
  }
  return NextResponse.json({ ok: true, checked: rows?.length || 0, sent })
}
