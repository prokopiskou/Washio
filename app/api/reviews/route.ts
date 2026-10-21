import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Δημόσιες κριτικές ενός πλυντηρίου ΜΑΖΙ με το όνομα του πελάτη.
// Το profiles των άλλων χρηστών δεν διαβάζεται από τον browser (RLS) → εδώ με service role.
// Ιδιωτικότητα: δείχνουμε ΜΟΝΟ μικρό όνομα + αρχικό επωνύμου («Γιώργος Π.»), ποτέ email/τηλέφωνο.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

function displayName(full: string | null | undefined): string {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
  const last = parts.length > 1 ? ` ${parts[parts.length - 1].charAt(0).toUpperCase()}.` : ''
  return (first + last).slice(0, 40)
}

export async function GET(req: NextRequest) {
  const loc = req.nextUrl.searchParams.get('location') || ''
  if (!/^[0-9a-f-]{36}$/i.test(loc)) return NextResponse.json({ reviews: [] }, { status: 400 })

  const { data: rows } = await admin.from('reviews')
    .select('id, rating, comment, created_at, user_id')
    .eq('location_id', loc).order('created_at', { ascending: false }).limit(200)
  const list = rows || []

  const ids = [...new Set(list.map(r => r.user_id).filter(Boolean))] as string[]
  const names = new Map<string, string>()
  if (ids.length) {
    const { data: profs } = await admin.from('profiles').select('id, full_name').in('id', ids)
    for (const p of profs || []) { const n = displayName(p.full_name as string); if (n) names.set(p.id as string, n) }
    // Fallback: όνομα από τον λογαριασμό (Google/Apple) αν το profile δεν έχει.
    for (const id of ids.filter(i => !names.has(i))) {
      try {
        const { data } = await admin.auth.admin.getUserById(id)
        const m = (data?.user?.user_metadata || {}) as Record<string, unknown>
        const n = displayName((m.full_name || m.name) as string)
        if (n) names.set(id, n)
      } catch { /* ignore */ }
    }
  }

  const reviews = list.map(r => ({
    id: r.id, rating: r.rating, comment: r.comment, created_at: r.created_at,
    name: (r.user_id && names.get(r.user_id as string)) || '',
  }))
  return NextResponse.json({ reviews }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } })
}
