import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Διαγνωστικό push: καταγράφει (Vercel logs) ΓΙΑΤΙ απέτυχε η εγγραφή native push —
// άρνηση χρήστη (permission-denied) ή τεχνικό σφάλμα (token/server/exception).
export async function POST(req: NextRequest) {
  try {
    const b = await req.json().catch(() => ({})) as { reason?: string; stage?: string; platform?: string }
    let uid = 'anon'
    try {
      const sb = await createServerClient()
      const { data } = await sb.auth.getUser()
      if (data.user) uid = data.user.id.slice(0, 8)
    } catch { /* ignore */ }
    console.warn('[push-diag]', JSON.stringify({
      uid, platform: String(b.platform || '').slice(0, 10), stage: String(b.stage || '').slice(0, 20),
      reason: String(b.reason || '').slice(0, 200), ua: (req.headers.get('user-agent') || '').slice(0, 120),
    }))
  } catch { /* ignore */ }
  return NextResponse.json({ ok: true })
}
