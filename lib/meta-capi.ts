import crypto from 'crypto'

// Meta Conversions API (server-side) — στέλνει το Purchase απευθείας στο Meta,
// ώστε να μη χάνεται λόγω iOS ATT / ad-blockers. Το event_id κάνει dedup με το
// browser Pixel (ίδιο booking_ref), οπότε δεν διπλομετριέται.

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID
const TOKEN = process.env.META_CAPI_TOKEN

function sha256(v?: string | null): string | undefined {
  if (!v) return undefined
  return crypto.createHash('sha256').update(v.trim().toLowerCase()).digest('hex')
}

export async function sendPurchaseCapi(opts: {
  eventId: string
  value: number
  currency?: string
  email?: string | null
}): Promise<void> {
  if (!PIXEL_ID || !TOKEN) return // δεν έχει ρυθμιστεί ακόμα — no-op
  try {
    const body = {
      data: [{
        event_name: 'Purchase',
        event_time: Math.floor(Date.now() / 1000),
        event_id: opts.eventId,
        action_source: 'website',
        user_data: opts.email ? { em: [sha256(opts.email)] } : {},
        custom_data: { value: opts.value, currency: opts.currency || 'EUR' },
      }],
    }
    await fetch(`https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch { /* best-effort — δεν μπλοκάρει ποτέ την κράτηση */ }
}
