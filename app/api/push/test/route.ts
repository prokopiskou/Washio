import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { sendPush } from '@/lib/push'
import { sendNativePushDebug, fcmInitErrorMessage } from '@/lib/fcm'

// ============================================================
// ΔΙΑΓΝΩΣΤΙΚΟ: στέλνει test push στον ΣΥΝΔΕΔΕΜΕΝΟ χρήστη και
// επιστρέφει πόσα tokens/subscriptions βρήκε + αν είναι configured
// το FCM/VAPID. Άνοιξέ το μέσα από το app (ή browser) συνδεδεμένος.
//
//   GET /api/push/test
//
// Ερμηνεία:
//  - nativeTableError: relation ... does not exist  → δεν έτρεξε το SQL
//  - nativeTokens = 0                                → το app δεν κατέγραψε token
//                                                      (build χωρίς push, ή δεν δόθηκε άδεια)
//  - nativeTokens > 0 αλλά δεν ήρθε notification     → θέμα FCM/APNs
//  - fcmConfigured = false                           → λείπει FIREBASE_SERVICE_ACCOUNT
// ============================================================

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Δεν είσαι συνδεδεμένος. Άνοιξέ το μέσα από το app.' }, { status: 401 })
  }

  const nativeRes = await admin
    .from('native_push_tokens')
    .select('token, platform')
    .eq('user_id', user.id)

  const webRes = await admin
    .from('push_subscriptions')
    .select('endpoint')
    .eq('user_id', user.id)

  // Στείλε το test push με ΠΛΗΡΗ διαγνωστικά από το FCM.
  const payload = {
    title: '🔔 Test ειδοποίηση Washio',
    body: 'Αν το βλέπεις αυτό, οι ειδοποιήσεις δουλεύουν κανονικά.',
    url: '/dashboard',
  }
  let sendError: string | null = null
  let fcm: Awaited<ReturnType<typeof sendNativePushDebug>> | null = null
  try {
    fcm = await sendNativePushDebug(user.id, payload)
    // Web push μόνο αν υπάρχει subscription (native το στέλνει το debug από πάνω).
    if ((webRes.data?.length ?? 0) > 0) await sendPush(user.id, payload)
  } catch (e) {
    sendError = e instanceof Error ? e.message : String(e)
  }

  return NextResponse.json({
    userId: user.id,
    nativeTokens: nativeRes.data?.length ?? 0,
    nativePlatforms: (nativeRes.data ?? []).map(r => r.platform),
    nativeTableError: nativeRes.error?.message ?? null,
    webSubscriptions: webRes.data?.length ?? 0,
    webTableError: webRes.error?.message ?? null,
    fcmConfigured: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    fcmInitError: fcmInitErrorMessage(),
    vapidConfigured: !!(process.env.VAPID_EMAIL && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    fcm,
    sendError,
    sentAt: new Date().toISOString(),
  })
}
