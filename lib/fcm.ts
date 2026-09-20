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

function ensureFirebase(): boolean {
  if (fcmReady !== null) return fcmReady
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw) { fcmReady = false; return false }
  try {
    if (getApps().length === 0) {
      const creds = JSON.parse(raw)
      initializeApp({ credential: cert(creds) })
    }
    fcmReady = true
  } catch (e) {
    console.error('FCM init failed:', e)
    fcmReady = false
  }
  return fcmReady
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
        payload: { aps: { sound: 'default', badge: 1 } },
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
