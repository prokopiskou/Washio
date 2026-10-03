import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'
import { sendNativePushDebug, fcmInitErrorMessage } from '@/lib/fcm'

// Admin διαγνωστικό ειδοποιήσεων πλυντηρίου.
// GET  → λίστα πλυντηρίων με owner, tokens (native/web), τελευταία σύνδεση.
// POST { locationId } → στέλνει ΔΟΚΙΜΑΣΤΙΚΗ ειδοποίηση στον owner και επιστρέφει
//                       την πλήρη απάντηση του FCM (γιατί δεν παραδίδεται).
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function requireAdmin() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  return user && isAdminEmail(user.email) ? user : null
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const { data: locs } = await admin.from('locations').select('id, name, owner_id, is_active').order('name')
  const ownerIds = [...new Set((locs || []).map(l => l.owner_id).filter(Boolean))] as string[]
  const [{ data: nat }, { data: web }] = await Promise.all([
    admin.from('native_push_tokens').select('user_id, platform, updated_at').in('user_id', ownerIds),
    admin.from('push_subscriptions').select('user_id').in('user_id', ownerIds),
  ])
  const emails = new Map<string, { email?: string; last?: string | null }>()
  await Promise.all(ownerIds.map(async id => {
    const { data } = await admin.auth.admin.getUserById(id)
    emails.set(id, { email: data?.user?.email, last: data?.user?.last_sign_in_at })
  }))
  return NextResponse.json({
    fcmError: fcmInitErrorMessage(),
    locations: (locs || []).map(l => ({
      id: l.id, name: l.name, active: l.is_active,
      ownerEmail: l.owner_id ? emails.get(l.owner_id)?.email || null : null,
      lastSignIn: l.owner_id ? emails.get(l.owner_id)?.last || null : null,
      native: (nat || []).filter(n => n.user_id === l.owner_id).map(n => `${n.platform} · ${n.updated_at}`),
      web: (web || []).filter(w => w.user_id === l.owner_id).length,
    })),
  })
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const { locationId } = await req.json().catch(() => ({}))
  const { data: loc } = await admin.from('locations').select('name, owner_id').eq('id', locationId).maybeSingle()
  if (!loc?.owner_id) return NextResponse.json({ error: 'Το πλυντήριο δεν έχει owner' }, { status: 400 })
  const res = await sendNativePushDebug(loc.owner_id, {
    title: '🔔 Δοκιμή ειδοποίησης — Washio',
    body: `Αν το βλέπεις, οι ειδοποιήσεις για το ${loc.name} δουλεύουν σωστά.`,
    url: '/dashboard',
  })
  return NextResponse.json({ ...res, fcmError: fcmInitErrorMessage() })
}
