// Αποστολή SMS — ανεξάρτητο από πάροχο. Ενεργοποιείται ΜΟΝΟ όταν υπάρχουν τα env:
//   SMS_PROVIDER = 'yuboto'           (προς το παρόν μόνο αυτός)
//   SMS_API_KEY  = κλειδί API του παρόχου (Yuboto/Octapush: ήδη base64)
//   SMS_SENDER   = εγκεκριμένο όνομα αποστολέα (προεπιλογή «Washio»)
//   SMS_BASE_URL = προαιρετικό override (προεπιλογή https://api.yuboto.com/omni/v1)
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
  return !!process.env.SMS_PROVIDER && !!process.env.SMS_API_KEY
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
  if (provider === 'yuboto') return sendYuboto(to, text)
  return { ok: false, skipped: 'unknown_provider' }
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
          longsms: false,
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
