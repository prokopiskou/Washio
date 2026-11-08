import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'
import { sendAnnouncement, type Announcement } from '@/lib/announcements'

// Admin → Ενημερώσεις πλυντηρίων.
//  GET  → λίστα με κατάσταση ανά πλυντήριο (στάλθηκε / άνοιξε / διάβασε) + «Πάρε τηλέφωνο» (24ω χωρίς διάβασα)
//  POST { title, body, important, locationIds? } → αποστολή (push + email)
export const maxDuration = 120
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function adminUser() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  return user && isAdminEmail(user.email) ? user : null
}

export async function GET() {
  if (!(await adminUser())) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const { data: anns, error } = await db.from('announcements').select('*').order('created_at', { ascending: false }).limit(20)
  if (error) return NextResponse.json({ error: 'Τρέξε το supabase/announcements.sql — ' + error.message }, { status: 500 })
  const ids = (anns || []).map(a => a.id)
  const { data: recs } = ids.length
    ? await db.from('announcement_receipts').select('id, announcement_id, location_id, owner_id, sent_at, opened_at, acked_at, acked_by, reminded_at, sms_at, locations(name, phone)').in('announcement_id', ids)
    : { data: [] }
  const ownerIds = [...new Set((recs || []).map((r: { owner_id: string | null }) => r.owner_id).filter(Boolean))] as string[]
  const { data: profs } = ownerIds.length ? await db.from('profiles').select('id, phone, full_name').in('id', ownerIds) : { data: [] }
  const pm = new Map((profs || []).map((p: { id: string; phone: string | null; full_name: string | null }) => [p.id, p]))
  const dayAgo = Date.now() - 24 * 3600_000
  const out = (anns || []).map(a => {
    const rows = (recs || []).filter((r: { announcement_id: string }) => r.announcement_id === a.id).map((r: Record<string, unknown>) => {
      const prof = pm.get(String(r.owner_id))
      const loc = r.locations as { name?: string; phone?: string } | null
      return { ...r, acked_at: (r.acked_at as string | null) ?? null, opened_at: (r.opened_at as string | null) ?? null, name: loc?.name || "—", phone: loc?.phone || prof?.phone || null, owner: prof?.full_name || null,
        callNeeded: !r.acked_at && new Date(String(r.sent_at)).getTime() < dayAgo }
    })
    return { ...a, rows, total: rows.length, acked: rows.filter(r => r.acked_at).length, opened: rows.filter(r => r.opened_at).length }
  })
  return NextResponse.json({ announcements: out })
}

export async function POST(req: NextRequest) {
  const user = await adminUser()
  if (!user) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { title?: string; body?: string; important?: boolean; locationIds?: string[] }
  const title = String(b.title || '').trim().slice(0, 120), body = String(b.body || '').trim().slice(0, 3000)
  if (!title || !body) return NextResponse.json({ error: 'Γράψε τίτλο και κείμενο' }, { status: 400 })
  const { data: a, error } = await db.from('announcements').insert({
    title, body, important: !!b.important, created_by: user.email,
    target_location_ids: Array.isArray(b.locationIds) && b.locationIds.length ? b.locationIds : null,
  }).select('*').single()
  if (error || !a) return NextResponse.json({ error: error?.message || 'Σφάλμα' }, { status: 500 })
  const r = await sendAnnouncement(db, a as Announcement)
  return NextResponse.json({ ok: true, ...r })
}
