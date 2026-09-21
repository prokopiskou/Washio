import { createClient } from '@supabase/supabase-js'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getMessaging, type BatchResponse } from 'firebase-admin/messaging'

// ============================================================
// Native push (iOS/Android) μέσω Firebase Cloud Messaging.
// Συνυπάρχει με το web push — δεν το αντικαθιστά.
//
// Ενεργοποιείται ΜΟΝΟ όταν υπάρχει το env FIREBASE_SERVICE_ACCOUNT
// (το JSON του service account, ως single-line string). Αν λείπει,
// όλα κάνουν σιωπηλά no-op — ασφαλές να υπάρχει στο repo από πριν.
// ============================================================

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

let fcmReady: boolean | null = null
let fcmInitError: string | null = null

function ensureFirebase(): boolean {
  if (fcmReady !== null) return fcmReady
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) { fcmReady = false; fcmInitError = 'FIREBASE_SERVICE_ACCOUNT λείπει'; return false }
  try {
    if (getApps().length === 0) {
      // Δέχεται είτε raw JSON είτε base64 (πιο ασφαλές paste — χωρίς θέματα \n).
      let jsonStr = raw.trim()
      if (!jsonStr.startsWith('{')) {
        jsonStr = Buffer.from(jsonStr, 'base64').toString('utf8')
      }
      const creds = JSON.parse(jsonStr)
      // Το private_key μπορεί να έχει literal "\n" αντί για πραγματικές νέες γραμμές.
      if (typeof creds.private_key === 'string' && creds.private_key.includes('\\n')) {
        creds.private_key = creds.private_key.replace(/\\n/g, '\n')
      }
      initializeApp({ credential: cert(creds) })
    }
    fcmReady = true
    fcmInitError = null
  } catch (e) {
    fcmInitError = e instanceof Error ? e.message : String(e)
    console.error('FCM init failed:', e)
    fcmReady = false
  }
  return fcmReady
}

/** Το τελευταίο σφάλμα αρχικοποίησης firebase-admin (ή null αν ΟΚ). */
export function fcmInitErrorMessage(): string | null {
  ensureFirebase()
  return fcmInitError
}

export async function sendNativePush(
  userId: string | null | undefined,
  payload: { title: string; body: string; url?: string }
): Promise<void> {
  try {
    if (!userId || !ensureFirebase()) return

    const { data: rows } = await sb
      .from('native_push_tokens')
      .select('token')
      .eq('user_id', userId)
    const tokens = (rows || []).map(r => r.token).filter(Boolean)
    if (tokens.length === 0) return

    const res: BatchResponse = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: payload.url ? { url: payload.url } : undefined,
      apns: {
        // badge: 0 → καμία ειδοποίηση δεν αφήνει κόκκινο σημάδι στο icon,
        // και κάθε νέο push ΚΑΘΑΡΙΖΕΙ τυχόν υπάρχον badge (δεν έχουμε in-app inbox).
        payload: { aps: { sound: 'default', badge: 0 } },
      },
      android: {
        priority: 'high',
        notification: { sound: 'default' },
      },
    })

    // Καθάρισμα άκυρων tokens (π.χ. απεγκατάσταση app).
    const stale: string[] = []
    res.responses.forEach((r, i) => {
      if (!r.success) {
        const code = r.error?.code || ''
        if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
          stale.push(tokens[i])
        }
      }
    })
    if (stale.length) {
      await sb.from('native_push_tokens').delete().in('token', stale)
    }
  } catch {
    // best-effort — δεν μπλοκάρει ποτέ τη ροή
  }
}

// ΔΙΑΓΝΩΣΤΙΚΟ: ίδιο με sendNativePush αλλά επιστρέφει την πλήρη απάντηση του FCM
// (success/failure + κωδικοί σφάλματος) ώστε να βλέπουμε ΓΙΑΤΙ δεν παραδίδεται.
export type NativePushDebug = {
  fcmReady: boolean
  tokenCount: number
  successCount: number
  failureCount: number
  errors: { code?: string; message?: string }[]
  exception?: string
}

export async function sendNativePushDebug(
  userId: string | null | undefined,
  payload: { title: string; body: string; url?: string }
): Promise<NativePushDebug> {
  const out: NativePushDebug = {
    fcmReady: false, tokenCount: 0, successCount: 0, failureCount: 0, errors: [],
  }
  try {
    out.fcmReady = ensureFirebase()
    if (!userId || !out.fcmReady) return out

    const { data: rows } = await sb
      .from('native_push_tokens')
      .select('token')
      .eq('user_id', userId)
    const tokens = (rows || []).map(r => r.token).filter(Boolean)
    out.tokenCount = tokens.length
    if (tokens.length === 0) return out

    const res: BatchResponse = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: payload.url ? { url: payload.url } : undefined,
      apns: { payload: { aps: { sound: 'default', badge: 0 } } },
      android: { priority: 'high', notification: { sound: 'default' } },
    })
    out.successCount = res.successCount
    out.failureCount = res.failureCount
    res.responses.forEach(r => {
      if (!r.success) out.errors.push({ code: r.error?.code, message: r.error?.message })
    })
  } catch (e) {
    out.exception = e instanceof Error ? e.message : String(e)
  }
  return out
}
