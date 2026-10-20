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

    // Ένας ιδιοκτήτης μπορεί να έχει ΠΟΛΛΑ πλυντήρια (π.χ. 3 αιτήσεις με το ίδιο email).
    // Δένουμε ΟΛΑ τα δικά του που δεν έχουν owner — όχι μόνο το πρώτο — ώστε να τα
    // βλέπει όλα στο dashboard (επιλογή ένα-ένα).
    const { data: ownedRows } = await admin
      .from('locations').select('id').eq('owner_id', user.id).order('created_at', { ascending: true })
    const owned = new Set((ownedRows || []).map(r => r.id as string))

    const email = (user.email || '').trim().toLowerCase()
    if (!email) {
      const first = [...owned][0] || null
      return NextResponse.json({ locationId: first, locationIds: [...owned], alreadyOwner: !!first })
    }

    // Αιτήσεις onboarding με το ίδιο email (case-insensitive). Το notes κρατά το
    // locationId που δημιουργήθηκε γι' αυτή την αίτηση.
    const { data: apps } = await admin
      .from('partner_onboarding')
      .select('notes')
      .ilike('email', email)

    const locationIds = (apps || [])
      .map((a) => (a as { notes?: string }).notes)
      .filter((n): n is string => !!n)

    let linked = 0
    for (const locId of locationIds) {
      if (owned.has(locId)) continue
      const { data: loc } = await admin
        .from('locations').select('id, owner_id').eq('id', locId).maybeSingle()
      if (!loc?.id) continue
      const currentOwner = (loc as { owner_id?: string | null }).owner_id
      if (currentOwner === user.id) { owned.add(loc.id); continue }
      if (!currentOwner) {
        // Δέσε το owner_id τώρα (self-heal) — ΜΟΝΟ αν είναι ελεύθερο (.is null = ατομικό).
        const { data: upd, error: linkErr } = await admin
          .from('locations').update({ owner_id: user.id }).eq('id', loc.id).is('owner_id', null).select('id')
        if (!linkErr && upd && upd.length) { owned.add(loc.id); linked++ }
      }
      // Αλλιώς ανήκει σε άλλον — μην το αγγίξεις.
    }

    const ids = [...owned]
    return NextResponse.json({ locationId: ids[0] || null, locationIds: ids, linked, alreadyOwner: ids.length > 0 && linked === 0 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Σφάλμα'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
