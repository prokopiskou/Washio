import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

// ============================================================
// Σύνδεση πλυντηρίου με το dashboard μέσω EMAIL (fallback).
//
// Κανονικά το dashboard βρίσκει το location με owner_id == user.id. Αν όμως το
// owner_id δεν είχε δεθεί ποτέ (π.χ. πρατήριο ενεργοποιήθηκε χωρίς να τρέξει η
// αυτόματη σύνδεση), το δένουμε ΤΩΡΑ: ο χρήστης έχει επιβεβαιωμένο email (OTP),
// κι αν αυτό ταιριάζει με το email της αίτησης onboarding του πρατηρίου, είναι
// ο δηλωμένος ιδιοκτήτης → γράφουμε owner_id = user.id (μία φορά, self-heal).
//
// ΑΣΦΑΛΕΙΑ: δένουμε ΜΟΝΟ location που δεν έχει ήδη owner (owner_id null) — ποτέ
// δεν «κλέβουμε» πρατήριο άλλου.
// ============================================================

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST() {
  try {
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user?.id) {
      return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })
    }

    // Ήδη δεμένο; τίποτα άλλο.
    const { data: owned } = await admin
      .from('locations').select('id').eq('owner_id', user.id).maybeSingle()
    if (owned?.id) {
      return NextResponse.json({ locationId: owned.id, alreadyOwner: true })
    }

    const email = (user.email || '').trim().toLowerCase()
    if (!email) return NextResponse.json({ locationId: null })

    // Αιτήσεις onboarding με το ίδιο email (case-insensitive). Το notes κρατά το
    // locationId που δημιουργήθηκε γι' αυτή την αίτηση.
    const { data: apps } = await admin
      .from('partner_onboarding')
      .select('notes')
      .ilike('email', email)

    const locationIds = (apps || [])
      .map((a) => (a as { notes?: string }).notes)
      .filter((n): n is string => !!n)

    for (const locId of locationIds) {
      const { data: loc } = await admin
        .from('locations').select('id, owner_id').eq('id', locId).maybeSingle()
      if (!loc?.id) continue
      const currentOwner = (loc as { owner_id?: string | null }).owner_id
      if (currentOwner === user.id) {
        return NextResponse.json({ locationId: loc.id, alreadyOwner: true })
      }
      if (!currentOwner) {
        // Δέσε το owner_id τώρα (self-heal).
        const { error: linkErr } = await admin
          .from('locations').update({ owner_id: user.id }).eq('id', loc.id)
        if (!linkErr) {
          return NextResponse.json({ locationId: loc.id, linked: true })
        }
      }
      // Αλλιώς ανήκει σε άλλον — μην το αγγίξεις.
    }

    return NextResponse.json({ locationId: null })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Σφάλμα'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
