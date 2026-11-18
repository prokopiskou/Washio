import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'

// Admin: μέλη πλυντηρίων (ιδιοκτήτης αλυσίδας που βλέπει πολλά πλυντήρια) — supabase/location_members.sql.
//  GET  ?email=…            → σε ποια πλυντήρια είναι μέλος / κύριος λογαριασμός
//  POST { email, locationIds[], role? } → τον προσθέτει μέλος σε αυτά τα πλυντήρια (ο λογαριασμός πρέπει να υπάρχει)
//  DELETE { email, locationIds[] }      → τον αφαιρεί
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function isAdmin() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  return !!user && isAdminEmail(user.email)
}
async function userIdByEmail(email: string): Promise<string | null> {
  const want = email.trim().toLowerCase()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return null
    const u = data.users.find(x => (x.email || '').toLowerCase() === want)
    if (u) return u.id
    if (data.users.length < 1000) break
  }
  return null
}
const ids = (v: unknown) => (Array.isArray(v) ? v : []).map(x => String(x)).filter(x => /^[0-9a-f-]{36}$/i.test(x))

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const email = String(req.nextUrl.searchParams.get('email') || '')
  const uid = email ? await userIdByEmail(email) : null
  if (!uid) return NextResponse.json({ error: 'Δεν βρέθηκε λογαριασμός με αυτό το email' }, { status: 404 })
  const [{ data: own }, { data: mem, error }] = await Promise.all([
    db.from('locations').select('id, name').eq('owner_id', uid),
    db.from('location_members').select('location_id, role, locations(name)').eq('user_id', uid),
  ])
  if (error) return NextResponse.json({ error: 'Λείπει ο πίνακας location_members (τρέξε supabase/location_members.sql)' }, { status: 500 })
  return NextResponse.json({ owner: own || [], member: mem || [] })
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { email?: string; locationIds?: unknown; role?: string }
  const uid = b.email ? await userIdByEmail(b.email) : null
  if (!uid) return NextResponse.json({ error: 'Δεν βρέθηκε λογαριασμός με αυτό το email — πρέπει πρώτα να συνδεθεί μία φορά στο Washio' }, { status: 404 })
  const list = ids(b.locationIds)
  if (!list.length) return NextResponse.json({ error: 'Ποια πλυντήρια;' }, { status: 400 })
  const role = b.role === 'manager' ? 'manager' : 'group'
  const { error } = await db.from('location_members').upsert(list.map(location_id => ({ location_id, user_id: uid, role })), { onConflict: 'location_id,user_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, added: list.length })
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { email?: string; locationIds?: unknown }
  const uid = b.email ? await userIdByEmail(b.email) : null
  if (!uid) return NextResponse.json({ error: 'Δεν βρέθηκε λογαριασμός' }, { status: 404 })
  const list = ids(b.locationIds)
  const { error } = await db.from('location_members').delete().eq('user_id', uid).in('location_id', list.length ? list : ['00000000-0000-0000-0000-000000000000'])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
