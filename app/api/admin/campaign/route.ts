import { NextRequest, NextResponse } from 'next/server'
import { fetchAll } from '@/lib/fetch-all'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail, ADMIN_EMAILS } from '@/lib/admins'
import { isInternalEmail } from '@/lib/internal'
import { unsubHeaders, unsubFooterLink, isOptedOut } from '@/lib/unsubscribe'

// Καμπάνια email (τρέχουσα: «Το −3€ σου λήγει τη Δευτέρα 12/10»).
// POST { mode: 'preview' }  → πόσοι παραλήπτες + δείγμα (δεν στέλνει τίποτα)
// POST { mode: 'test' }     → στέλνει ΜΟΝΟ στον admin που είναι συνδεδεμένος
// POST { mode: 'send' }     → στέλνει σε όλους τους παραλήπτες (batch, έως 100/κλήση)
// POST { mode: 'stats' }    → ανοίγματα / κλικ / κρατήσεις της καμπάνιας (από Resend + Supabase)
// Παραλήπτες: χρήστες ΧΩΡΙΣ καμία ενεργή κράτηση. ΕΞΑΙΡΟΥΝΤΑΙ: ιδιοκτήτες πλυντηρίων,
// όσοι έκαναν αίτηση/onboarding ως πλυντήριο (κατά email) και οι admins.
// Vercel Pro: έως 300'' — 600+ παραλήπτες × προσωπικό link χωρούν άνετα σε μία κλήση.
export const maxDuration = 300

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const resend = new Resend(process.env.RESEND_API_KEY)

// Τρέχουσα καμπάνια: λήξη κουπονιού −3€ τη Δευτέρα 12/10. (Προηγούμενη: sunny_week_oct.)
const CAMPAIGN = 'coupon_expiry_1210'
const URL_CTA = `https://www.washio.gr/map?utm_source=email&utm_medium=campaign&utm_campaign=${CAMPAIGN}`
const SUBJECT = 'Η έκπτωσή σου λήγει σύντομα'
const PREHEADER = 'Γιατί να το χάσεις; Κλείσε ραντεβού και πλήρωσε στο πλυντήριο.'

// Υπενθύμιση για ΝΕΟΥΣ χρήστες (εγγράφηκαν μετά το προηγούμενο email, χωρίς κράτηση).
// ΧΩΡΙΣ ημερομηνία λήξης: σε αυτούς το −3€ υποσχέθηκε χωρίς προθεσμία (διαφημίσεις, flyers),
// οπότε δεν γράφουμε ψεύτικο «λήγει».
const CAMPAIGN_NEW = 'welcome_reminder_new'
const SUBJECT_NEW = 'Ξέχασες το −3€ σου;'
const PREHEADER_NEW = 'Δες ελεύθερες ώρες κοντά σου και κλείσε σε 30″.'
// Referral: «3€ για σένα, 3€ για έναν φίλο σου» — σε ΟΛΟΥΣ (και σε όσους έχουν κάνει κράτηση),
// με τον ΠΡΟΣΩΠΙΚΟ σύνδεσμο του καθενός. Το CTA συνδέει αυτόματα και ανοίγει την καρτέλα
// «Κάλεσε φίλους» (αντιγραφή με ένα πάτημα — μέσα σε email δεν γίνεται αντιγραφή με κλικ).
const CAMPAIGN_REF = 'referral_3plus3'
const SUBJECT_REF = '3€ για σένα, 3€ για έναν φίλο σου'
const PREHEADER_REF = 'Στείλε τον σύνδεσμό σου. Μόλις ο φίλος σου κλείσει, κερδίζετε και οι δύο.'
// «Τέλος η βροχή»: όσοι ΔΕΝ έχουν κάνει κράτηση. Πριν φύγει: −3€ σε όλους (και σε όσους τους
// έληξε) με νέα λήξη σε 7 μέρες — αλλιώς το email θα υποσχόταν κάτι που δεν ισχύει.
const CAMPAIGN_RAIN = 'rain_end_oct'
const SUBJECT_RAIN = 'Τέλος η βροχή ☀️ Το −3€ σου σε περιμένει'
const PREHEADER_RAIN = 'Μετά από τόση βροχή, το αυτοκίνητό σου το ξέρει. Κλείσε ώρα κοντά σου σε 30″.'
const RAIN_DAYS = 7
type Audience = 'all' | 'new' | 'referral' | 'rainend'
// ΟΛΑ τα προωθητικά emails που έχουμε στείλει ποτέ. Όποιος έλαβε ΕΣΤΩ ΕΝΑ, εξαιρείται από την
// υπενθύμιση «new» (μαζικές καμπάνιες + αυτόματα «δεν ολοκλήρωσες» / waitlist).
const PROMO_SUBJECTS = [
  'Από Δευτέρα ήλιος ☀️ Κλείσε το πλύσιμό σου με −3€', // sunny_week_oct (2/10)
  'Η έκπτωσή σου λήγει σύντομα',                       // coupon_expiry_1210 (5/10)
  'Ξέχασες το −3€ σου;',                                // welcome_reminder_new
  'Το −3€ σου σε περιμένει',                            // cron welcome-nudge (1h+ μετά την εγγραφή)
  'Το −3€ σου λήγει σήμερα',                            // lib/coupon-expiry (ημέρα λήξης, 13:00)
  'Δεν ολοκλήρωσες την κράτησή σου',                    // cron abandoned-checkout
  'Άνοιξε ώρα κοντά σου!',                              // ακύρωση → waitlist
  'Το Washio ήρθε στην περιοχή σου!',                   // waitlist-notify
  SUBJECT_RAIN,                                          // rain_end_oct
]
const cfg = (a: Audience) => a === 'rainend'
  ? { campaign: CAMPAIGN_RAIN, subject: SUBJECT_RAIN, preheader: PREHEADER_RAIN }
  : a === 'referral'
  ? { campaign: CAMPAIGN_REF, subject: SUBJECT_REF, preheader: PREHEADER_REF }
  : a === 'new'
  ? { campaign: CAMPAIGN_NEW, subject: SUBJECT_NEW, preheader: PREHEADER_NEW }
  : { campaign: CAMPAIGN, subject: SUBJECT, preheader: PREHEADER }
// Πού οδηγεί το CTA (μετά το αυτόματο login).
const nextFor = (a: Audience) => (a === 'referral' ? '/profile/rewards?tab=referral&' : '/map?')
  + 'utm_source=email&utm_medium=campaign&utm_campaign=' + cfg(a).campaign
const ctaFor = (a: Audience) => `https://www.washio.gr${nextFor(a)}`

// ── Email παραπομπής (3€ + 3€) ──
// copyUrl / shareUrl: ίδιο προσωπικό login, διαφορετικό «do" → η σελίδα επισημαίνει το αντίστοιχο κουμπί.
// (Μέσα σε email δεν ανοίγει το μενού κοινοποίησης του κινητού — ανοίγει με ένα πάτημα στη σελίδα.)
function referralHtml(code: string, copyUrl: string, shareUrl: string, userId: string): string {
  const link = `https://washio.gr/?ref=${code}`
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
      <p style="margin:18px 0 0;color:#9AA3AF;font-size:12px;line-height:1.6;">Ισχύει για έως 2 φίλους (έως −6€ για σένα). Σε πλύσιμο από 12€ · ένα κουπόνι ανά πλύσιμο · κάρτα ή μετρητά.</p>
    </div>
    <p style="margin:16px 0 0;color:#9AA3AF;font-size:11px;line-height:1.5;text-align:center;">Λαμβάνεις αυτό το email επειδή έχεις λογαριασμό στο Washio. Δεν θέλεις τέτοια μηνύματα; ${unsubFooterLink(userId)}.</p>
  </div></body></html>`
}

// Ημερομηνία λήξης για το «Τέλος η βροχή» (τέλος της ημέρας, ώρα Ελλάδας ≈ 21:59 UTC χειμώνα).
function rainExpiry(): { iso: string; label: string } {
  const d = new Date(Date.now() + RAIN_DAYS * 24 * 3600 * 1000)
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(d)
  const [y, m, dd] = ymd.split('-')
  return { iso: `${y}-${m}-${dd}T21:59:59.000Z`, label: `${Number(dd)}/${Number(m)}` }
}

function rainHtml(ctaUrl: string, userId: string, until: string): string {
  const row = (t: string) => `<tr><td style="padding:5px 0;vertical-align:top;width:26px;"><span style="display:inline-block;width:18px;height:18px;border-radius:9px;background:#19A8C7;color:#fff;font-size:12px;line-height:18px;text-align:center;font-weight:700;">✓</span></td><td style="padding:5px 0;color:#374151;font-size:14px;line-height:1.5;">${t}</td></tr>`
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#F7FAFC;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${PREHEADER_RAIN}</div>
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 16px;">
    <div style="background:#10182A;border-radius:18px 18px 0 0;padding:28px 28px 22px;text-align:center;">
      <img src="https://washio.gr/logo.png" alt="Washio" width="120" style="display:block;margin:0 auto 6px;" />
      <p style="margin:0;color:#19A8C7;font-size:12px;font-weight:700;letter-spacing:1.6px;">ΤΕΛΟΣ Η ΒΡΟΧΗ ☀️</p>
    </div>
    <div style="background:#FFFFFF;border:1px solid #E8EEF2;border-top:none;border-radius:0 0 18px 18px;padding:28px;">
      <h1 style="margin:0 0 14px;color:#10182A;font-size:23px;line-height:1.3;font-weight:800;">Τόσες μέρες βροχή. Το αυτοκίνητό σου <span style="color:#078EAD;">το ξέρει</span>.</h1>
      <p style="margin:0 0 18px;color:#4B5563;font-size:15px;line-height:1.6;">Ο καιρός ανοίγει. Βρες πλυντήριο κοντά σου, δες ελεύθερες ώρες και κλείσε σε 30″. Πληρώνεις στο πλυντήριο.</p>
      <div style="background:#EAF8FB;border:1px solid #CFECF3;border-radius:14px;padding:14px 16px;margin:0 0 20px;">
        <p style="margin:0;color:#078EAD;font-size:15px;font-weight:800;">🎁 −3€ στο πρώτο σου πλύσιμο</p>
        <p style="margin:4px 0 0;color:#6F7785;font-size:12px;">Είναι ήδη στον λογαριασμό σου · Ισχύει έως ${until} · Σε πλύσιμο από 12€.</p>
      </div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border-collapse:collapse;">
        ${row('Ελεύθερες ώρες σε πραγματικό χρόνο')}
        ${row('Πας στην ώρα σου, χωρίς ουρά')}
        ${row('Δωρεάν ακύρωση')}
      </table>
      <a href="${ctaUrl}" style="display:block;background:#19A8C7;color:#FFFFFF;text-align:center;padding:16px;border-radius:14px;text-decoration:none;font-size:16px;font-weight:700;">Κλείσε το πλύσιμό σου →</a>
    </div>
    <p style="margin:16px 0 0;color:#9AA3AF;font-size:11px;line-height:1.5;text-align:center;">Λαμβάνεις αυτό το email επειδή έχεις λογαριασμό στο Washio. Δεν θέλεις τέτοια μηνύματα; ${unsubFooterLink(userId)}.</p>
  </div></body></html>`
}

function html(hasCoupon: boolean, ctaUrl: string = URL_CTA, audience: Audience = 'all', userId = ''): string {
  const isNew = audience === 'new'
  const row = (t: string) => `<tr><td style="padding:5px 0;vertical-align:top;width:26px;"><span style="display:inline-block;width:18px;height:18px;border-radius:9px;background:#19A8C7;color:#fff;font-size:12px;line-height:18px;text-align:center;font-weight:700;">✓</span></td><td style="padding:5px 0;color:#374151;font-size:14px;line-height:1.5;">${t}</td></tr>`
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#F7FAFC;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${cfg(audience).preheader}</div>
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 16px;">
    <div style="background:#10182A;border-radius:18px 18px 0 0;padding:28px 28px 22px;text-align:center;">
      <img src="https://washio.gr/logo.png" alt="Washio" width="120" style="display:block;margin:0 auto 6px;" />
      <p style="margin:0;color:#19A8C7;font-size:12px;font-weight:700;letter-spacing:1.6px;">${isNew ? 'ΤΟ ΔΩΡΟ ΣΟΥ ΣΕ ΠΕΡΙΜΕΝΕΙ' : 'ΤΟ ΚΟΥΠΟΝΙ ΣΟΥ ΛΗΓΕΙ'}</p>
    </div>
    <div style="background:#FFFFFF;border:1px solid #E8EEF2;border-top:none;border-radius:0 0 18px 18px;padding:28px;">
      ${isNew
        ? `<h1 style="margin:0 0 14px;color:#10182A;font-size:23px;line-height:1.3;font-weight:800;">Το <span style="color:#078EAD;">−3€</span> για το πρώτο σου πλύσιμο σε περιμένει.</h1>
      <p style="margin:0 0 18px;color:#4B5563;font-size:15px;line-height:1.6;">Βρες το πλυντήριο που σε βολεύει, δες ελεύθερες ώρες και κλείσε σε 30″. Πας στην ώρα σου, χωρίς αναμονή.</p>`
        : `<h1 style="margin:0 0 14px;color:#10182A;font-size:23px;line-height:1.3;font-weight:800;">Το πλύσιμό σου έγινε 3€ φθηνότερο μέχρι τη <span style="color:#078EAD;">Δευτέρα 12/10</span>.</h1>
      <p style="margin:0 0 18px;color:#4B5563;font-size:15px;line-height:1.6;"><strong style="color:#10182A;">Γιατί να το χάσεις;</strong> Βρες το πλυντήριο που σε βολεύει, κλείσε ραντεβού και άσε την αναμονή για τον επόμενο.</p>`}
      ${hasCoupon ? `<div style="background:#EAF8FB;border:1px solid #CFECF3;border-radius:14px;padding:14px 16px;margin:0 0 20px;">
        <p style="margin:0;color:#078EAD;font-size:15px;font-weight:800;">🎁 3€ έκπτωση στο πρώτο σου πλύσιμο</p>
        <p style="margin:4px 0 0;color:#6F7785;font-size:12px;">${isNew ? 'Είναι ήδη στον λογαριασμό σου · Κάρτα ή μετρητά, όπως θες · Σε πλύσιμο από 12€.' : 'Είναι ήδη στον λογαριασμό σου · Πληρώνεις στο πλυντήριο ή με κάρτα · Σε πλύσιμο από 12€.'}</p>
      </div>` : ''}
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px;border-collapse:collapse;">
        ${row('Ελεύθερες ώρες σε πραγματικό χρόνο')}
        ${row('Πας στην ώρα σου, χωρίς ουρά')}
        ${row('Δωρεάν ακύρωση έως 2 ώρες πριν')}
      </table>
      <a href="${ctaUrl}" style="display:block;background:#19A8C7;color:#FFFFFF;text-align:center;padding:16px;border-radius:14px;text-decoration:none;font-size:16px;font-weight:700;">Κλείσε το ραντεβού σου →</a>
      <p style="margin:20px 0 0;color:#9AA3AF;font-size:12px;line-height:1.6;text-align:center;">📍 Αργυρούπολη · Άλιμος · Άγ. Δημήτριος · Ηλιούπολη · Βύρωνας · Ζωγράφου</p>
    </div>
    <p style="margin:16px 0 0;color:#9AA3AF;font-size:11px;line-height:1.5;text-align:center;">Λαμβάνεις αυτό το email επειδή έχεις λογαριασμό στο Washio. Δεν θέλεις τέτοια μηνύματα; ${unsubFooterLink(userId)}.</p>
  </div></body></html>`
}


// ΠΡΟΣΩΠΙΚΟ link: συνδέει αυτόματα τον χρήστη (χωρίς κωδικό) και τον πάει στον χάρτη.
// Ισχύει όσο το «Email OTP expiration» του Supabase (ρυθμισμένο στις 24 ώρες).
// Αν λήξει ή αποτύχει → η σελίδα /auth/link τον στέλνει στο κανονικό login (ίδιος προορισμός).
async function personalLink(email: string, audience: Audience = 'all'): Promise<string> {
  const fallback = ctaFor(audience)
  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const th = data?.properties?.hashed_token
    if (error || !th) return fallback
    const next = nextFor(audience)
    return `https://www.washio.gr/auth/link?token_hash=${encodeURIComponent(th)}&next=${encodeURIComponent(next)}`
  } catch { return fallback }
}

// Referral: ΕΝΑ token (κάθε νέο magic link ακυρώνει το προηγούμενο), δύο κουμπιά με
// διαφορετικό «do». Όποιο πατηθεί πρώτο κάνει login· μετά η σελίδα δουλεύει έτσι κι αλλιώς.
async function referralLinks(email: string): Promise<{ copy: string; share: string }> {
  const nx = (d: string) => `${nextFor('referral')}&do=${d}`
  const fb = { copy: `https://www.washio.gr${nx('copy')}`, share: `https://www.washio.gr${nx('share')}` }
  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const th = data?.properties?.hashed_token
    if (error || !th) return fb
    const u = (d: string) => `https://www.washio.gr/auth/link?token_hash=${encodeURIComponent(th)}&next=${encodeURIComponent(nx(d))}`
    return { copy: u('copy'), share: u('share') }
  } catch { return fb }
}

// Τρέξε async δουλειές με όριο ταυτόχρονων (για να μη «χτυπήσουμε» το Auth API).
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]) }
  }))
  return out
}

async function recipients(audience: Audience = 'all') {
  // Όλοι οι χρήστες (σελιδοποίηση Auth API).
  const users: { id: string; email: string }[] = []
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    // Μόνο ΟΛΟΚΛΗΡΩΜΕΝΟΙ λογαριασμοί (επαλήθευσαν email / συνδέθηκαν τουλάχιστον μία φορά).
    // Όσοι ζήτησαν κωδικό και δεν τον έβαλαν ποτέ συχνά έχουν λάθος email (π.χ. «gmail.con")
    // → bounce → χαλάει η φήμη του washio.gr και κινδυνεύουν να πάνε στα spam και τα OTP.
    for (const u of data.users) if (u.email && (u.last_sign_in_at || u.email_confirmed_at) && !isOptedOut(u.app_metadata as Record<string, unknown>)) users.push({ id: u.id, email: u.email.toLowerCase() })
    if (data.users.length < 1000) break
  }
  const [{ data: booked }, { data: owners }, { data: profs }, { data: apps }, { data: onb }] = await Promise.all([
    fetchAll<{ user_id: string }>(() => admin.from('bookings').select('id, user_id').not('user_id', 'is', null).neq('status', 'cancelled').order('id')),
    admin.from('locations').select('owner_id').not('owner_id', 'is', null),
    fetchAll<{ id: string; referral_credit: number; referral_code: string }>(() => admin.from('profiles').select('id, referral_credit, referral_code').order('id')),
    // Πλυντήρια που έκαναν αίτηση / onboarding (ακόμα κι αν δεν έχουν ενεργό σημείο).
    admin.from('applications').select('email'),
    admin.from('partner_onboarding').select('email'),
  ])
  const bookedSet = new Set((booked || []).map(b => b.user_id as string))
  const ownerSet = new Set((owners || []).map(o => o.owner_id as string))
  const partnerEmails = new Set(
    [...(apps || []), ...(onb || [])].map(r => String((r as { email?: string }).email || '').trim().toLowerCase()).filter(Boolean)
  )
  const credit = new Map((profs || []).map(p => [p.id as string, Number(p.referral_credit) || 0]))
  const codes = new Map((profs || []).map(p => [p.id as string, String(p.referral_code || '')]))
  // Referral: ΚΑΙ όσοι έχουν κράτηση (οι πιο αξιόπιστοι για σύσταση) — όχι ομάδα/δοκιμές, μόνο με κωδικό.
  const isRef = audience === 'referral'
  return users
    .filter(u => (isRef || !bookedSet.has(u.id)) && !ownerSet.has(u.id) && !partnerEmails.has(u.email) && !ADMIN_EMAILS.includes(u.email))
    .filter(u => !isRef || (!isInternalEmail(u.email) && !!codes.get(u.id)))
    .map(u => ({ ...u, hasCoupon: (credit.get(u.id) || 0) >= 3, code: codes.get(u.id) || '', booked: bookedSet.has(u.id) }))
}

// ── Στατιστικά καμπάνιας από το Resend (GET /emails → last_event ανά email) ──
// Δεν χρειάζεται webhook ούτε νέο πίνακα: διαβάζουμε τα email της καμπάνιας (ίδιο θέμα, όχι [ΔΟΚΙΜΗ]).
// last_event: sent | delivered | opened | clicked | bounced | complained | failed | suppressed | delivery_delayed
type ResendListed = { id: string; to: string[]; subject: string; created_at: string; last_event: string }

// Resend: «2026-10-05 10:50:12.123456+00» → έγκυρο ISO (T, ms, +00:00).
function resendDateToIso(v: string): string {
  const m = String(v).trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?$/)
  if (!m) { const d = new Date(v); return isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString() }
  const ms = m[3] ? m[3].slice(0, 4).padEnd(4, '0') : '.000'
  let tz = m[4] || 'Z'
  if (/^[+-]\d{2}$/.test(tz)) tz += ':00'
  else if (/^[+-]\d{4}$/.test(tz)) tz = tz.slice(0, 3) + ':' + tz.slice(3)
  const d = new Date(`${m[1]}T${m[2]}${ms}${tz}`)
  return isNaN(d.getTime()) ? new Date(0).toISOString() : d.toISOString()
}

async function listCampaignEmails(subjects: string[]): Promise<ResendListed[]> {
  const emails: ResendListed[] = []
  let after: string | undefined
  for (let page = 0; page < 120; page++) {
    const url = 'https://api.resend.com/emails?limit=100' + (after ? `&after=${after}` : '')
    // Ξεχωριστό key ΜΟΝΟ για ανάγνωση στατιστικών (Full access). Το key αποστολής μένει «Sending access».
    const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.RESEND_STATS_API_KEY || process.env.RESEND_API_KEY}` }, cache: 'no-store' })
    if (res.status === 429) { await new Promise(r => setTimeout(r, 1200)); page--; continue }
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      const m = String(json?.message || json?.name || res.status)
      throw new Error(/restricted|permission|sending access/i.test(m)
        ? 'Λείπει το RESEND_STATS_API_KEY (Resend key με «Full access») στο Vercel — χωρίς αυτό δεν διαβάζονται στατιστικά.'
        : 'Resend: ' + m)
    }
    const data = (json.data || []) as ResendListed[]
    emails.push(...data.filter(e => subjects.includes(e.subject)))
    if (!json.has_more || !data.length) break
    after = data[data.length - 1].id
    await new Promise(r => setTimeout(r, 300))
  }
  return emails
}

async function campaignStats(audience: Audience = 'all') {
  const emails = await listCampaignEmails([cfg(audience).subject])

  const by = (ev: string[]) => emails.filter(e => ev.includes(e.last_event)).length
  const sent = emails.length
  const bounced = by(['bounced', 'failed', 'suppressed'])
  const complained = by(['complained'])
  const clicked = by(['clicked'])
  const opened = by(['opened', 'clicked'])
  const delivered = by(['delivered', 'opened', 'clicked', 'complained'])
  const pct = (n: number) => (delivered ? Math.round((n / delivered) * 1000) / 10 : 0)

  // Κρατήσεις ΜΕΤΑ την αποστολή από όσους πήραν το email (η πραγματική μέτρηση).
  let bookings = 0, bookers = 0, revenue = 0
  if (sent) {
    const firstSent = emails.reduce((min, e) => (e.created_at < min ? e.created_at : min), emails[0].created_at)
    const toSet = new Set(emails.flatMap(e => (e.to || []).map(x => x.toLowerCase())))
    const ids: string[] = []
    for (let page = 1; page <= 20; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
      for (const u of data?.users || []) if (u.email && toSet.has(u.email.toLowerCase())) ids.push(u.id)
      if (!data || data.users.length < 1000) break
    }
    if (ids.length) {
      const { data: bk } = await admin.from('bookings').select('user_id, total_amount')
        .in('user_id', ids).neq('status', 'cancelled').gte('created_at', resendDateToIso(firstSent))
      bookings = bk?.length || 0
      bookers = new Set((bk || []).map(b => b.user_id)).size
      revenue = (bk || []).reduce((s, b) => s + Number(b.total_amount || 0), 0)
    }
  }

  return {
    sent, delivered, opened, clicked, bounced, complained,
    openRate: pct(opened), clickRate: pct(clicked),
    clickToOpen: opened ? Math.round((clicked / opened) * 1000) / 10 : 0,
    bookings, bookers, revenue: Math.round(revenue * 100) / 100,
    firstSentAt: sent ? emails[emails.length - 1].created_at : null,
  }
}

export async function POST(req: NextRequest) {
  try {
    const sb = await createServerClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })

    const { mode, audience: aud } = (await req.json().catch(() => ({}))) as { mode?: 'preview' | 'test' | 'send' | 'stats'; audience?: Audience }
    const audience: Audience = aud === 'new' ? 'new' : aud === 'referral' ? 'referral' : aud === 'rainend' ? 'rainend' : 'all'
    const { subject: SUBJ, campaign: CAMP } = cfg(audience)
    if (mode === 'stats') return NextResponse.json(await campaignStats(audience))

    // «new»: ΜΟΝΟ όσοι δεν έχουν λάβει ΚΑΝΕΝΑ από τα δύο emails (ούτε το «λήγει 12/10»,
    // ούτε αυτό) — ποτέ δεύτερο email στον ίδιο. Η λίστα αποστολών έρχεται από το Resend.
    // «referral»: ποτέ δεύτερη φορά το ίδιο email παραπομπής στον ίδιο.
    let alreadySent = new Set<string>()
    if (audience === 'new' || audience === 'referral' || audience === 'rainend') {
      const prev = await listCampaignEmails(audience === 'new' ? PROMO_SUBJECTS : audience === 'rainend' ? [SUBJECT_RAIN] : [SUBJECT_REF])
      alreadySent = new Set(prev.flatMap(e => (e.to || []).map(x => x.toLowerCase())))
    }
    const list = (await recipients(audience)).filter(r => !alreadySent.has(r.email))

    // ── Referral: χωρίς χορήγηση κουπονιού, κάθε email με τον δικό του σύνδεσμο ──
    if (audience === 'referral') {
      if (mode === 'preview') {
        return NextResponse.json({
          subject: SUBJ, total: list.length, withCoupon: list.filter(r => r.booked).length, willGetCoupon: 0,
          excludedAlreadyEmailed: alreadySent.size,
          sample: list.slice(0, 5).map(r => r.email.replace(/^(.{2}).*(@.*)$/, '$1***$2')),
        })
      }
      if (mode === 'test') {
        const { data: me } = await admin.from('profiles').select('referral_code').eq('id', user.id).maybeSingle()
        const code = String(me?.referral_code || 'WASHIO')
        const { error } = await resend.emails.send({
          from: 'Washio <noreply@washio.gr>', to: user.email!, subject: '[ΔΟΚΙΜΗ] ' + SUBJ,
          html: await (async () => { const l = await referralLinks(user.email!); return referralHtml(code, l.copy, l.share, user.id) })(),
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ ok: true, sentTo: user.email })
      }
      if (mode === 'send') {
        const links = await mapLimit(list, 10, r => referralLinks(r.email))
        let sent = 0
        const errors: string[] = []
        for (let i = 0; i < list.length; i += 100) {
          const chunk = list.slice(i, i + 100)
          const { error } = await resend.batch.send(chunk.map((r, k) => ({
            from: 'Washio <noreply@washio.gr>', to: r.email, subject: SUBJ,
            html: referralHtml(r.code, links[i + k].copy, links[i + k].share, r.id),
            headers: unsubHeaders(r.id),
            tags: [{ name: 'campaign', value: CAMP }],
          })))
          if (error) errors.push(error.message)
          else sent += chunk.length
        }
        return NextResponse.json({ ok: errors.length === 0, sent, skipped: 0, couponsGiven: 0, errors })
      }
    }

    // ── Τέλος η βροχή ──
    if (audience === 'rainend') {
      const exp = rainExpiry()
      if (mode === 'preview') {
        return NextResponse.json({
          subject: SUBJ, total: list.length, withCoupon: list.filter(r => r.hasCoupon).length,
          willGetCoupon: list.filter(r => !r.hasCoupon).length, couponUntil: exp.label,
          excludedAlreadyEmailed: alreadySent.size,
          sample: list.slice(0, 5).map(r => r.email.replace(/^(.{2}).*(@.*)$/, '$1***$2')),
        })
      }
      if (mode === 'test') {
        const { error } = await resend.emails.send({
          from: 'Washio <noreply@washio.gr>', to: user.email!, subject: '[ΔΟΚΙΜΗ] ' + SUBJ,
          html: rainHtml(await personalLink(user.email!, audience), user.id, exp.label),
        })
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json({ ok: true, sentTo: user.email })
      }
      if (mode === 'send') {
        // 1) −3€ σε όσους δεν το έχουν (πρώτη φορά → welcome · αλλιώς «επανενεργοποίηση»).
        const missing = list.filter(r => !r.hasCoupon)
        if (missing.length) {
          const { data: hadWelcome } = await admin.from('credit_ledger')
            .select('user_id').eq('kind', 'welcome').in('user_id', missing.map(m => m.id))
          const had = new Set((hadWelcome || []).map(h => h.user_id as string))
          for (const m of missing) {
            await admin.rpc('apply_credit', had.has(m.id)
              ? { p_user: m.id, p_delta: 3, p_kind: 'redeem', p_note: 'Δώρο: τέλος η βροχή' }
              : { p_user: m.id, p_delta: 3, p_kind: 'welcome', p_note: 'Καλωσόρισμα' })
          }
        }
        // 2) Νέα λήξη σε 7 μέρες για ΟΛΟΥΣ τους παραλήπτες (να μην «καεί» πριν προλάβουν).
        await mapLimit(list, 10, async r => {
          try { await admin.auth.admin.updateUserById(r.id, { app_metadata: { coupon_expires_at: exp.iso, coupon_expired_at: null, coupon_reminder_at: null } }) } catch { /* ignore */ }
        })
        // 3) Αποστολή — μόνο σε όσους ΟΝΤΩΣ έχουν −3€ τώρα.
        const fresh = (await recipients(audience)).filter(r => !alreadySent.has(r.email) && r.hasCoupon)
        const links = await mapLimit(fresh, 10, r => personalLink(r.email, audience))
        let sent = 0
        const errors: string[] = []
        for (let i = 0; i < fresh.length; i += 100) {
          const chunk = fresh.slice(i, i + 100)
          const { error } = await resend.batch.send(chunk.map((r, k) => ({
            from: 'Washio <noreply@washio.gr>', to: r.email, subject: SUBJ,
            html: rainHtml(links[i + k] || ctaFor(audience), r.id, exp.label),
            headers: unsubHeaders(r.id),
            tags: [{ name: 'campaign', value: CAMP }],
          })))
          if (error) errors.push(error.message)
          else sent += chunk.length
        }
        return NextResponse.json({ ok: errors.length === 0, sent, couponsGiven: missing.length, couponUntil: exp.label, errors })
      }
    }

    if (mode === 'preview') {
      return NextResponse.json({
        excludedAlreadyEmailed: audience === 'new' ? alreadySent.size : 0,
        subject: SUBJ,
        total: list.length,
        withCoupon: list.filter(r => r.hasCoupon).length,
      // Όσοι δεν έχουν ακόμα −3€ θα το πάρουν ΑΥΤΟΜΑΤΑ πριν φύγει το email (δεν έχουν κράτηση → δικαιούνται).
      willGetCoupon: list.filter(r => !r.hasCoupon).length,
        sample: list.slice(0, 5).map(r => r.email.replace(/^(.{2}).*(@.*)$/, '$1***$2')),
      })
    }

    if (mode === 'test') {
      const { error } = await resend.emails.send({
        from: 'Washio <noreply@washio.gr>',
        to: user.email!,
        subject: '[ΔΟΚΙΜΗ] ' + SUBJ,
        html: html(true, await personalLink(user.email!, audience), audience, user.id),
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, sentTo: user.email })
    }

    if (mode === 'send') {
      // 1) Το email υπόσχεται −3€ → ΚΑΘΕ παραλήπτης πρέπει να το έχει ΠΡΙΝ φύγει.
      //    Όλοι εδώ είναι χωρίς κράτηση, άρα δικαιούνται το welcome (ίδια πολιτική με την εγγραφή).
      //    Μόνο σε όσους δεν έχουν ήδη πάρει welcome (όχι διπλό).
      const missing = list.filter(r => !r.hasCoupon)
      if (missing.length) {
        const { data: hadWelcome } = await admin.from('credit_ledger')
          .select('user_id').eq('kind', 'welcome').in('user_id', missing.map(m => m.id))
        const had = new Set((hadWelcome || []).map(h => h.user_id as string))
        for (const m of missing) {
          if (had.has(m.id)) continue
          await admin.rpc('apply_credit', { p_user: m.id, p_delta: 3, p_kind: 'welcome', p_note: 'Καλωσόρισμα' })
        }
      }
      // Ξαναδιάβασε υπόλοιπα — στέλνεται μόνο σε όσους ΟΝΤΩΣ έχουν −3€ τώρα.
      const fresh = (await recipients(audience)).filter(r => !alreadySent.has(r.email))
      const finalList = fresh.filter(r => r.hasCoupon)
      const skipped = fresh.length - finalList.length

      // Προσωπικό link για τον καθένα (10 ταυτόχρονα).
      const links = await mapLimit(finalList, 10, r => personalLink(r.email, audience))
      const linkByEmail = new Map(finalList.map((r, k) => [r.email, links[k]]))

      let sent = 0
      const errors: string[] = []
      for (let i = 0; i < finalList.length; i += 100) {
        const chunk = finalList.slice(i, i + 100)
        const { error } = await resend.batch.send(chunk.map(r => ({
          from: 'Washio <noreply@washio.gr>',
          to: r.email,
          subject: SUBJ,
          html: html(true, linkByEmail.get(r.email) || ctaFor(audience), audience, r.id),
          headers: unsubHeaders(r.id),
          tags: [{ name: 'campaign', value: CAMP }],
        })))
        if (error) errors.push(error.message)
        else sent += chunk.length
      }
      return NextResponse.json({ ok: errors.length === 0, sent, skipped, couponsGiven: missing.length, errors })
    }

    return NextResponse.json({ error: 'mode: preview | test | send | stats' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Σφάλμα' }, { status: 500 })
  }
}
