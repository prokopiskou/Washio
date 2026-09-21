import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'

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

function slugify(input: string): string {
  const map: Record<string, string> = {
    α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i',
    κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's',
    ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
    ά: 'a', έ: 'e', ή: 'i', ί: 'i', ό: 'o', ύ: 'y', ώ: 'o', ϊ: 'i', ϋ: 'y', ΐ: 'i', ΰ: 'y',
  }
  const base = input.toLowerCase().split('').map(ch => map[ch] ?? ch).join('')
  const slug = base.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return (slug || 'partner') + '-' + Date.now()
}

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

    const slug = slugify(app.business_name || 'partner')

    // Δημιουργία πρατηρίου (skeleton, ΑΝΕΝΕΡΓΟ). ΧΩΡΙΣ auto-geocode — τις
    // συντεταγμένες τις βάζει ο admin χειροκίνητα (η διεύθυνση φόρμας είναι
    // «έδρα» και μπορεί να διαφέρει από τη φυσική τοποθεσία του πλυντηρίου).
    const { data: loc, error: insErr } = await supabase.from('locations').insert({
      name: app.business_name,
      address: app.address || '',
      city: '',
      slug,
      iban: app.iban || null,
      is_active: false,
      commission_rate: 10,
      capacity: 1,
      owner_id: null,
      lat: null,
      lng: null,
    }).select('id').single()

    if (insErr) {
      console.error('activate-onboarding location insert error:', insErr)
      return NextResponse.json({ error: 'Αποτυχία δημιουργίας πρατηρίου', detail: insErr.message }, { status: 500 })
    }

    // Μαρκάρισμα αίτησης ως ενεργοποιημένης + σύνδεση με το location (μέσω notes,
    // αφού ο πίνακας δεν έχει location_id column). Χωρίς email/notification.
    await supabase.from('partner_onboarding')
      .update({ status: 'active', notes: loc.id })
      .eq('id', onboardingId)

    return NextResponse.json({ success: true, locationId: loc.id })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Σφάλμα'
    console.error('activate-onboarding error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
