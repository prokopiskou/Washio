import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'
import { checkSlotAvailability, shouldNotifyOwnerNow } from '@/lib/availability-server'
import { athensEpoch } from '@/lib/time'
import { sendPush, getLocationOwnerId } from '@/lib/push'

// ============================================================
// Αλλαγή ώρας κράτησης — ΜΟΝΟ μέσω server.
// Πριν, η σελίδα έγραφε slot_date/slot_start_time απευθείας: χωρίς έλεγχο
// ωραρίου/μανικών/διάρκειας, χωρίς να κοιτά αν το update απέτυχε.
// ============================================================

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TWO_HOURS = 2 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  try {
    const { bookingId, slotDate, slotStartTime } = await req.json()
    if (!bookingId || !slotDate || !slotStartTime) {
      return NextResponse.json({ error: 'Λείπουν στοιχεία' }, { status: 400 })
    }
    const hhmm = String(slotStartTime).slice(0, 5)

    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })
    const isAdmin = isAdminEmail(user.email)

    const { data: booking } = await admin
      .from('bookings')
      .select('id, user_id, location_id, service_id, slot_date, slot_start_time, status, booking_ref, locations(name)')
      .eq('id', bookingId)
      .maybeSingle()
    if (!booking) return NextResponse.json({ error: 'Η κράτηση δεν βρέθηκε' }, { status: 404 })
    if (!isAdmin && booking.user_id !== user.id) {
      return NextResponse.json({ error: 'Δεν επιτρέπεται' }, { status: 403 })
    }
    if (!['confirmed', 'pending'].includes(String(booking.status))) {
      return NextResponse.json({ error: 'Η κράτηση δεν μπορεί να αλλάξει.' }, { status: 409 })
    }

    // Κανόνας πελάτη: ≥2 ώρες πριν ΚΑΙ στο παλιό ΚΑΙ στο νέο ραντεβού.
    if (!isAdmin) {
      const now = Date.now()
      if (athensEpoch(String(booking.slot_date), String(booking.slot_start_time)) - now < TWO_HOURS) {
        return NextResponse.json({ error: 'Δεν γίνεται αλλαγή λιγότερο από 2 ώρες πριν το ραντεβού.' }, { status: 409 })
      }
      if (athensEpoch(String(slotDate), hhmm) - now < TWO_HOURS) {
        return NextResponse.json({ error: 'Διάλεξε ώρα τουλάχιστον 2 ώρες μπροστά.' }, { status: 409 })
      }
    }

    // Ωράριο / εξαιρέσεις / μάνικες / διάρκεια — κοινοί κανόνες, εξαιρώντας την ίδια.
    const availability = await checkSlotAvailability(admin, {
      locationId: booking.location_id,
      serviceId: booking.service_id,
      slotDate: String(slotDate),
      slotStartTime: hhmm,
      excludeBookingId: booking.id,
    })
    if (!availability.ok) {
      return NextResponse.json({ error: availability.error }, { status: 409 })
    }

    // Ατομική μεταφορά (κλειδαριά + επανέλεγχος πληρότητας στη βάση).
    const { error: rpcErr } = await admin.rpc('move_booking_atomic', {
      p_booking_id: booking.id, p_slot_date: slotDate, p_slot_start: hhmm,
    })
    if (rpcErr) {
      const msg = String(rpcErr.message || '')
      const code = (rpcErr as { code?: string }).code
      if (msg.includes('SLOT_FULL')) {
        return NextResponse.json({ error: 'Η ώρα δεν είναι πλέον διαθέσιμη. Διάλεξε άλλη.' }, { status: 409 })
      }
      if (msg.includes('BOOKING_NOT_ACTIVE')) {
        return NextResponse.json({ error: 'Η κράτηση δεν μπορεί να αλλάξει.' }, { status: 409 })
      }
      if (code === 'PGRST202' || code === '42883' || /could not find the function|does not exist/i.test(msg)) {
        // Η function δεν έχει τρέξει ακόμα (supabase/atomic_booking.sql) → απλό update.
        console.warn('move_booking_atomic missing — falling back to plain update. Run supabase/atomic_booking.sql!')
        const { error: updErr } = await admin.from('bookings')
          .update({ slot_date: slotDate, slot_start_time: hhmm + ':00', reminder_sent: false })
          .eq('id', booking.id)
        if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
      } else {
        return NextResponse.json({ error: msg }, { status: 500 })
      }
    }

    // Ενημέρωση πλυντηρίου (ίδιος κανόνας με νέες κρατήσεις: σήμερα + ανοιχτό).
    try {
      if (await shouldNotifyOwnerNow(admin, booking.location_id, String(slotDate))) {
        const ownerId = await getLocationOwnerId(booking.location_id)
        await sendPush(ownerId, {
          title: 'Αλλαγή ώρας κράτησης 🔄',
          body: `${booking.booking_ref} → ${hhmm} (${slotDate})`,
          url: '/dashboard',
        })
      }
    } catch { /* best-effort */ }

    return NextResponse.json({ success: true, slotDate, slotStartTime: hhmm })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Σφάλμα'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
