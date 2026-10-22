import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ipFrom, isThrottled } from '@/lib/throttle'
import { linkReferral } from '@/lib/referral'

// Κράτηση ΧΩΡΙΣ σελίδα εγγραφής (guest checkout).
// Ο επισκέπτης γράφει όνομα + κινητό + email ΜΕΣΑ στο checkout. Εδώ:
//   • ΝΕΟ email → φτιάχνουμε λογαριασμό με αυτό το email (ήδη επιβεβαιωμένο) και
//     επιστρέφουμε token για να συνδεθεί αμέσως στον browser (verifyOtp token_hash).
//     Μετά η κράτηση γίνεται με την υπάρχουσα ροή (create-cash / create-intent).
//   • Email που ΥΠΑΡΧΕΙ ήδη → { exists: true }: ο client στέλνει 8ψήφιο κωδικό στο
//     email (ίδιο με το login). Ποτέ δεν συνδέουμε κάποιον σε ξένο λογαριασμό χωρίς κωδικό.
//   • −3€ καλωσορίσματος ΕΝΑ ανά κινητό: αν το ίδιο κινητό έχει ήδη πάρει welcome ή έχει
//     κράτηση σε άλλο λογαριασμό → χωρίς −3€ (no_welcome, το σέβεται και το /api/referral/link).
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/

function safeDecode(v?: string): string {
  if (!v) return ''
  try { return decodeURIComponent(v) } catch { return v }
}

export async function POST(req: NextRequest) {
  try {
    if (await isThrottled('guest:' + ipFrom(req), 8, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Πολλές προσπάθειες. Δοκίμασε σε λίγο.' }, { status: 429 })
    }
    const body = await req.json().catch(() => ({}))
    const email = String(body?.email || '').trim().toLowerCase()
    const name = String(body?.name || '').trim().slice(0, 80)
    const phone = String(body?.phone || '').trim().slice(0, 30)
    const digits = phone.replace(/\D/g, '')

    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'Το email δεν είναι σωστό.' }, { status: 400 })
    if (name.length < 2) return NextResponse.json({ error: 'Γράψε το όνομά σου.' }, { status: 400 })
    if (digits.length < 10) return NextResponse.json({ error: 'Γράψε σωστό κινητό.' }, { status: 400 })

    // Απόδοση (ίδια κλειδιά με την κανονική εγγραφή) — από τα cookies του browser.
    const jar = req.cookies
    const ref = safeDecode(jar.get('ws_ref')?.value).trim().slice(0, 40)
    const lp = jar.get('ws_lp')?.value
    const ad = safeDecode(jar.get('ws_ad')?.value).slice(0, 60)
    const meta: Record<string, unknown> = { full_name: name, phone, signup_method: 'guest_checkout' }
    if (lp === 'map' || lp === 'login') meta.acq_lp = lp
    if (ref) meta.acq_ref = ref
    if (ad) meta.acq_ad = ad
    meta.acq_click = !!jar.get('_fbc')?.value

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, email_confirm: true, user_metadata: meta,
      // Το email δεν το επιβεβαίωσε ο κάτοχός του → βλ. /api/auth/verified.
      app_metadata: { guest_unverified: true },
    })
    if (createErr || !created?.user) {
      const msg = String(createErr?.message || '')
      const code = (createErr as { code?: string } | null)?.code
      if (code === 'email_exists' || /already|registered|exists/i.test(msg)) {
        return NextResponse.json({ exists: true })
      }
      return NextResponse.json({ error: 'Δεν ήταν δυνατή η κράτηση. Δοκίμασε ξανά.' }, { status: 500 })
    }
    const userId = created.user.id

    // Κινητό στο προφίλ (το βλέπει το πλυντήριο) — το προφίλ το φτιάχνει trigger.
    try { await admin.from('profiles').update({ phone, full_name: name }).eq('id', userId) } catch { /* best-effort */ }

    // −3€: ένα ανά κινητό (τελευταία 10 ψηφία).
    let phoneUsed = false
    try {
      const last10 = digits.slice(-10)
      const { data: same } = await admin.from('profiles').select('id').ilike('phone', `%${last10}%`).neq('id', userId).limit(10)
      const ids = (same || []).map(p => p.id as string)
      if (ids.length) {
        const [{ count: welcomes }, { count: bookings }] = await Promise.all([
          admin.from('credit_ledger').select('id', { count: 'exact', head: true }).in('user_id', ids).eq('kind', 'welcome'),
          admin.from('bookings').select('id', { count: 'exact', head: true }).in('user_id', ids),
        ])
        phoneUsed = (welcomes || 0) + (bookings || 0) > 0
      }
    } catch { /* best-effort */ }

    if (phoneUsed) {
      try { await admin.auth.admin.updateUserById(userId, { app_metadata: { no_welcome: true } }) } catch { /* ignore */ }
    } else {
      // Πριν τη σύνδεση: το −3€ πρέπει να υπάρχει ΗΔΗ όταν γίνει η κράτηση (λίγα δευτ. μετά).
      await linkReferral(admin, userId, ref || 'WELCOME')
    }

    // Token σύνδεσης για τον browser (όπως το demo login): verifyOtp({ token_hash, type: 'email' }).
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const tokenHash = link?.properties?.hashed_token
    if (linkErr || !tokenHash) {
      return NextResponse.json({ error: 'Δεν ήταν δυνατή η σύνδεση. Δοκίμασε ξανά.' }, { status: 500 })
    }
    return NextResponse.json({ tokenHash, welcome: !phoneUsed })
  } catch {
    return NextResponse.json({ error: 'Κάτι πήγε στραβά. Δοκίμασε ξανά.' }, { status: 500 })
  }
}
