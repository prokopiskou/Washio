import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { athensEpoch, athensToday } from '@/lib/time'
import { reviewToken } from '@/lib/review-link'

// Κάρτα αρχικής «Βαθμολόγησε το πλύσιμο»: το πιο πρόσφατο πλύσιμο (7 μέρες) χωρίς κριτική,
// σε πλυντήριο που ο χρήστης δεν έχει βαθμολογήσει ακόμα.
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

function ymdMinus(days: number): string {
  const [y, m, d] = athensToday().split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10)
}

export async function GET() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ pending: null })

  const { data: rows } = await db.from('bookings')
    .select('id, booking_ref, location_id, slot_date, slot_start_time, duration_minutes, checked_in_at, locations(name)')
    .eq('user_id', user.id).gte('slot_date', ymdMinus(7)).lte('slot_date', athensToday())
    .not('status', 'in', '(cancelled,no_show)')
    .order('slot_date', { ascending: false }).order('slot_start_time', { ascending: false }).limit(10)
  const now = Date.now()
  const past = ((rows || []) as unknown as { id: string; booking_ref: string; location_id: string; slot_date: string; slot_start_time: string; duration_minutes: number | null; checked_in_at: string | null; locations: { name?: string } | null }[])
    .filter(b => b.checked_in_at ? now >= new Date(b.checked_in_at).getTime() + 30 * 60_000
      : now >= athensEpoch(b.slot_date, b.slot_start_time) + ((Number(b.duration_minutes) || 30) + 60) * 60_000)
  if (!past.length) return NextResponse.json({ pending: null })

  const { data: revs } = await db.from('reviews').select('location_id, booking_id').eq('user_id', user.id)
  const locs = new Set((revs || []).map(r => r.location_id))
  const b = past.find(x => !locs.has(x.location_id))
  if (!b) return NextResponse.json({ pending: null })
  return NextResponse.json({ pending: { ref: b.booking_ref, t: reviewToken(b.booking_ref), place: b.locations?.name || '', date: b.slot_date } }, { headers: { 'Cache-Control': 'no-store' } })
}
