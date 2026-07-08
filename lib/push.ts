import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

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
  try {
    if (!userId || !ensureVapid()) return
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
          .catch(() => null)
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
