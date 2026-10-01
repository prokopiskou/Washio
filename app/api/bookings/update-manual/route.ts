import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { catalogEntry } from '@/lib/services-catalog'
import { isAdminEmail } from '@/lib/admins'

// Επεξεργασία / διαγραφή ΧΕΙΡΟΚΙΝΗΤΗΣ κράτησης από τον ιδιοκτήτη του πλυντηρίου.
// Αφορά ΜΟΝΟ κρατήσεις source = 'manual' (τηλέφωνο/πάγκος) — οι κρατήσεις της
// πλατφόρμας (πληρωμές, κουπόνια, ειδοποιήσεις πελάτη) ΔΕΝ αλλάζουν από εδώ.

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { bookingId, action } = body as { bookingId?: string; action?: 'update' | 'delete' }

    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })
    if (!bookingId) return NextResponse.json({ error: 'Λείπει η κράτηση' }, { status: 400 })

    const { data: booking } = await admin
      .from('bookings')
      .select('id, location_id, source, status')
      .eq('id', bookingId)
      .maybeSingle()
    if (!booking) return NextResponse.json({ error: 'Η κράτηση δεν βρέθηκε' }, { status: 404 })
    if (booking.source !== 'manual') {
      return NextResponse.json({ error: 'Μόνο οι χειροκίνητες κρατήσεις αλλάζουν από εδώ' }, { status: 400 })
    }

    const { data: location } = await admin
      .from('locations').select('id, owner_id').eq('id', booking.location_id).maybeSingle()
    if (!location || (location.owner_id !== user.id && !isAdminEmail(user.email))) {
      return NextResponse.json({ error: 'Δεν έχεις δικαίωμα σε αυτό το πλυντήριο' }, { status: 403 })
    }

    // Διαγραφή = ακύρωση (κρατάμε ιστορικό, ελευθερώνει αμέσως την ώρα).
    if (action === 'delete') {
      const { error } = await admin.from('bookings').update({ status: 'cancelled' }).eq('id', bookingId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    const { serviceName, slotDate, slotStartTime, customerName, customerPhone } = body as {
      serviceName?: string; slotDate?: string; slotStartTime?: string; customerName?: string; customerPhone?: string | null
    }
    if (!serviceName || !slotDate || !slotStartTime || !customerName?.trim()) {
      return NextResponse.json({ error: 'Συμπλήρωσε υπηρεσία, ημερομηνία, ώρα και όνομα.' }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(slotDate) || !/^\d{2}:\d{2}/.test(slotStartTime)) {
      return NextResponse.json({ error: 'Μη έγκυρη ημερομηνία ή ώρα' }, { status: 400 })
    }

    // Υπηρεσία: ίδια λογική με τη δημιουργία (κατά όνομα, αλλιώς ΑΝΕΝΕΡΓΟ row από τον κατάλογο).
    type SvcRow = { id: string; name: string; price: number; duration_minutes: number }
    const cleanName = String(serviceName).trim()
    const { data: rows } = await admin
      .from('services').select('id, name, price, duration_minutes')
      .eq('location_id', booking.location_id).eq('name', cleanName).limit(1)
    let service = (rows?.[0] as SvcRow | undefined) || null
    if (!service) {
      const { data: catRow } = await admin
        .from('service_catalog').select('name, duration_minutes').eq('name', cleanName).maybeSingle()
      const entry = catRow || catalogEntry(cleanName)
      if (!entry) return NextResponse.json({ error: 'Άγνωστη υπηρεσία' }, { status: 400 })
      const { data: created, error: createErr } = await admin.from('services').insert({
        location_id: booking.location_id, name: cleanName,
        duration_minutes: entry.duration_minutes, price: 0, is_active: false,
      }).select('id, name, price, duration_minutes').single()
      if (createErr || !created) return NextResponse.json({ error: 'Αποτυχία υπηρεσίας' }, { status: 500 })
      service = created as SvcRow
    }

    const { error: updErr } = await admin.from('bookings').update({
      service_id: service.id,
      slot_date: slotDate,
      slot_start_time: slotStartTime.slice(0, 5),
      duration_minutes: Math.max(30, Number(service.duration_minutes) || 30),
      total_amount: Number(service.price) || 0,
      customer_name: customerName.trim(),
      customer_phone: customerPhone ? String(customerPhone).trim() : null,
    }).eq('id', bookingId)
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('update-manual error:', err)
    return NextResponse.json({ error: 'Αποτυχία αποθήκευσης' }, { status: 500 })
  }
}
