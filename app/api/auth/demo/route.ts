import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Demo login bypass ΜΟΝΟ για τον λογαριασμό review της Apple.
// Ο reviewer βάζει το demo email + έναν σταθερό 8-ψήφιο κωδικό (DEMO_LOGIN_CODE).
// Με σωστό κωδικό, ο server παράγει έγκυρο magic-link token για τον demo λογαριασμό,
// που ο client το εξαργυρώνει για session. Κανένα πραγματικό email/OTP δεν χρειάζεται.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DEMO_EMAIL = 'appreview@washio.gr'

export async function POST(req: NextRequest) {
  try {
    const { code } = await req.json()
    const expected = process.env.DEMO_LOGIN_CODE
    if (!expected || code !== expected) {
      return NextResponse.json({ error: 'Λάθος κωδικός' }, { status: 403 })
    }

    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: DEMO_EMAIL,
    })
    const tokenHash = data?.properties?.hashed_token
    if (error || !tokenHash) {
      return NextResponse.json({ error: 'failed' }, { status: 500 })
    }
    return NextResponse.json({ tokenHash })
  } catch {
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
