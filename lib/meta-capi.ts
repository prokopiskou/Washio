import crypto from 'crypto'

// Meta Conversions API (server-side) — στέλνει events απευθείας στο Meta, ώστε να
// μη χάνονται λόγω iOS ATT / ad-blockers. Το event_id κάνει dedup με το browser
// Pixel (ίδιο id), οπότε δεν διπλομετριέται.
//
// Κανόνες hashing (Meta): em/ph/external_id → sha256. fbp/fbc/IP/user_agent → ΩΜΑ,
// ΟΧΙ hashed. Όσα περισσότερα signals, τόσο καλύτερο το match quality.

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID
const TOKEN = process.env.META_CAPI_TOKEN

function sha256(v?: string | null): string | undefined {
  if (!v) return undefined
  return crypto.createHash('sha256').update(v.trim().toLowerCase()).digest('hex')
}

export type CapiSignals = {
  email?: string | null
  externalId?: string | null
  phone?: string | null
  fbp?: string | null                 // cookie _fbp
  fbc?: string | null                 // cookie _fbc (ή από fbclid)
  clientIp?: string | null
  clientUserAgent?: string | null
}

function buildUserData(s: CapiSignals): Record<string, unknown> {
  const ud: Record<string, unknown> = {}
  const em = sha256(s.email); if (em) ud.em = [em]
  const ext = sha256(s.externalId); if (ext) ud.external_id = [ext]
  const ph = s.phone ? sha256(String(s.phone).replace(/[^0-9]/g, '')) : undefined
  if (ph) ud.ph = [ph]
  if (s.fbp) ud.fbp = s.fbp
  if (s.fbc) ud.fbc = s.fbc
  if (s.clientIp) ud.client_ip_address = s.clientIp
  if (s.clientUserAgent) ud.client_user_agent = s.clientUserAgent
  return ud
}

// Γενικός sender για οποιοδήποτε Meta event.
export async function sendCapiEvent(
  eventName: string,
  opts: CapiSignals & {
    eventId: string
    eventSourceUrl?: string | null
    customData?: Record<string, unknown>
  }
): Promise<void> {
  if (!PIXEL_ID || !TOKEN) return // δεν έχει ρυθμιστεί ακόμα — no-op
  try {
    const body = {
      data: [{
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: opts.eventId,
        action_source: 'website',
        ...(opts.eventSourceUrl ? { event_source_url: opts.eventSourceUrl } : {}),
        user_data: buildUserData(opts),
        ...(opts.customData ? { custom_data: opts.customData } : {}),
      }],
    }
    await fetch(`https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch { /* best-effort — δεν μπλοκάρει ποτέ τη ροή */ }
}

// Backward-compatible Purchase helper (τώρα με πλήρη signals).
export async function sendPurchaseCapi(opts: {
  eventId: string
  value: number
  currency?: string
  email?: string | null
  externalId?: string | null
  fbp?: string | null
  fbc?: string | null
  clientIp?: string | null
  clientUserAgent?: string | null
}): Promise<void> {
  return sendCapiEvent('Purchase', {
    eventId: opts.eventId,
    email: opts.email,
    externalId: opts.externalId,
    fbp: opts.fbp,
    fbc: opts.fbc,
    clientIp: opts.clientIp,
    clientUserAgent: opts.clientUserAgent,
    customData: { value: opts.value, currency: opts.currency || 'EUR' },
  })
}
