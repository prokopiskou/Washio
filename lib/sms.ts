// Αποστολή SMS — ανεξάρτητο από πάροχο. Ενεργοποιείται ΜΟΝΟ όταν υπάρχουν τα env:
//   SMS_PROVIDER = 'bulkgate' | 'yuboto'
//   SMS_API_KEY  = BulkGate: application_token · Yuboto: κλειδί API (ήδη base64)
//   SMS_APP_ID   = BulkGate: application_id (μόνο για BulkGate)
//   SMS_SENDER   = όνομα αποστολέα (προεπιλογή «Washio»)
//   SMS_SENDER_PROFILE = BulkGate: id προφίλ αποστολέα (Washio = 19780) — προτιμάται από το SMS_SENDER
//   SMS_BASE_URL = προαιρετικό override URL
// Χωρίς αυτά → { ok:false, skipped:'not_configured' } και ΔΕΝ στέλνεται τίποτα.
//
// ⚠️ Το σχήμα του Yuboto Omni «Send» πρέπει να επιβεβαιωθεί με το Swagger του λογαριασμού
//    πριν το πρώτο κανονικό run (δοκιμή: /api/cron/sms?test=1 → SMS_TEST_PHONE).

import { greekMobile } from '@/lib/phone'

export type SmsResult = { ok: boolean; skipped?: string; id?: string; error?: string }

// GSM-7: λατινικά + λίγα σύμβολα. Ελληνικά πεζά/τόνοι → Unicode (70 χαρ. ανά SMS).
const GSM7 = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/
export const isGsm7 = (t: string) => GSM7.test(t)
export const smsLimit = (t: string) => (isGsm7(t) ? 160 : 70)

export function smsConfigured(): boolean {
  const p = String(process.env.SMS_PROVIDER || '').toLowerCase()
  if (!p || !process.env.SMS_API_KEY) return false
  if (p === 'bulkgate' && !process.env.SMS_APP_ID) return false
  return true
}

// Ελληνικά ΚΕΦΑΛΑΙΑ χωρίς τόνους χωράνε στο GSM-7 (160 χαρ. ανά SMS αντί για 70):
// όσα μοιάζουν με λατινικά γίνονται λατινικά (Α→A, Β→B …) και τα υπόλοιπα (Γ Δ Θ Λ Ξ Π Σ Φ Ψ Ω)
// υπάρχουν ήδη στο GSM-7. Τα λατινικά (ονόματα, link) μένουν όπως είναι.
const GR_TO_LAT: Record<string, string> = {
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N',
  'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X',
}
export function greekToGsm(t: string): string {
  return t.split('').map(ch => {
    if (!/[\u0370-\u03FF\u1F00-\u1FFF]/.test(ch)) return ch
    const up = ch.normalize('NFD').replace(/[\u0300-\u036f\u0342-\u0345]/g, '').toUpperCase()
    return GR_TO_LAT[up] || up
  }).join('')
}

/** Ελληνικό κινητό → «3069xxxxxxxx» (μορφή παρόχου), αλλιώς null. */
export function toMsisdn(raw: string | null | undefined): string | null {
  const m = greekMobile(raw)
  return m ? `30${m}` : null
}

export async function sendSms(rawPhone: string, text: string): Promise<SmsResult> {
  if (!smsConfigured()) return { ok: false, skipped: 'not_configured' }
  const to = toMsisdn(rawPhone)
  if (!to) return { ok: false, skipped: 'not_greek_mobile' }
  const provider = String(process.env.SMS_PROVIDER).toLowerCase()
  if (provider === 'bulkgate') return sendBulkGate(to, text)
  if (provider === 'yuboto') return sendYuboto(to, text)
  return { ok: false, skipped: 'unknown_provider' }
}

// BulkGate Simple Transactional API (docs: bulkgate.com/en/docs/simple-api/simple-transactional/)
async function sendBulkGate(to: string, text: string): Promise<SmsResult> {
  const url = process.env.SMS_BASE_URL || 'https://portal.bulkgate.com/api/1.0/simple/transactional'
  const payload = JSON.stringify({
    application_id: Number(process.env.SMS_APP_ID) || process.env.SMS_APP_ID,
    application_token: process.env.SMS_API_KEY,
    number: to,
    text,
    unicode: !isGsm7(text),
    // Προφίλ αποστολέα στο BulkGate (Washio = 19780, Ελλάδα → «Washio») · αλλιώς απευθείας κείμενο.
    ...(process.env.SMS_SENDER_PROFILE
      ? { sender_id: 'gProfile', sender_id_value: process.env.SMS_SENDER_PROFILE }
      : { sender_id: 'gText', sender_id_value: process.env.SMS_SENDER || 'Washio' }),
    duplicates_check: 'on',
  })
  const attempt = async (u: string): Promise<SmsResult> => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 10_000)
    try {
      const res = await fetch(u, { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json' }, body: payload })
      const body = await res.json().catch(() => ({})) as { data?: { status?: string; sms_id?: string }; type?: string; error?: string }
      if (res.ok && body.data?.status === 'accepted') return { ok: true, id: body.data.sms_id }
      return { ok: false, error: `${res.status} ${body.type || ''} ${body.error || body.data?.status || ''}`.trim() }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'network' }
    } finally { clearTimeout(timer) }
  }
  const r = await attempt(url)
  // Δεν έφτασε (δίκτυο) → backup server, όπως λέει η τεκμηρίωση. Το duplicates_check αποτρέπει διπλό.
  if (!r.ok && /abort|network|fetch/i.test(r.error || '') && !process.env.SMS_BASE_URL) {
    return attempt(url.replace('portal.bulkgate.com', 'backup1.bulkgate.com'))
  }
  return r
}

async function sendYuboto(to: string, text: string): Promise<SmsResult> {
  const base = (process.env.SMS_BASE_URL || 'https://api.yuboto.com/omni/v1').replace(/\/$/, '')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(`${base}/Send`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${process.env.SMS_API_KEY}`,
      },
      body: JSON.stringify({
        phonenumbers: [to],
        sms: {
          sender: process.env.SMS_SENDER || 'Washio',
          text,
          validity: 120, // λεπτά — μετά το ραντεβού δεν έχει νόημα
          typesms: isGsm7(text) ? 'sms' : 'unicode',
          longsms: text.length > smsLimit(text), // >1 τμήμα (π.χ. 2 SMS με τα links)
        },
      }),
    })
    const body = await res.json().catch(() => ({})) as {
      ErrorCode?: number; ErrorMessage?: string; Message?: { id?: string; status?: string }[]
    }
    if (!res.ok || (body.ErrorCode && body.ErrorCode !== 0)) {
      return { ok: false, error: `${res.status} ${body.ErrorMessage || ''}`.trim() }
    }
    return { ok: true, id: body.Message?.[0]?.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network' }
  } finally {
    clearTimeout(timer)
  }
}
