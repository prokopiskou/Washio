import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const supabase = createClient(
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

export async function POST(req: NextRequest) {
  try {
    // Internal-only: επιτρέπεται μόνο με το internal secret (server-to-server).
    if (req.headers.get('x-internal-secret') !== process.env.INTERNAL_API_SECRET) {
      return NextResponse.json({ error: 'Δεν επιτρέπεται' }, { status: 403 })
    }
    if (!ensureVapid()) {
      return NextResponse.json({ error: 'Push not configured' }, { status: 503 })
    }

    const { userId, title, body, url } = await req.json()
    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId)
    if (!subscriptions?.length) return NextResponse.json({ error: 'No subscriptions' }, { status: 404 })
    await Promise.all(subscriptions.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body, url })
      ).catch(() => null)
    ))
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
