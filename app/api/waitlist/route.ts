import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Capture demand όταν δεν καλύπτουμε μια περιοχή. Μπαίνει σε πίνακα waitlist,
// ώστε (α) να ειδοποιήσουμε τον χρήστη μόλις ανοίξουμε εκεί, (β) να δούμε ΠΟΥ
// υπάρχει ζήτηση για το επόμενο πλυντήριο.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const { email, areaLabel, lat, lng, userId, source } = await req.json()

    const clean = typeof email === 'string' ? email.trim().toLowerCase() : ''
    if (!clean || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) {
      return NextResponse.json({ error: 'Μη έγκυρο email' }, { status: 400 })
    }

    // source: 'no_coverage' (δεν έχει πλυντήριο) ή 'no_availability' (γεμάτα όλα).
    const src = source === 'no_availability' ? 'no_availability' : 'no_coverage'

    const { error } = await admin.from('waitlist').insert({
      email: clean,
      user_id: userId || null,
      area_label: typeof areaLabel === 'string' ? areaLabel.slice(0, 200) : null,
      lat: typeof lat === 'number' ? lat : null,
      lng: typeof lng === 'number' ? lng : null,
      source: src,
    })

    if (error) {
      console.error('Waitlist insert error:', error)
      return NextResponse.json({ error: 'Αποτυχία αποθήκευσης' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Σφάλμα' }, { status: 500 })
  }
}
