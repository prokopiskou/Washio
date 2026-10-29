import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { ipFrom, isThrottled } from '@/lib/throttle'

// /aqua → «Στείλε μου το link μου»: ο πελάτης (συνήθως έχει ήδη κλείσει, αλλά δεν είναι
// συνδεδεμένος στον browser) βάζει το email του → παίρνει email με:
//   • το προσωπικό link παραπομπής του (washio.gr/?ref=ΚΩΔΙΚΟΣ) — το στέλνει κατευθείαν σε φίλους
//   • κουμπί που τον συνδέει αυτόματα (magic link) στο «Κάλεσε φίλους».
// Απάντηση πάντα ίδια (δεν αποκαλύπτουμε αν υπάρχει λογαριασμός).
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const resend = new Resend(process.env.RESEND_API_KEY)
const NEXT = '/profile/rewards?tab=referral&do=share&utm_source=aqua&utm_medium=email&utm_campaign=airfreshener'

export async function POST(req: NextRequest) {
  const { email: raw } = await req.json().catch(() => ({}))
  const email = String(raw || '').trim().toLowerCase().slice(0, 120)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ ok: false, error: 'Γράψε ένα σωστό email' }, { status: 400 })
  if (await isThrottled('aqua:ip:' + ipFrom(req), 8, 60 * 60 * 1000) || await isThrottled('aqua:e:' + email, 3, 60 * 60 * 1000)) {
    return NextResponse.json({ ok: false, error: 'Πολλές προσπάθειες. Δοκίμασε σε λίγο.' }, { status: 429 })
  }

  try {
    const { data: prof } = await admin.from('profiles').select('id, referral_code, full_name').ilike('email', email.replace(/[%_\\]/g, m => '\\' + m)).limit(1).maybeSingle()
    if (prof?.referral_code) {
      const refLink = `https://www.washio.gr/?ref=${prof.referral_code}`
      let loginLink = `https://www.washio.gr/login?redirect=${encodeURIComponent(NEXT)}`
      try {
        const { data } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
        const th = data?.properties?.hashed_token
        if (th) loginLink = `https://www.washio.gr/auth/link?token_hash=${encodeURIComponent(th)}&next=${encodeURIComponent(NEXT)}`
      } catch { /* fallback: κανονικό login */ }
      const first = String(prof.full_name || '').trim().split(/\s+/)[0] || ''
      await resend.emails.send({
        from: 'Washio <noreply@washio.gr>',
        to: email,
        subject: 'Το link σου: φέρε φίλο, κερδίστε και οι δύο −3€',
        html: `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; background: #fff;">
      <div style="background: #10182A; padding: 28px; text-align: center; border-radius: 16px 16px 0 0;">
        <h1 style="color: white; font-size: 22px; font-weight: 600; margin: 0;">washio</h1>
        <p style="color: #8A93A6; font-size: 12px; margin: 6px 0 0;">Aqua × Washio</p>
      </div>
      <div style="padding: 28px; border: 1px solid #F0F0F0; border-top: none; border-radius: 0 0 16px 16px;">
        <h2 style="font-size: 19px; font-weight: 700; color: #10182A; margin: 0 0 8px; text-align: center;">${first ? first + ', φ' : 'Φ'}έρε έναν φίλο — κερδίστε και οι δύο <span style="color:#19A8C7">−3€</span></h2>
        <p style="color: #666; font-size: 13px; line-height: 1.6; margin: 0 0 20px; text-align: center;">Ο φίλος σου παίρνει −3€ στο πρώτο του πλύσιμο — κι εσύ −3€ μόλις το ολοκληρώσει.</p>
        <p style="color: #999; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; margin: 0 0 6px;">Το link σου — στείλ' το σε φίλους</p>
        <div style="background: #F0F9FC; border: 1px dashed #19A8C7; border-radius: 10px; padding: 12px; text-align: center; font-family: monospace; font-size: 14px; color: #10182A; margin-bottom: 20px;"><a href="${refLink}" style="color:#10182A; text-decoration:none;">${refLink.replace('https://', '')}</a></div>
        <a href="${loginLink}" style="display: block; background: #10182A; color: white; text-align: center; padding: 14px; border-radius: 12px; text-decoration: none; font-size: 14px; font-weight: 600;">Άνοιξε & στείλε σε φίλους →</a>
        <p style="color: #BBB; font-size: 11px; text-align: center; margin: 18px 0 0;">Ζήτησες αυτό το email από το QR του αρωματικού Aqua × Washio.</p>
      </div>
    </div>`,
      })
    }
  } catch (e) {
    console.error('aqua send:', e instanceof Error ? e.message : e)
  }
  return NextResponse.json({ ok: true })
}
