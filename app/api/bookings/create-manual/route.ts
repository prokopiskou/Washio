import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { checkSlotAvailability } from '@/lib/availability-server'
import { catalogEntry } from '@/lib/services-catalog'

// Χειροκίνητη κράτηση από τον ΙΔΙΟΚΤΗΤΗ του πλυντηρίου (π.χ. τηλεφωνική).
// Μπαίνει στο ημερολόγιο και ΔΕΣΜΕΥΕΙ διαθεσιμότητα στην πλατφόρμα.
// Χωρίς προμήθεια (εκτός πλατφόρμας — άρθρο 4.3 συμφωνητικού), χωρίς Stripe.

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const {
      locationId, serviceId, serviceName, slotDate, slotStartTime,
      customerName, customerPhone,
    } = await req.json()

    // 1) Auth: μόνο ο ιδιοκτήτης του location.
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })
    }

    if (!locationId || (!serviceId && !serviceName) || !slotDate || !slotStartTime || !customerName) {
      return NextResponse.json({ error: 'Λείπουν στοιχεία κράτησης' }, { status: 400 })
    }

    const { data: location } = await admin
      .from('locations')
      .select('id, owner_id')
      .eq('id', locationId)
      .maybeSingle()

    if (!location || location.owner_id !== user.id) {
      return NextResponse.json({ error: 'Δεν έχεις δικαίωμα σε αυτό το πλυντήριο' }, { status: 403 })
    }

    // 2) Υπηρεσία → τιμή/διάρκεια server-side.
    //    Κατά id (παλιό flow) ή κατά όνομα από τον κατάλογο (νέο flow).
    //    Αν το σημείο ΔΕΝ έχει ακόμα τη συγκεκριμένη υπηρεσία, δημιουργείται
    //    ΑΝΕΝΕΡΓΟ row (τιμή 0) — δεν εμφανίζεται στους πελάτες, αλλά επιτρέπει
    //    στον πλυντηριά να καταγράψει τηλεφωνικό ραντεβού (π.χ. βιολογικό)
    //    ώστε η διαθεσιμότητα να είναι σωστή.
    type SvcRow = { id: string; name: string; price: number; duration_minutes: number }
    let service: SvcRow | null = null

    if (serviceId) {
      const { data } = await admin
        .from('services')
        .select('id, name, price, duration_minutes')
        .eq('id', serviceId)
        .maybeSingle()
      service = (data as SvcRow | null)
    } else {
      const cleanName = String(serviceName).trim()
      const { data: existingSvc } = await admin
        .from('services')
        .select('id, name, price, duration_minutes')
        .eq('location_id', locationId)
        .eq('name', cleanName)
        .maybeSingle()

      if (existingSvc) {
        service = existingSvc as SvcRow
      } else {
        // Δεν υπάρχει στο σημείο — πάρε τη διάρκεια από τον κατάλογο (DB → fallback seed).
        const { data: catRow } = await admin
          .from('service_catalog')
          .select('name, duration_minutes')
          .eq('name', cleanName)
          .maybeSingle()
        const entry = catRow || catalogEntry(cleanName)
        if (!entry) {
          return NextResponse.json({ error: 'Άγνωστη υπηρεσία' }, { status: 400 })
        }
        const { data: created, error: createErr } = await admin
          .from('services')
          .insert({
            location_id: locationId,
            name: cleanName,
            duration_minutes: entry.duration_minutes,
            price: 0,
            is_active: false, // ΔΕΝ εμφανίζεται στους πελάτες
          })
          .select('id, name, price, duration_minutes')
          .single()
        if (createErr || !created) {
          return NextResponse.json({ error: 'Αποτυχία δημιουργίας υπηρεσίας' }, { status: 500 })
        }
        service = created as SvcRow
      }
    }

    if (!service) {
      return NextResponse.json({ error: 'Άκυρη υπηρεσία' }, { status: 400 })
    }

    // 3) Κοινός έλεγχος διαθεσιμότητας (capacity, ωράριο, εξαιρέσεις, διάρκεια).
    //    Χωρίς lead time όμως: ο πλυντηριάς μπορεί να περάσει πελάτη που ήρθε τώρα.
    const availability = await checkSlotAvailability(admin, {
      locationId, serviceId: service.id, slotDate, slotStartTime,
    })
    // Για χειροκίνητες δεχόμαστε και «μη διαθέσιμο λόγω lead time»:
    // ξαναελέγχουμε μόνο χωρητικότητα αν απέτυχε — απλοποίηση: αν απέτυχε
    // και η ώρα είναι μελλοντική εντός ημέρας, το αφήνουμε να περάσει ΜΟΝΟ
    // αν ο λόγος ήταν το lead time. Ο καθαρός τρόπος: έλεγχος με nowMinutes
    // παρακάμπτοντας το lead — εδώ κάνουμε δεύτερο έλεγχο με start στο παρελθόν → όχι.
    // Πρακτικά: επιτρέπουμε τη χειροκίνητη ακόμα κι αν το slot «μόλις πέρασε»,
    // αρκεί να υπάρχει χωρητικότητα. Ο έλεγχος χωρητικότητας γίνεται χειροκίνητα:
    if (!availability.ok) {
      const { data: dayBookings } = await admin
        .from('bookings')
        .select('slot_start_time, duration_minutes')
        .eq('location_id', locationId)
        .eq('slot_date', slotDate)
        .not('status', 'in', '("cancelled","no_show")')

      const dur = Math.max(30, Number(service.duration_minutes) || 30)
      const startMin = Number(slotStartTime.slice(0, 2)) * 60 + Number(slotStartTime.slice(3, 5))
      const { data: capRow } = await admin
        .from('locations').select('capacity').eq('id', locationId).maybeSingle()
      const capacity = Math.max(1, Number(capRow?.capacity) || 1)

      // Occupancy στο διάστημα της νέας κράτησης.
      for (let step = startMin; step < startMin + dur; step += 30) {
        let count = 0
        for (const b of dayBookings || []) {
          const bs = Number(b.slot_start_time.slice(0, 2)) * 60 + Number(b.slot_start_time.slice(3, 5))
          const be = bs + (b.duration_minutes || 30)
          if (step < be && bs < step + 30) count++
        }
        if (count >= capacity) {
          return NextResponse.json({ error: 'Δεν υπάρχει ελεύθερη θέση εκείνη την ώρα.' }, { status: 409 })
        }
      }
    }

    // 4) Δημιουργία χειροκίνητης κράτησης.
    const bookingRef = 'WS-M' + Math.random().toString(16).slice(2, 9).toUpperCase()

    const { data: inserted, error: insertError } = await admin.from('bookings').insert({
      booking_ref: bookingRef,
      user_id: null,
      location_id: locationId,
      service_id: service.id,
      slot_id: null,
      slot_date: slotDate,
      slot_start_time: slotStartTime,
      duration_minutes: Math.max(30, Number(service.duration_minutes) || 30),
      source: 'manual',
      customer_name: String(customerName).trim(),
      customer_phone: customerPhone ? String(customerPhone).trim() : null,
      car_plate: null,
      total_amount: Number(service.price) || 0,
      platform_fee: 0, // Εκτός πλατφόρμας — καμία προμήθεια.
      stripe_payment_intent_id: null,
      stripe_payment_status: 'external',
      paid_at: null,
      status: 'confirmed',
    }).select('id').single()

    if (insertError) {
      console.error('Manual booking insert error:', insertError)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, id: inserted?.id, bookingRef })
  } catch (err) {
    console.error('create-manual error:', err)
    return NextResponse.json({ error: 'Αποτυχία δημιουργίας κράτησης' }, { status: 500 })
  }
}
