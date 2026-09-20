import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Καταχώρηση native FCM token (iOS/Android) για τον συνδεδεμένο χρήστη.
// Το userId προκύπτει από το session — όχι από τον client.

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const auth = await createServerClient()
    const { data: { user } } = await auth.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })

    const { token, platform } = await req.json()
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    }

    await admin.from('native_push_tokens').upsert({
      user_id: user.id,
      token,
      platform: platform === 'android' ? 'android' : 'ios',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,token' })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
