import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { catalogEntry } from '@/lib/services-catalog'

// Ενεργοποίηση/απενεργοποίηση ΒΑΣΙΚΗΣ υπηρεσίας από τον ιδιοκτήτη.
// Αν το πλυντήριο δεν έχει ακόμα τη συγκεκριμένη υπηρεσία στον πίνακα
// services, δημιουργείται (από τον κεντρικό κατάλογο) — ανενεργή τιμή 0
// μέχρι να ορίσει τιμή ο ιδιοκτήτης.

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { locationId, name, active } = await req.json()

    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })

    if (!locationId || !name || typeof active !== 'boolean') {
      return NextResponse.json({ error: 'Λείπουν στοιχεία' }, { status: 400 })
    }

    // Μόνο ο ιδιοκτήτης του location.
    const { data: location } = await admin
      .from('locations').select('id, owner_id').eq('id', locationId).maybeSingle()
    if (!location || location.owner_id !== user.id) {
      return NextResponse.json({ error: 'Δεν έχεις δικαίωμα σε αυτό το πλυντήριο' }, { status: 403 })
    }

    // Μόνο υπηρεσίες του κεντρικού καταλόγου δημιουργούνται από εδώ.
    const entry = catalogEntry(String(name))

    const { data: existing } = await admin
      .from('services')
      .select('id')
      .eq('location_id', locationId)
      .eq('name', String(name))
      .maybeSingle()

    if (existing?.id) {
      const { data: updated, error } = await admin
        .from('services')
        .update({ is_active: active })
        .eq('id', existing.id)
        .select('id, name, price, price_moto, price_suv, duration_minutes, is_active')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, service: updated })
    }

    if (!entry) {
      return NextResponse.json({ error: 'Άγνωστη υπηρεσία καταλόγου' }, { status: 400 })
    }

    const { data: created, error: insertError } = await admin
      .from('services')
      .insert({
        location_id: locationId,
        name: entry.name,
        duration_minutes: entry.duration_minutes,
        price: 0, // Ο ιδιοκτήτης ορίζει τιμή — μέχρι τότε δεν εμφανίζεται στους πελάτες.
        is_active: active,
      })
      .select('id, name, price, price_moto, price_suv, duration_minutes, is_active')
      .single()

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })
    return NextResponse.json({ ok: true, service: created })
  } catch (err) {
    console.error('services/toggle error:', err)
    return NextResponse.json({ error: 'Κάτι πήγε στραβά' }, { status: 500 })
  }
}
