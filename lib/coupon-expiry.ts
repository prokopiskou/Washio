import type { SupabaseClient } from '@supabase/supabase-js'
import type { Resend } from 'resend'

// Πραγματική λήξη του −3€ καλωσορίσματος: ισχύει έως το τέλος (23:59 Ελλάδας) της 7ης μέρας
// μετά την εγγραφή. Την ημέρα της λήξης, 13:00–21:59, φεύγει ΕΝΑ email «λήγει σήμερα».
// Μετά τη λήξη αφαιρείται από το wallet (apply_credit −3, kind 'expired').
// Αν κλείσει ραντεβού πριν λήξει (για ΟΠΟΙΑ μέρα), το −3€ έχει ήδη εφαρμοστεί → κρατιέται.
// Σήμανση στο auth app_metadata: coupon_expires_at · coupon_reminder_at · coupon_expired_at.

export const COUPON_DAYS = 7
export const COUPON_EUR = 3
// Όσοι πήραν το email «Η έκπτωσή σου λήγει σύντομα» (5/10, 13:05) — όλοι οι τότε χρήστες χωρίς
// κράτηση — λήγουν όπως τους γράψαμε: Δευτέρα 12/10, 23:59.
const CAMPAIGN_1210_SENT_AT = '2026-10-05T10:06:00Z'
const CAMPAIGN_1210_EXPIRY_DATE = '2026-10-12'
// Υπόλοιποι παλιοί κάτοχοι κουπονιού χωρίς ημερομηνία: τουλάχιστον έως 14/10 (να προλάβουν το email).
const BACKFILL_MIN_DATE = '2026-10-14'
const REMIND_FROM_H = 13
const REMIND_TO_H = 21

const SUBJECT = 'Το −3€ σου λήγει σήμερα'

/** YYYY-MM-DD στην ώρα Ελλάδας. */
export function athensDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
function athensHour(d = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', hourCycle: 'h23' }).format(d))
}
/** 23:59:59 ώρα Ελλάδας της ημερομηνίας → ISO (UTC). Χειρίζεται θερινή/χειμερινή ώρα. */
export function athensEndOfDay(dateStr: string): string {
  const naive = new Date(`${dateStr}T23:59:59Z`)
  const asAthens = new Date(naive.toLocaleString('en-US', { timeZone: 'Europe/Athens' }))
  const asUtc = new Date(naive.toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(naive.getTime() + (asUtc.getTime() - asAthens.getTime())).toISOString()
}
function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
/** Λήξη για νέα εγγραφή: τέλος της 7ης μέρας. */
export function expiryForSignup(createdAt: string | Date): string {
  return athensEndOfDay(addDays(athensDate(new Date(createdAt)), COUPON_DAYS))
}
/** «Κυριακή 18/10» */
export function greekDate(iso: string): string {
  const d = new Date(iso)
  const wd = new Intl.DateTimeFormat('el-GR', { timeZone: 'Europe/Athens', weekday: 'long' }).format(d)
  const dm = new Intl.DateTimeFormat('el-GR', { timeZone: 'Europe/Athens', day: 'numeric', month: 'numeric' }).format(d)
  return `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${dm}`
}

export async function setCouponExpiry(admin: SupabaseClient, userId: string, iso: string) {
  await admin.auth.admin.updateUserById(userId, { app_metadata: { coupon_expires_at: iso } })
}

type U = { id: string; email?: string; created_at: string; last_sign_in_at?: string | null; email_confirmed_at?: string | null; app_metadata?: Record<string, unknown> }

async function allUsers(admin: SupabaseClient): Promise<U[]> {
  const out: U[] = []
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    out.push(...(data.users as unknown as U[]))
    if (data.users.length < 1000) break
  }
  return out
}

function reminderHtml(link: string, expiresIso: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#F7FAFC;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Κλείσε σήμερα για όποια μέρα θες — η έκπτωση κλειδώνει.</div>
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 16px;">
    <div style="background:#10182A;border-radius:18px 18px 0 0;padding:28px 28px 22px;text-align:center;">
      <img src="https://washio.gr/logo.png" alt="Washio" width="120" style="display:block;margin:0 auto 6px;" />
      <p style="margin:0;color:#F5B83D;font-size:12px;font-weight:700;letter-spacing:1.6px;">ΤΕΛΕΥΤΑΙΑ ΜΕΡΑ</p>
    </div>
    <div style="background:#FFFFFF;border:1px solid #E8EEF2;border-top:none;border-radius:0 0 18px 18px;padding:28px;">
      <h1 style="margin:0 0 12px;color:#10182A;font-size:23px;line-height:1.3;font-weight:800;">Το <span style="color:#078EAD;">−3€</span> σου λήγει σήμερα στις 23:59.</h1>
      <p style="margin:0 0 18px;color:#4B5563;font-size:15px;line-height:1.6;">Δεν χρειάζεται να πλύνεις σήμερα. <strong style="color:#10182A;">Κλείσε σήμερα για όποια μέρα θες</strong> — ακόμα και για την επόμενη εβδομάδα — και η έκπτωση κλειδώνει.</p>
      <div style="background:#FFF8E8;border:1px solid #F6E2B3;border-radius:14px;padding:14px 16px;margin:0 0 20px;">
        <p style="margin:0;color:#8A6209;font-size:15px;font-weight:800;">⏳ Ισχύει έως ${greekDate(expiresIso)}, 23:59</p>
        <p style="margin:4px 0 0;color:#6F7785;font-size:12px;">Κάρτα ή μετρητά · Σε πλύσιμο από 12€ · Δωρεάν ακύρωση έως 2 ώρες πριν.</p>
      </div>
      <a href="${link}" style="display:block;background:#19A8C7;color:#FFFFFF;text-align:center;padding:16px;border-radius:14px;text-decoration:none;font-size:16px;font-weight:700;">Κλείσε ραντεβού τώρα →</a>
    </div>
    <p style="margin:16px 0 0;color:#9AA3AF;font-size:11px;line-height:1.5;text-align:center;">Λαμβάνεις αυτό το email επειδή έχεις λογαριασμό στο Washio. Δεν θέλεις τέτοια μηνύματα; <a href="mailto:withinsuccess@gmail.com?subject=Unsubscribe%20Washio" style="color:#9AA3AF;">Διαγραφή</a>.</p>
  </div></body></html>`
}

async function personalLink(admin: SupabaseClient, email: string): Promise<string> {
  const utm = 'utm_source=email&utm_medium=auto&utm_campaign=coupon_expiry_today'
  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const th = data?.properties?.hashed_token
    if (error || !th) return `https://www.washio.gr/map?${utm}`
    return `https://www.washio.gr/auth/link?token_hash=${encodeURIComponent(th)}&next=${encodeURIComponent('/map?' + utm)}`
  } catch { return `https://www.washio.gr/map?${utm}` }
}

/**
 * Τρέχει σε κάθε cron (κάθε 15'): backfill ημερομηνιών, email «λήγει σήμερα», λήξη.
 * Αγγίζει ΜΟΝΟ όσους έχουν ≥3€ στο wallet, πήραν welcome και ΔΕΝ έχουν ενεργή κράτηση.
 */
export async function processCouponExpiry(admin: SupabaseClient, resend: Resend, opts: { dryRun?: boolean } = {}) {
  const now = Date.now()
  const stats = { backfilled: 0, reminded: 0, expired: 0, reminderErrors: 0, holders: 0, toRemindNow: 0, toExpireNow: 0 }

  // Κάτοχοι κουπονιού: welcome στο ledger + υπόλοιπο ≥3€ + καμία ενεργή κράτηση.
  const [{ data: welcomes }, { data: profs }, { data: active }] = await Promise.all([
    admin.from('credit_ledger').select('user_id').eq('kind', 'welcome'),
    admin.from('profiles').select('id, referral_credit').gte('referral_credit', COUPON_EUR),
    admin.from('bookings').select('user_id').neq('status', 'cancelled').not('user_id', 'is', null),
  ])
  const hadWelcome = new Set((welcomes || []).map(w => w.user_id as string))
  const booked = new Set((active || []).map(b => b.user_id as string))
  const holderIds = new Set((profs || []).map(p => p.id as string).filter(id => hadWelcome.has(id) && !booked.has(id)))
  if (!holderIds.size) return stats

  const users = (await allUsers(admin)).filter(u => holderIds.has(u.id))
  stats.holders = users.length
  const hour = athensHour()

  for (const u of users) {
    const meta = u.app_metadata || {}
    let exp = meta.coupon_expires_at as string | undefined

    // 1) Backfill: παλιοί χρήστες χωρίς ημερομηνία.
    if (!exp) {
      if (u.created_at < CAMPAIGN_1210_SENT_AT) exp = athensEndOfDay(CAMPAIGN_1210_EXPIRY_DATE)
      else {
        const own = expiryForSignup(u.created_at)
        const min = athensEndOfDay(BACKFILL_MIN_DATE)
        exp = own > min ? own : min
      }
      if (!opts.dryRun) await setCouponExpiry(admin, u.id, exp)
      stats.backfilled++
    }

    const expMs = new Date(exp).getTime()

    // 2) Έληξε → αφαίρεση −3€ (μία φορά).
    if (expMs < now) {
      if (meta.coupon_expired_at) continue
      stats.toExpireNow++
      if (!opts.dryRun) {
        await admin.auth.admin.updateUserById(u.id, { app_metadata: { coupon_expired_at: new Date().toISOString() } })
        await admin.rpc('apply_credit', { p_user: u.id, p_delta: -COUPON_EUR, p_kind: 'expired', p_note: 'Λήξη κουπονιού καλωσορίσματος' })
        stats.expired++
      }
      continue
    }

    // 3) Ημέρα λήξης, 13:00–21:59 → ΕΝΑ email «λήγει σήμερα».
    const isExpiryDay = athensDate(new Date()) === athensDate(new Date(expMs))
    // Email μόνο σε επαληθευμένους (όχι bounce σε λάθος διευθύνσεις → φήμη του washio.gr).
    const verified = !!(u.last_sign_in_at || u.email_confirmed_at)
    if (isExpiryDay && hour >= REMIND_FROM_H && hour <= REMIND_TO_H && !meta.coupon_reminder_at && u.email && verified
        && !String(u.email).toLowerCase().includes('+test')) {
      stats.toRemindNow++
      if (opts.dryRun || stats.reminded >= 120) continue // όριο ανά run (χρόνος εκτέλεσης)
      await admin.auth.admin.updateUserById(u.id, { app_metadata: { coupon_reminder_at: new Date().toISOString() } })
      const { error } = await resend.emails.send({
        from: 'Washio <noreply@washio.gr>',
        to: u.email,
        subject: SUBJECT,
        html: reminderHtml(await personalLink(admin, u.email), exp),
        headers: { 'List-Unsubscribe': '<mailto:withinsuccess@gmail.com?subject=Unsubscribe%20Washio>' },
        tags: [{ name: 'campaign', value: 'coupon_expiry_today' }],
      })
      if (error) {
        stats.reminderErrors++
        await admin.auth.admin.updateUserById(u.id, { app_metadata: { coupon_reminder_at: null } })
      } else stats.reminded++
    }
  }
  return stats
}

export const COUPON_REMINDER_SUBJECT = SUBJECT
export { reminderHtml as couponReminderHtml }
