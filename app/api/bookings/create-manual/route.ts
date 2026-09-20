import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { catalogEntry } from '@/lib/services-catalog'
import { isAdminEmail } from '@/lib/admins'

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

    // Ιδιοκτήτης ή admin (support mode).
    if (!location || (location.owner_id !== user.id && !isAdminEmail(user.email))) {
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
      // limit(1) — ανθεκτικό σε τυχόν διπλά rows.
      const { data: existingSvcRows } = await admin
        .from('services')
        .select('id, name, price, duration_minutes')
        .eq('location_id', locationId)
        .eq('name', cleanName)
        .limit(1)
      const existingSvc = existingSvcRows?.[0]

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

    // 3) ΚΑΝΕΝΑΣ έλεγχος διαθεσιμότητας για χειροκίνητες κρατήσεις.
    //    Ο ιδιοκτήτης ξέρει το μαγαζί του: βάζει ραντεβού όποτε θέλει,
    //    ακόμα κι αν η ώρα είναι «γεμάτη» κατά το capacity, εκτός ωραρίου,
    //    ή μέσα σε εξαίρεση. Το όριο των μανικών ισχύει ΜΟΝΟ για τους
    //    πελάτες της πλατφόρμας — και η χειροκίνητη κράτηση ΜΕΤΡΑΕΙ
    //    κανονικά στο occupancy τους: αν με 2 μάνικες υπάρχουν ήδη 2
    //    ραντεβού (από όπου κι αν ήρθαν), η ώρα κλείνει για την εφαρμογή.

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
