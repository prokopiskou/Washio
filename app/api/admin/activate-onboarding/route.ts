import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'
import { activateOnboarding } from '@/lib/onboarding-activate'

// ============================================================
// Ενεργοποίηση αίτησης onboarding → auto-δημιουργία πρατηρίου.
//
// ΔΕΝ στέλνει κανένα email και ΔΕΝ κάνει invite owner. Δημιουργεί μόνο
// το location (skeleton, is_active=false) από τα στοιχεία της αίτησης.
// Ο admin μετά συμπληρώνει (υπηρεσίες/ωράριο) και ανοίγει πρόσβαση χειροκίνητα.
// ============================================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    // Admin-only.
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!isAdminEmail(user?.email)) {
      return NextResponse.json({ error: 'Δεν επιτρέπεται' }, { status: 403 })
    }

    const { onboardingId } = await req.json()
    if (!onboardingId) {
      return NextResponse.json({ error: 'Λείπει το onboardingId' }, { status: 400 })
    }

    // Φόρτωσε την αίτηση.
    const { data: app, error: loadErr } = await supabase
      .from('partner_onboarding')
      .select('*')
      .eq('id', onboardingId)
      .single()
    if (loadErr || !app) {
      return NextResponse.json({ error: 'Η αίτηση δεν βρέθηκε' }, { status: 404 })
    }
    if (app.status === 'active') {
      return NextResponse.json({ error: 'Η αίτηση είναι ήδη ενεργοποιημένη' }, { status: 409 })
    }

    const r = await activateOnboarding(supabase, app)
    if (!r.ok) return NextResponse.json({ error: 'Αποτυχία δημιουργίας πρατηρίου', detail: r.error }, { status: 500 })
    return NextResponse.json({ success: true, locationId: r.locationId })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Σφάλμα'
    console.error('activate-onboarding error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
