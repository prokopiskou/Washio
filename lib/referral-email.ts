import type { SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { unsubHeaders, unsubFooterLink, isOptedOut } from '@/lib/unsubscribe'
import { isInternalEmail } from '@/lib/internal'

// Email «Κάλεσε έναν φίλο» (−3€ / −3€). Χρησιμοποιείται:
//  • χειροκίνητα από /api/admin/campaign (audience 'referral')
//  • αυτόματα μετά από κριτική 4–5★ (/api/review) — sendReferralAfterReview()
export const SUBJECT_REF = '3€ για σένα, 3€ για έναν φίλο σου'
export const PREHEADER_REF = 'Στείλε τον σύνδεσμό σου. Μόλις ο φίλος σου κλείσει, κερδίζετε και οι δύο.'
const REF_NEXT = '/profile/rewards?tab=referral&'

export function referralHtml(code: string, copyUrl: string, shareUrl: string, userId: string): string {
  const link = `https://www.washio.gr/?ref=${code}`
  const row = (n: string, t: string) => `<tr><td style="padding:6px 0;vertical-align:top;width:30px;"><span style="display:inline-block;width:22px;height:22px;border-radius:11px;background:#10182A;color:#fff;font-size:12px;line-height:22px;text-align:center;font-weight:700;">${n}</span></td><td style="padding:6px 0;color:#374151;font-size:14px;line-height:1.5;">${t}</td></tr>`
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#F7FAFC;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${PREHEADER_REF}</div>
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 16px;">
    <div style="background:#10182A;border-radius:18px 18px 0 0;padding:28px 28px 22px;text-align:center;">
      <img src="https://washio.gr/logo.png" alt="Washio" width="120" style="display:block;margin:0 auto 6px;" />
      <p style="margin:0;color:#19A8C7;font-size:12px;font-weight:700;letter-spacing:1.6px;">ΚΑΛΕΣΕ ΕΝΑΝ ΦΙΛΟ</p>
    </div>
    <div style="background:#FFFFFF;border:1px solid #E8EEF2;border-top:none;border-radius:0 0 18px 18px;padding:28px;">
      <h1 style="margin:0 0 14px;color:#10182A;font-size:23px;line-height:1.3;font-weight:800;"><span style="color:#078EAD;">−3€</span> για τον φίλο σου.<br/><span style="color:#078EAD;">−3€</span> για σένα.</h1>
      <p style="margin:0 0 18px;color:#4B5563;font-size:15px;line-height:1.6;">Στείλε τον σύνδεσμό σου. Ο φίλος σου παίρνει −3€ στο πρώτο του πλύσιμο. Μόλις ολοκληρωθεί το πλύσιμό του, παίρνεις κι εσύ −3€.</p>
      <div style="background:#EAF8FB;border:1px solid #CFECF3;border-radius:14px;padding:14px 16px;margin:0 0 20px;">
        <p style="margin:0 0 6px;color:#6F7785;font-size:12px;font-weight:600;">Ο σύνδεσμός σου</p>
        <p style="margin:0;color:#078EAD;font-size:16px;font-weight:800;word-break:break-all;">${link.replace('https://', '')}</p>
        <p style="margin:6px 0 0;color:#6F7785;font-size:12px;">Κωδικός: <strong style="color:#10182A;letter-spacing:1px;">${code}</strong></p>
      </div>
      <a href="${copyUrl}" style="display:block;background:#19A8C7;color:#FFFFFF;text-align:center;padding:16px;border-radius:14px;text-decoration:none;font-size:16px;font-weight:700;">Αντέγραψε τον σύνδεσμό σου →</a>
      <a href="${shareUrl}" style="display:block;margin-top:10px;background:#FFFFFF;border:1px solid #D7DEE4;color:#10182A;text-align:center;padding:14px;border-radius:14px;text-decoration:none;font-size:15px;font-weight:600;">Κοινοποίηση</a>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0;border-collapse:collapse;">
        ${row('1', 'Στέλνεις τον σύνδεσμο σε έναν φίλο')}
        ${row('2', 'Κλείνει το πρώτο του πλύσιμο με −3€')}
        ${row('3', 'Μόλις ολοκληρωθεί το πλύσιμο, παίρνεις κι εσύ −3€')}
      </table>
      <p style="margin:18px 0 0;color:#9AA3AF;font-size:12px;line-height:1.6;">Ισχύει για έως 2 φίλους (έως −6€ για σένα). Σε πλύσιμο από 12€ · ένα κουπόνι ανά πλύσιμο.</p>
    </div>
    <p style="margin:16px 0 0;color:#9AA3AF;font-size:11px;line-height:1.5;text-align:center;">Λαμβάνεις αυτό το email επειδή έχεις λογαριασμό στο Washio. Δεν θέλεις τέτοια μηνύματα; ${unsubFooterLink(userId)}.</p>
  </div></body></html>`
}

// Referral: ΕΝΑ token (κάθε νέο magic link ακυρώνει το προηγούμενο), δύο κουμπιά με
// διαφορετικό «do». Όποιο πατηθεί πρώτο κάνει login· μετά η σελίδα δουλεύει έτσι κι αλλιώς.
export async function referralLinks(admin: SupabaseClient, email: string): Promise<{ copy: string; share: string }> {
  const nx = (d: string) => `${REF_NEXT}&do=${d}`
  const fb = { copy: `https://www.washio.gr${nx('copy')}`, share: `https://www.washio.gr${nx('share')}` }
  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const th = data?.properties?.hashed_token
    if (error || !th) return fb
    const u = (d: string) => `https://www.washio.gr/auth/link?token_hash=${encodeURIComponent(th)}&next=${encodeURIComponent(nx(d))}`
    return { copy: u('copy'), share: u('share') }
  } catch { return fb }
}

const resend = new Resend(process.env.RESEND_API_KEY)

/**
 * Μετά από κριτική 4–5★: στέλνει ΜΙΑ φορά (ανά χρήστη, για πάντα) το email παραπομπής.
 * Όχι σε: ομάδα/δοκιμές, πλυντές (ιδιοκτήτες/μέλη), απεγγραμμένους, όσους το έχουν ήδη πάρει
 * (app_metadata.referral_email_at — το ίδιο ισχύει και για το χειροκίνητο: ίδιο θέμα email).
 */
export async function sendReferralAfterReview(admin: SupabaseClient, userId: string): Promise<'sent' | 'skip'> {
  const { data: u } = await admin.auth.admin.getUserById(userId)
  const user = u?.user
  const email = user?.email
  if (!user || !email || isInternalEmail(email)) return 'skip'
  const meta = (user.app_metadata || {}) as Record<string, unknown>
  if (isOptedOut(meta) || meta.referral_email_at) return 'skip'
  const [{ data: own }, { data: mem }, { data: prof }] = await Promise.all([
    admin.from('locations').select('id').eq('owner_id', userId).limit(1),
    admin.from('location_members').select('location_id').eq('user_id', userId).limit(1).then(r => r, () => ({ data: null })),
    admin.from('profiles').select('referral_code').eq('id', userId).maybeSingle(),
  ])
  if ((own && own.length) || (mem && (mem as unknown[]).length)) return 'skip'
  const code = String((prof as { referral_code?: string } | null)?.referral_code || '')
  if (!code) return 'skip'
  // Σημείωση ΠΡΙΝ την αποστολή → ποτέ διπλό (π.χ. 2 γρήγορες κριτικές).
  await admin.auth.admin.updateUserById(userId, { app_metadata: { ...meta, referral_email_at: new Date().toISOString() } })
  const l = await referralLinks(admin, email)
  const r = await resend.emails.send({
    from: 'Washio <noreply@washio.gr>', to: [email], subject: SUBJECT_REF,
    html: referralHtml(code, l.copy, l.share, userId), headers: unsubHeaders(userId),
    tags: [{ name: 'campaign', value: 'referral_after_review' }],
  })
  return r.error ? 'skip' : 'sent'
}
