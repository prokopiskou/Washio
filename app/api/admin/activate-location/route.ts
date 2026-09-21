import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'

// ============================================================
// Ενεργοποίηση / απενεργοποίηση πρατηρίου (από τα «Πρατήρια»).
//
// Όταν ΕΝΕΡΓΟΠΟΙΕΙΤΑΙ (active=true) και το πρατήριο δεν έχει ακόμα owner:
// ανοίγει ΑΥΤΟΜΑΤΑ τον λογαριασμό του owner από το email της αίτησης
// onboarding (που είχε συνδεθεί μέσω notes=locationId στη δημιουργία).
// Ένα κουμπί → ορατό στους πελάτες + λογαριασμός έτοιμος.
//
// Χωρίς email/notification. Το πλυντήριο μπαίνει όπως κάθε χρήστης:
// βάζει το email του στο login → λαμβάνει OTP → βλέπει το dashboard (owner).
// ============================================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!isAdminEmail(user?.email)) {
      return NextResponse.json({ error: 'Δεν επιτρέπεται' }, { status: 403 })
    }

    const { locationId, active } = await req.json()
    if (!locationId || typeof active !== 'boolean') {
      return NextResponse.json({ error: 'Λείπουν στοιχεία' }, { status: 400 })
    }

    // 1) Θέσε την κατάσταση ορατότητας.
    const { error: updErr } = await supabase
      .from('locations').update({ is_active: active }).eq('id', locationId)
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }

    // Απενεργοποίηση → τίποτα άλλο.
    if (!active) {
      return NextResponse.json({ success: true, active: false })
    }

    // 2) Ενεργοποίηση → σιγουρέψου ότι υπάρχει owner.
    const { data: loc } = await supabase
      .from('locations').select('owner_id').eq('id', locationId).single()

    if (loc?.owner_id) {
      // Έχει ήδη owner — τίποτα άλλο.
      return NextResponse.json({ success: true, active: true, ownerLinked: false, alreadyOwner: true })
    }

    // Βρες την αίτηση onboarding που είχε συνδεθεί σε αυτό το location (notes).
    const { data: app } = await supabase
      .from('partner_onboarding')
      .select('email, business_name')
      .eq('notes', locationId)
      .maybeSingle()

    const email = app?.email ? String(app.email).trim().toLowerCase() : ''
    if (!email) {
      // Χειροκίνητα φτιαγμένο πρατήριο χωρίς αίτηση → μόνο ενεργοποίηση.
      return NextResponse.json({ success: true, active: true, ownerLinked: false, noOnboarding: true })
    }

    // Δημιούργησε confirmed χρήστη ΧΩΡΙΣ κωδικό (μπαίνει με OTP), ή βρες υπάρχοντα.
    let ownerId: string | null = null
    let existed = false
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { business_name: app?.business_name },
    })
    if (createErr || !created?.user) {
      const { data: prof } = await supabase
        .from('profiles').select('id').eq('email', email).maybeSingle()
      if (prof?.id) { ownerId = prof.id as string; existed = true }
      else {
        return NextResponse.json({ error: createErr?.message || 'Αποτυχία δημιουργίας λογαριασμού' }, { status: 500 })
      }
    } else {
      ownerId = created.user.id
    }

    const { error: linkErr } = await supabase
      .from('locations').update({ owner_id: ownerId }).eq('id', locationId)
    if (linkErr) {
      return NextResponse.json({ error: 'Αποτυχία σύνδεσης owner: ' + linkErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, active: true, ownerLinked: true, email, existed })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Σφάλμα'
    console.error('activate-location error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
