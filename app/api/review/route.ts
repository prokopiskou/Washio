import { ipFrom, isThrottled } from '@/lib/throttle'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

// ============================================================
// Αξιολόγηση από το email («Πώς πήγε το πλύσιμο»).
//
// ΛΟΓΙΚΗ (reputation funnel για το Washio):
//   rating >= 4  → ο πελάτης οδηγείται (client-side) να αξιολογήσει το
//                  Washio στο App Store / Google Play. Εδώ απλώς ΟΚ.
//   rating <= 3  → ΙΔΙΩΤΙΚΟ feedback: email στον admin, ΔΕΝ δημοσιεύεται.
// ============================================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY)
const ADMIN_EMAIL = 'withinsuccess@gmail.com'

function escapeHtml(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function POST(req: Request) {
  try {
    if (await isThrottled('review:' + ipFrom(req), 10, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Πολλές προσπάθειες. Δοκίμασε αργότερα.' }, { status: 429 })
    }
    const { ref, rating, comment } = await req.json()
    const r = Number(rating)
    if (!Number.isInteger(r) || r < 1 || r > 5) {
      return NextResponse.json({ error: 'Λάθος βαθμολογία' }, { status: 400 })
    }

    // Το ref είναι υποχρεωτικό και πρέπει να αντιστοιχεί σε ΠΡΑΓΜΑΤΙΚΗ κράτηση
    // για την οποία έχει ήδη σταλεί το followup («πώς πήγε;») και είναι πρόσφατη.
    // Αλλιώς, τυχαία refs θα άλλαζαν has_reviewed άλλων / θα σπάμαραν τον admin.
    if (!ref || typeof ref !== 'string' || !/^WS-[A-Z0-9]{4,12}$/i.test(ref)) {
      return NextResponse.json({ error: 'Μη έγκυρη κράτηση' }, { status: 400 })
    }
    const { data: booking } = await supabase
      .from('bookings')
      .select('user_id, slot_date, followup_sent, locations(name)')
      .eq('booking_ref', ref.toUpperCase())
      .maybeSingle()
    if (!booking) {
      return NextResponse.json({ error: 'Μη έγκυρη κράτηση' }, { status: 404 })
    }
    const b = booking as { user_id?: string | null; slot_date?: string; followup_sent?: boolean; locations?: { name?: string } | null }
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    if (!b.followup_sent || !b.slot_date || b.slot_date < thirtyDaysAgo) {
      return NextResponse.json({ error: 'Η αξιολόγηση δεν είναι διαθέσιμη για αυτή την κράτηση' }, { status: 403 })
    }
    const locName = b.locations?.name || '—'
    const bUserId = b.user_id || null

    // Μαρκάρουμε τον χρήστη ως «έχει βαθμολογήσει» ώστε να ΜΗΝ του
    // ξαναζητηθεί review σε μελλοντικά πλυσίματα (best-effort).
    if (bUserId) {
      await supabase.from('profiles').update({ has_reviewed: true }).eq('id', bUserId).then(() => null, () => null)
    }

    // Ψηλή βαθμολογία → redirect στο store (client-side). Τίποτα άλλο εδώ.
    if (r >= 4) {
      return NextResponse.json({ ok: true, isPublic: true })
    }

    await resend.emails.send({
      from: 'Washio <noreply@washio.gr>',
      to: ADMIN_EMAIL,
      subject: `⚠️ Χαμηλή αξιολόγηση (${r}★)${ref ? ' — ' + ref : ''}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2>Ιδιωτικό feedback πελάτη (${r}★)</h2>
          <p><b>Πρατήριο:</b> ${escapeHtml(locName)}</p>
          <p><b>Κράτηση:</b> ${escapeHtml(ref || '—')}</p>
          <p><b>Βαθμολογία:</b> ${r}/5</p>
          <p><b>Σχόλιο:</b><br>${escapeHtml((comment && String(comment).trim()) || '(χωρίς σχόλιο)')}</p>
          <p style="color:#888;font-size:12px;">Δεν δημοσιεύτηκε — μόνο εσωτερικό feedback.</p>
        </div>`,
    }).catch(() => null)

    return NextResponse.json({ ok: true, isPublic: false })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Σφάλμα'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
