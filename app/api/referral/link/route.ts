import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { linkReferral } from '@/lib/referral'

// Συνδέει έναν ΝΕΟ χρήστη με τον κωδικό παραπομπής (cookie ws_ref) — δίνει welcome
// credit και καταγράφει τον referrer. Authenticated: η ταυτότητα από το session.
// Idempotent & best-effort (το linkReferral κάνει όλους τους anti-abuse ελέγχους).
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const sb = await createServerClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    // Με κωδικό φίλου → σύνδεση referrer + −3€. ΧΩΡΙΣ κωδικό (το cookie χάθηκε: άλλος
    // browser, εφαρμογή, Apple/Google redirect, flyer, bio) → πάλι −3€ καλωσορίσματος,
    // γιατί το −3€ στο πρώτο πλύσιμο το υποσχόμαστε παντού. Το linkReferral δίνει
    // welcome ΜΟΝΟ σε χρήστη χωρίς καμία κράτηση και χωρίς προηγούμενο welcome.
    const code = req.cookies.get('ws_ref')?.value || 'WELCOME'
    await linkReferral(admin, user.id, code)

    // A/B τεστ landing: server-side backup της καταγραφής παραλλαγής (acq_lp).
    // Ο client (RegistrationTracker) το γράφει ήδη, αλλά μόνο μέσα σε 60' από τη
    // δημιουργία του λογαριασμού — εδώ πιάνουμε όσους επαλήθευσαν αργότερα ή όπου
    // το updateUser του browser απέτυχε. Ποτέ δεν αντικαθιστά υπάρχουσα τιμή.
    try {
      const lp = req.cookies.get('ws_lp')?.value
      const meta = (user.user_metadata || {}) as Record<string, unknown>
      const ageMs = Date.now() - new Date(user.created_at).getTime()
      if (ageMs < 14 * 24 * 3600 * 1000) {
        const patch: Record<string, unknown> = {}
        if ((lp === 'map' || lp === 'login') && !meta.acq_lp) {
          const ref = req.cookies.get('ws_ref')?.value
          patch.acq_lp = lp
          if (ref) patch.acq_ref = decodeURIComponent(ref)
        }
        // Διαγνωστικό: ήρθε από ΚΛΙΚ σε διαφήμιση Meta σε αυτόν τον browser; (_fbc = fbclid)
        // Χωρίς tag + χωρίς _fbc → view-through/οργανικός (αναμενόμενο). Χωρίς tag + με _fbc → χαμένο tag (bug).
        if (meta.acq_click === undefined) patch.acq_click = !!req.cookies.get('_fbc')?.value
        if (Object.keys(patch).length) {
          // Το GoTrue κάνει MERGE στα user_metadata → στέλνουμε μόνο τα νέα κλειδιά
          // (ποτέ ολόκληρο το αντικείμενο: θα έσβηνε ό,τι έγραψε ο client στο μεταξύ).
          await admin.auth.admin.updateUserById(user.id, { user_metadata: patch })
        }
      }
    } catch { /* best-effort */ }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
