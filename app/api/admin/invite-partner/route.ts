import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'
import { geocodeAddress } from '@/lib/geocode'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Slug-safe transliteration ελληνικών → λατινικών (αλλιώς το slug έβγαινε κενό).
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

    const { email, businessName, city, address } = await req.json()
    if (!email || !businessName) {
      return NextResponse.json({ error: 'Λείπουν στοιχεία' }, { status: 400 })
    }

    const { data: userData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { business_name: businessName },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    })

    if (inviteError) throw inviteError

    const slug = slugify(businessName)

    // Σωστές συντεταγμένες από τη διεύθυνση (όχι placeholder κέντρο Αθήνας).
    const coords = await geocodeAddress(address, city)

    await supabase.from('locations').insert({
      name: businessName,
      city: city || '',
      address: address || '',
      owner_id: userData.user.id,
      is_active: false,
      commission_rate: 10,
      slug,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    })

    // geocoded=false → ο admin πρέπει να βάλει lat/lng χειροκίνητα πριν το activate.
    return NextResponse.json({ success: true, geocoded: coords != null })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Σφάλμα'
    console.error('Invite error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
