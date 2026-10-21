import { createHmac, timingSafeEqual } from 'crypto'

// Διαγραφή από προωθητικά emails με ΕΝΑ κλικ — χωρίς να έρχεται email σε εμάς.
// Πριν: List-Unsubscribe = mailto:withinsuccess@gmail.com → κάθε «Unsubscribe» του Gmail
// έστελνε email στο inbox μας. Τώρα: https link + one-click POST (RFC 8058) → γράφει
// app_metadata.email_opt_out = true και οι καμπάνιες/αυτόματα emails τον εξαιρούν.
// Server-only (χρησιμοποιεί secret).

const BASE = 'https://www.washio.gr/api/unsubscribe'

function secret(): string {
  return process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

export function unsubToken(userId: string): string {
  return createHmac('sha256', secret()).update(`unsub:${userId}`).digest('hex').slice(0, 32)
}

export function verifyUnsubToken(userId: string, token: string): boolean {
  if (!userId || !token || !secret()) return false
  const a = Buffer.from(unsubToken(userId))
  const b = Buffer.from(String(token))
  return a.length === b.length && timingSafeEqual(a, b)
}

export function unsubUrl(userId: string): string {
  return `${BASE}?u=${encodeURIComponent(userId)}&t=${unsubToken(userId)}`
}

/** Headers για Gmail/Apple Mail: κουμπί «Unsubscribe» που κάνει POST εδώ (όχι email σε εμάς). */
export function unsubHeaders(userId: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${unsubUrl(userId)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
}

/** Footer link (HTML) για το email. */
export function unsubFooterLink(userId: string): string {
  return `<a href="${unsubUrl(userId)}" style="color:#9AA3AF;">Διαγραφή</a>`
}

export function isOptedOut(appMeta: Record<string, unknown> | null | undefined): boolean {
  return !!(appMeta && appMeta.email_opt_out)
}
