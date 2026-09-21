import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { ipFrom, isThrottled } from '@/lib/throttle'

// Demo login bypass ΜΟΝΟ για τον λογαριασμό review της Apple.
// Ο reviewer βάζει το demo email + έναν σταθερό 8-ψήφιο κωδικό (DEMO_LOGIN_CODE).
//
// ΑΣΦΑΛΕΙΑ:
//  - Ενεργό ΜΟΝΟ όταν DEMO_LOGIN_ENABLED=true (βάλ' το στο Vercel όσο περνάς
//    review, βγάλ' το μετά). Χωρίς αυτό το endpoint είναι νεκρό.
//  - Constant-time σύγκριση (όχι timing leak).
//  - Throttle ανά IP (5 προσπάθειες / 15') + 800ms καθυστέρηση σε αποτυχία,
//    ώστε brute-force στα 10^8 να είναι πρακτικά αδύνατο.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const DEMO_EMAIL = 'appreview@washio.gr'
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export async function POST(req: NextRequest) {
  try {
    if (process.env.DEMO_LOGIN_ENABLED !== 'true') {
      return NextResponse.json({ error: 'Μη διαθέσιμο' }, { status: 404 })
    }
    if (await isThrottled('demo:' + ipFrom(req), 5, 15 * 60 * 1000)) {
      return NextResponse.json({ error: 'Πολλές προσπάθειες. Δοκίμασε αργότερα.' }, { status: 429 })
    }

    const { code } = await req.json()
    const expected = process.env.DEMO_LOGIN_CODE
    if (!expected || typeof code !== 'string' || !safeEqual(code, expected)) {
      await new Promise(r => setTimeout(r, 800))
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
