import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

// In-app διαγραφή λογαριασμού — απαίτηση Apple (Guideline 5.1.1(v)).
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST() {
  try {
    // Ταυτότητα ΜΟΝΟ από το session — ο χρήστης διαγράφει τον εαυτό του.
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })
    }
    const uid = user.id

    // Διαγραφή προσωπικών δεδομένων.
    await admin.from('vehicles').delete().eq('user_id', uid)
    await admin.from('favorites').delete().eq('user_id', uid)
    await admin.from('push_subscriptions').delete().eq('user_id', uid)

    // Οι κρατήσεις αποσυνδέονται (κρατούνται για λογιστικούς λόγους του πρατηρίου,
    // αλλά χωρίς σύνδεση με τον χρήστη). car_plate ανωνυμοποιείται.
    await admin.from('bookings').update({ user_id: null, car_plate: null }).eq('user_id', uid)

    // Διαγραφή προφίλ + auth user.
    await admin.from('profiles').delete().eq('id', uid)
    const { error: delErr } = await admin.auth.admin.deleteUser(uid)
    if (delErr) {
      console.error('Account delete error:', delErr.message)
      return NextResponse.json({ error: 'Η διαγραφή απέτυχε' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Σφάλμα'
    console.error('Account delete error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
