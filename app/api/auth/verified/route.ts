import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Προστασία λογαριασμών που φτιάχτηκαν από guest checkout (/api/auth/guest).
// Εκεί ο λογαριασμός δημιουργείται με email που ΔΕΝ έχει επιβεβαιωθεί από τον κάτοχό του.
// Αν κάποιος έγραψε ξένο email, κρατάει ένα session σε λογαριασμό που δεν είναι δικός του.
// Μόλις ο πραγματικός κάτοχος συνδεθεί κανονικά (κωδικός email / Google / Apple) σε ΑΛΛΟ
// session, αποσυνδέουμε όλα τα υπόλοιπα sessions και ο λογαριασμός θεωρείται επιβεβαιωμένος.
//
//   POST { bind: true }  → αμέσως μετά το guest checkout: «αυτό είναι το guest session».
//   POST {}              → σε κάθε σύνδεση (RegistrationTracker): αν είναι ΑΛΛΟ session από
//                          το guest → έξω όλα τα άλλα + καθαρισμός σημαίας.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function sessionIdOf(jwt: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'))
    return typeof payload.session_id === 'string' ? payload.session_id : null
  } catch { return null }
}

export async function POST(req: NextRequest) {
  try {
    const sb = await createServerClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })
    const am = (user.app_metadata || {}) as { guest_unverified?: boolean; guest_session?: string | null }
    if (!am.guest_unverified) return NextResponse.json({ ok: true })

    const { data: { session } } = await sb.auth.getSession()
    const jwt = session?.access_token || ''
    const sid = jwt ? sessionIdOf(jwt) : null
    if (!sid) return NextResponse.json({ ok: true })

    const body = await req.json().catch(() => ({}))
    if (body?.bind) {
      if (!am.guest_session) await admin.auth.admin.updateUserById(user.id, { app_metadata: { guest_session: sid } })
      return NextResponse.json({ ok: true })
    }

    // Κανονική σύνδεση σε ΑΛΛΟ session → ο κάτοχος του email επιβεβαιώθηκε.
    if (am.guest_session && am.guest_session !== sid) {
      try { await admin.auth.admin.signOut(jwt, 'others') } catch { /* best-effort */ }
      await admin.auth.admin.updateUserById(user.id, { app_metadata: { guest_unverified: false, guest_session: null } })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
