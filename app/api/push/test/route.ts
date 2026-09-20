import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { sendPush } from '@/lib/push'

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

  // Στείλε το test push (best-effort).
  let sendError: string | null = null
  try {
    await sendPush(user.id, {
      title: '🔔 Test ειδοποίηση Washio',
      body: 'Αν το βλέπεις αυτό, οι ειδοποιήσεις δουλεύουν κανονικά.',
      url: '/dashboard',
    })
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
    vapidConfigured: !!(process.env.VAPID_EMAIL && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    sendError,
    sentAt: new Date().toISOString(),
  })
}
