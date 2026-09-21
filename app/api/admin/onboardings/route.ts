import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'

// Λίστα αιτήσεων onboarding για το admin. Το partner_onboarding έχει RLS
// χωρίς policies (μόνο service_role), γι' αυτό το διαβάζουμε server-side εδώ.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!isAdminEmail(user?.email)) {
    return NextResponse.json({ error: 'Δεν επιτρέπεται' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('partner_onboarding')
    .select('id, created_at, business_name, afm, doy, address, iban_holder, iban, contact_name, phone, email, status')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ onboardings: data || [] })
}
