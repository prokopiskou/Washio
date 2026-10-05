import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'
import { athensEpoch } from '@/lib/time'
import { NO_SHOW_FROM_MIN, NO_SHOW_UNTIL_MIN } from '@/lib/no-show'
import { revokeReferrerReward } from '@/lib/referral-server'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { bookingId } = await req.json()
    if (!bookingId) {
      return NextResponse.json({ error: 'Λείπει η κράτηση' }, { status: 400 })
    }

    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })
    }

    const { data: booking, error: fetchError } = await admin
      .from('bookings')
      .select('id, status, location_id, slot_date, slot_start_time, locations(owner_id)')
      .eq('id', bookingId)
      .single()

    if (fetchError || !booking) {
      return NextResponse.json({ error: 'Η κράτηση δεν βρέθηκε' }, { status: 404 })
    }

    const ownerId = (booking.locations as { owner_id?: string } | null)?.owner_id
    if (ownerId !== user.id && !isAdminEmail(user.email)) {
      return NextResponse.json({ error: 'Δεν επιτρέπεται' }, { status: 403 })
    }

    if (booking.status === 'no_show') {
      return NextResponse.json({ ok: true, status: 'no_show' })
    }
    if (booking.status === 'cancelled') {
      return NextResponse.json({ error: 'Η κράτηση έχει ακυρωθεί' }, { status: 409 })
    }
    if (booking.status !== 'confirmed' && booking.status !== 'pending') {
      return NextResponse.json({ error: 'Η κράτηση δεν μπορεί να σημειωθεί ως μη εμφάνιση' }, { status: 409 })
    }

    // Παράθυρο 15'–45' μετά την ώρα του ραντεβού (εκτός admin). Μετά → θεωρείται ολοκληρωμένη.
    if (!isAdminEmail(user.email) && booking.slot_date && booking.slot_start_time) {
      const start = athensEpoch(booking.slot_date as string, booking.slot_start_time as string)
      const now = Date.now()
      if (now < start + NO_SHOW_FROM_MIN * 60_000) {
        return NextResponse.json({ error: `Μπορείς να το δηλώσεις ${NO_SHOW_FROM_MIN}' μετά την ώρα του ραντεβού.` }, { status: 409 })
      }
      if (now > start + NO_SHOW_UNTIL_MIN * 60_000) {
        return NextResponse.json({ error: 'closed' }, { status: 409 })
      }
    }

    const { error: updateError } = await admin
      .from('bookings')
      .update({ status: 'no_show' })
      .eq('id', bookingId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // No-show δεν μετράει ως «έκλεισε ο φίλος» → αφαίρεση επιβράβευσης referrer.
    await revokeReferrerReward(admin, bookingId)

    return NextResponse.json({ ok: true, status: 'no_show' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Σφάλμα'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
