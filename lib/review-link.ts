import { createHmac, timingSafeEqual } from 'crypto'

// Υπογεγραμμένο link κριτικής ανά κράτηση: /review?ref=WS-XXXX&t=<hmac>&rating=N
// Χωρίς login (λειτουργεί από push, email, SMS) — αλλά μόνο με σωστό token, όχι με σκέτο ref.
// Server-only (χρησιμοποιεί secret).

function secret(): string {
  return process.env.REVIEW_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

export function reviewToken(ref: string): string {
  return createHmac('sha256', secret()).update(`review:${ref.toUpperCase()}`).digest('hex').slice(0, 20)
}

export function verifyReviewToken(ref: string, token: string): boolean {
  if (!ref || !token || !secret()) return false
  const a = Buffer.from(reviewToken(ref))
  const b = Buffer.from(String(token))
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Σχετικό path (για push μέσα στο app) ή απόλυτο URL (email / SMS). */
export function reviewPath(ref: string, rating?: number): string {
  return `/review?ref=${encodeURIComponent(ref)}&t=${reviewToken(ref)}${rating ? `&rating=${rating}` : ''}`
}
export function reviewUrl(ref: string, rating?: number): string {
  return `https://www.washio.gr${reviewPath(ref, rating)}`
}
