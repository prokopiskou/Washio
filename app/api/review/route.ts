import { ipFrom, isThrottled } from '@/lib/throttle'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { verifyReviewToken } from '@/lib/review-link'
import { createClient as createServerClient } from '@/lib/supabase/server'

// ============================================================
// Κριτική ΠΛΥΝΤΗΡΙΟΥ από push / email / SMS / κάρτα αρχικής.
//   GET  ?ref&t           → { location, rating? } για τη σελίδα /review
//   POST { ref, t, rating, comment } → αποθήκευση στο reviews (μία ανά κράτηση, ενημερώνεται)
// Όλες οι βαθμολογίες αποθηκεύονται στο πλυντήριο (σελίδα κριτικών).
// 1–3★ → επιπλέον ειδοποίηση στον admin για να το διορθώσουμε.
// Πρόσβαση: υπογεγραμμένο token (t) ή συνδεδεμένος ιδιοκτήτης της κράτησης.
// Παλιά email links (χωρίς t): μόνο αν είχε σταλεί το followup και η κράτηση είναι < 30 ημερών.
// ============================================================

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const resend = new Resend(process.env.RESEND_API_KEY)
const ADMIN_EMAIL = 'withinsuccess@gmail.com'

type B = { id: string; user_id: string | null; location_id: string; slot_date: string; status: string; followup_sent?: boolean | null; review_requested_at?: string | null; locations?: { name?: string } | null }

function escapeHtml(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function authorizedBooking(ref: unknown, t: unknown): Promise<{ b: B | null; error?: string; status?: number }> {
  if (!ref || typeof ref !== 'string' || !/^WS-[A-Z0-9]{4,12}$/i.test(ref)) return { b: null, error: 'Μη έγκυρη κράτηση', status: 400 }
  const R = ref.toUpperCase()
  const { data } = await supabase.from('bookings')
    .select('id, user_id, location_id, slot_date, status, followup_sent, review_requested_at, locations(name)')
    .eq('booking_ref', R).maybeSingle()
  const b = data as unknown as B | null
  if (!b) return { b: null, error: 'Μη έγκυρη κράτηση', status: 404 }
  if (b.status === 'cancelled' || b.status === 'no_show') return { b: null, error: 'Η κράτηση δεν ολοκληρώθηκε', status: 403 }
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10)
  if (!b.slot_date || b.slot_date < sixtyDaysAgo) return { b: null, error: 'Η αξιολόγηση δεν είναι πια διαθέσιμη', status: 403 }

  if (typeof t === 'string' && t && verifyReviewToken(R, t)) return { b }
  // Συνδεδεμένος ιδιοκτήτης της κράτησης (π.χ. κάρτα αρχικής).
  try {
    const sb = await createServerClient()
    const { data: { user } } = await sb.auth.getUser()
    if (user && b.user_id && user.id === b.user_id) return { b }
  } catch { /* no session */ }
  // Παλιά email links.
  if (!t && b.followup_sent) {
    const thirty = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10)
    if (b.slot_date >= thirty) return { b }
  }
  return { b: null, error: 'Το link δεν ισχύει', status: 403 }
}

export async function GET(req: Request) {
  const u = new URL(req.url)
  const { b, error, status } = await authorizedBooking(u.searchParams.get('ref'), u.searchParams.get('t'))
  if (!b) return NextResponse.json({ error }, { status })
  const { data: ex } = await supabase.from('reviews').select('rating, comment').eq('booking_id', b.id).maybeSingle()
  return NextResponse.json({ location: b.locations?.name || '', rating: ex?.rating ?? null, comment: ex?.comment ?? null })
}

export async function POST(req: Request) {
  try {
    if (await isThrottled('review:' + ipFrom(req), 20, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Πολλές προσπάθειες. Δοκίμασε αργότερα.' }, { status: 429 })
    }
    const { ref, t, rating, comment } = await req.json().catch(() => ({}))
    const r = Number(rating)
    if (!Number.isInteger(r) || r < 1 || r > 5) return NextResponse.json({ error: 'Λάθος βαθμολογία' }, { status: 400 })
    const { b, error, status } = await authorizedBooking(ref, t)
    if (!b) return NextResponse.json({ error }, { status })

    const text = (typeof comment === 'string' ? comment.trim().slice(0, 600) : '') || null
    const { data: ex } = await supabase.from('reviews').select('id, rating, comment').eq('booking_id', b.id).maybeSingle()
    if (ex) {
      await supabase.from('reviews').update({ rating: r, comment: text ?? ex.comment }).eq('id', ex.id)
    } else {
      const { error: insErr } = await supabase.from('reviews').insert({ location_id: b.location_id, user_id: b.user_id, booking_id: b.id, rating: r, comment: text })
      if (insErr && !/duplicate/i.test(insErr.message)) return NextResponse.json({ error: 'Σφάλμα αποθήκευσης' }, { status: 500 })
    }
    if (b.user_id) await supabase.from('profiles').update({ has_reviewed: true }).eq('id', b.user_id).then(() => null, () => null)

    // Χαμηλή βαθμολογία → ειδοποίηση admin (μία φορά ανά κράτηση ή όταν προστεθεί σχόλιο).
    if (r <= 3 && (!ex || (text && text !== ex.comment) || ex.rating !== r)) {
      await resend.emails.send({
        from: 'Washio <noreply@washio.gr>',
        to: ADMIN_EMAIL,
        subject: `⚠️ Χαμηλή κριτική (${r}★) — ${escapeHtml(b.locations?.name || '')} — ${String(ref).toUpperCase()}`,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.6;">
          <h2>Χαμηλή κριτική (${r}★)</h2>
          <p><b>Πλυντήριο:</b> ${escapeHtml(b.locations?.name || '—')}</p>
          <p><b>Κράτηση:</b> ${escapeHtml(String(ref).toUpperCase())}</p>
          <p><b>Σχόλιο:</b><br>${escapeHtml(text || '(χωρίς σχόλιο)')}</p>
        </div>`,
      }).catch(() => null)
    }
    return NextResponse.json({ ok: true, rating: r })
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Σφάλμα' }, { status: 500 })
  }
}
