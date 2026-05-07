import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { email, businessName, city, address } = await req.json()

    const { data: userData, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { business_name: businessName },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
    })

    if (inviteError) throw inviteError

    const slug = businessName.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '') + '-' + Date.now()

    await supabase.from('locations').insert({
      name: businessName,
      city: city || '',
      address: address || '',
      owner_id: userData.user.id,
      is_active: false,
      commission_rate: 10,
      slug,
      lat: 37.9838,
      lng: 23.7275,
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Invite error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
