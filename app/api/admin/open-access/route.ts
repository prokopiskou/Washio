import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'

// ============================================================
// «Άνοιγμα πρόσβασης» για ενεργοποιημένο πρατήριο.
// Δημιουργεί λογαριασμό χρήστη (email του onboarding, ΧΩΡΙΣ κωδικό) και
// τον δένει ως owner του location. Το σύστημα ΔΕΝ στέλνει email.
// Το πλυντήριο μπαίνει όποτε θέλει μέσω «Ξέχασα κωδικό» στο login —
// τότε (με δική του ενέργεια) λαμβάνει email να ορίσει κωδικό.
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

    const { onboardingId } = await req.json()
    if (!onboardingId) {
      return NextResponse.json({ error: 'Λείπει το onboardingId' }, { status: 400 })
    }

    const { data: app, error: loadErr } = await supabase
      .from('partner_onboarding')
      .select('email, business_name, status, notes')
      .eq('id', onboardingId)
      .single()
    if (loadErr || !app) {
      return NextResponse.json({ error: 'Η αίτηση δεν βρέθηκε' }, { status: 404 })
    }

    const locationId = app.notes // αποθηκεύτηκε στην ενεργοποίηση
    if (app.status !== 'active' || !locationId) {
      return NextResponse.json({ error: 'Ενεργοποίησε πρώτα το πρατήριο' }, { status: 400 })
    }

    const email = String(app.email).trim().toLowerCase()

    let ownerId: string | null = null
    let existed = false

    // Δημιουργία confirmed χρήστη ΧΩΡΙΣ κωδικό. Ο χρήστης θα ορίσει κωδικό
    // μέσω «Ξέχασα κωδικό» (self-initiated) όποτε θελήσει να μπει.
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { business_name: app.business_name },
    })

    if (createErr || !created?.user) {
      // Πιθανώς υπάρχει ήδη λογαριασμός μ' αυτό το email → βρες τον και δέσ' τον.
      const { data: prof } = await supabase
        .from('profiles').select('id').eq('email', email).maybeSingle()
      if (prof?.id) {
        ownerId = prof.id as string
        existed = true
      } else {
        return NextResponse.json({ error: createErr?.message || 'Αποτυχία δημιουργίας λογαριασμού' }, { status: 500 })
      }
    } else {
      ownerId = created.user.id
    }

    // Δέσε τον χρήστη ως owner του πρατηρίου.
    const { error: updErr } = await supabase
      .from('locations').update({ owner_id: ownerId }).eq('id', locationId)
    if (updErr) {
      return NextResponse.json({ error: 'Αποτυχία σύνδεσης owner: ' + updErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, email, existed })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Σφάλμα'
    console.error('open-access error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
