import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { ipFrom, isThrottled } from '@/lib/throttle'
import { phoneKey, phoneCouponUsedElsewhere } from '@/lib/referral'

// Ζωντανός έλεγχος στο checkout: μόλις γράψει κινητό, αν αυτό το κινητό έχει ήδη πάρει
// το −3€ πρώτου πλυσίματος σε άλλο λογαριασμό → { used: true } και η σύνοψη το αφαιρεί
// ΑΜΕΣΩΣ (ίδιος κανόνας με τον server στην κράτηση: lib/referral welcomeUsedByPhone).
// Συνδεδεμένος με δικές του κρατήσεις → used:false (τα κουπόνια του είναι δικά του).
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    if (await isThrottled('couponphone:' + ipFrom(req), 40, 60 * 60 * 1000)) {
      return NextResponse.json({ used: false })
    }
    const body = await req.json().catch(() => ({}))
    const key = phoneKey(String(body?.phone || ''))
    if (!key) return NextResponse.json({ used: false })

    let userId: string | null = null
    try {
      const sb = await createServerClient()
      const { data: { user } } = await sb.auth.getUser()
      userId = user?.id || null
    } catch { /* επισκέπτης */ }

    if (userId) {
      const { count } = await admin.from('bookings').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).neq('status', 'cancelled')
      if ((count || 0) > 0) return NextResponse.json({ used: false })
    }
    const used = await phoneCouponUsedElsewhere(admin, key, userId)
    return NextResponse.json({ used })
  } catch {
    return NextResponse.json({ used: false })
  }
}
