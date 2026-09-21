import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { sendNativePush } from '@/lib/fcm'

// Server-side push sender (best-effort). Χρησιμοποιείται από webhook, create-cash,
// cancel, cron κ.λπ. για να ειδοποιεί έναν χρήστη (π.χ. τον πρατηριούχο).
// Σιωπηλά δεν κάνει τίποτα αν λείπουν VAPID keys ή subscriptions.

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

let vapidReady = false
function ensureVapid(): boolean {
  if (vapidReady) return true
  const email = process.env.VAPID_EMAIL
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!email || !pub || !priv) return false
  webpush.setVapidDetails(email, pub, priv)
  vapidReady = true
  return true
}

export async function sendPush(
  userId: string | null | undefined,
  payload: { title: string; body: string; url?: string }
): Promise<void> {
  if (!userId) return
  // Στέλνει ΚΑΙ web push ΚΑΙ native (iOS/Android FCM) — ό,τι υπάρχει.
  await Promise.all([
    sendWebPush(userId, payload),
    sendNativePush(userId, payload),
  ])
}

async function sendWebPush(
  userId: string,
  payload: { title: string; body: string; url?: string }
): Promise<void> {
  try {
    if (!ensureVapid()) return
    const { data: subs } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId)
    if (!subs?.length) return
    await Promise.all(
      subs.map((s) =>
        webpush
          .sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(payload)
          )
          .catch(async (err: unknown) => {
            // 404/410 = ο browser έκανε unsubscribe / έληξε → σβήσε τη γραμμή,
            // αλλιώς χτυπάμε για πάντα νεκρά endpoints σε κάθε αποστολή.
            const code = (err as { statusCode?: number })?.statusCode
            if (code === 404 || code === 410) {
              await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint).then(() => null, () => null)
            }
            return null
          })
      )
    )
  } catch {
    // best-effort — δεν μπλοκάρει ποτέ τη ροή κράτησης
  }
}

// Βοηθητικό: βρίσκει τον owner (πρατηριούχο) ενός location.
export async function getLocationOwnerId(locationId: string): Promise<string | null> {
  try {
    const { data } = await admin
      .from('locations')
      .select('owner_id')
      .eq('id', locationId)
      .single()
    return (data?.owner_id as string) || null
  } catch {
    return null
  }
}
