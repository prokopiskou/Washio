import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail, ADMIN_EMAILS } from '@/lib/admins'

// Καμπάνια email (τρέχουσα: «Το −3€ σου λήγει τη Δευτέρα 12/10»).
// POST { mode: 'preview' }  → πόσοι παραλήπτες + δείγμα (δεν στέλνει τίποτα)
// POST { mode: 'test' }     → στέλνει ΜΟΝΟ στον admin που είναι συνδεδεμένος
// POST { mode: 'send' }     → στέλνει σε όλους τους παραλήπτες (batch, έως 100/κλήση)
// POST { mode: 'stats' }    → ανοίγματα / κλικ / κρατήσεις της καμπάνιας (από Resend + Supabase)
// Παραλήπτες: χρήστες ΧΩΡΙΣ καμία ενεργή κράτηση. ΕΞΑΙΡΟΥΝΤΑΙ: ιδιοκτήτες πλυντηρίων,
// όσοι έκαναν αίτηση/onboarding ως πλυντήριο (κατά email) και οι admins.
export const maxDuration = 60

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
type Audience = 'all' | 'new'
// ΟΛΑ τα προωθητικά emails που έχουμε στείλει ποτέ. Όποιος έλαβε ΕΣΤΩ ΕΝΑ, εξαιρείται από την
// υπενθύμιση «new» (μαζικές καμπάνιες + αυτόματα «δεν ολοκλήρωσες» / waitlist).
const PROMO_SUBJECTS = [
  'Από Δευτέρα ήλιος ☀️ Κλείσε το πλύσιμό σου με −3€', // sunny_week_oct (2/10)
  'Η έκπτωσή σου λήγει σύντομα',                       // coupon_expiry_1210 (5/10)
  'Ξέχασες το −3€ σου;',                                // welcome_reminder_new
  'Το −3€ σου σε περιμένει',                            // cron welcome-nudge (1h+ μετά την εγγραφή)
  'Δεν ολοκλήρωσες την κράτησή σου',                    // cron abandoned-checkout
  'Άνοιξε ώρα κοντά σου!',                              // ακύρωση → waitlist
  'Το Washio ήρθε στην περιοχή σου!',                   // waitlist-notify
]
const cfg = (a: Audience) => a === 'new'
  ? { campaign: CAMPAIGN_NEW, subject: SUBJECT_NEW, preheader: PREHEADER_NEW }
  : { campaign: CAMPAIGN, subject: SUBJECT, preheader: PREHEADER }
const ctaFor = (a: Audience) => `https://www.washio.gr/map?utm_source=email&utm_medium=campaign&utm_campaign=${cfg(a).campaign}`

function html(hasCoupon: boolean, ctaUrl: string = URL_CTA, audience: Audience = 'all'): string {
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
    <p style="margin:16px 0 0;color:#9AA3AF;font-size:11px;line-height:1.5;text-align:center;">Λαμβάνεις αυτό το email επειδή έχεις λογαριασμό στο Washio. Δεν θέλεις τέτοια μηνύματα; <a href="mailto:withinsuccess@gmail.com?subject=Unsubscribe%20Washio" style="color:#9AA3AF;">Διαγραφή</a>.</p>
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
    const next = '/map?utm_source=email&utm_medium=campaign&utm_campaign=' + cfg(audience).campaign
    return `https://www.washio.gr/auth/link?token_hash=${encodeURIComponent(th)}&next=${encodeURIComponent(next)}`
  } catch { return fallback }
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

async function recipients() {
  // Όλοι οι χρήστες (σελιδοποίηση Auth API).
  const users: { id: string; email: string }[] = []
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    // Μόνο ΟΛΟΚΛΗΡΩΜΕΝΟΙ λογαριασμοί (επαλήθευσαν email / συνδέθηκαν τουλάχιστον μία φορά).
    // Όσοι ζήτησαν κωδικό και δεν τον έβαλαν ποτέ συχνά έχουν λάθος email (π.χ. «gmail.con")
    // → bounce → χαλάει η φήμη του washio.gr και κινδυνεύουν να πάνε στα spam και τα OTP.
    for (const u of data.users) if (u.email && (u.last_sign_in_at || u.email_confirmed_at)) users.push({ id: u.id, email: u.email.toLowerCase() })
    if (data.users.length < 1000) break
  }
  const [{ data: booked }, { data: owners }, { data: profs }, { data: apps }, { data: onb }] = await Promise.all([
    admin.from('bookings').select('user_id').not('user_id', 'is', null).neq('status', 'cancelled'),
    admin.from('locations').select('owner_id').not('owner_id', 'is', null),
    admin.from('profiles').select('id, referral_credit'),
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
  return users
    .filter(u => !bookedSet.has(u.id) && !ownerSet.has(u.id) && !partnerEmails.has(u.email) && !ADMIN_EMAILS.includes(u.email))
    .map(u => ({ ...u, hasCoupon: (credit.get(u.id) || 0) >= 3 }))
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
    const audience: Audience = aud === 'new' ? 'new' : 'all'
    const { subject: SUBJ, campaign: CAMP } = cfg(audience)
    if (mode === 'stats') return NextResponse.json(await campaignStats(audience))

    // «new»: ΜΟΝΟ όσοι δεν έχουν λάβει ΚΑΝΕΝΑ από τα δύο emails (ούτε το «λήγει 12/10»,
    // ούτε αυτό) — ποτέ δεύτερο email στον ίδιο. Η λίστα αποστολών έρχεται από το Resend.
    let alreadySent = new Set<string>()
    if (audience === 'new') {
      const prev = await listCampaignEmails(PROMO_SUBJECTS)
      alreadySent = new Set(prev.flatMap(e => (e.to || []).map(x => x.toLowerCase())))
    }
    const list = (await recipients()).filter(r => !alreadySent.has(r.email))

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
        html: html(true, await personalLink(user.email!, audience), audience),
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
      const fresh = (await recipients()).filter(r => !alreadySent.has(r.email))
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
          html: html(true, linkByEmail.get(r.email) || ctaFor(audience), audience),
          headers: { 'List-Unsubscribe': '<mailto:withinsuccess@gmail.com?subject=Unsubscribe%20Washio>' },
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
