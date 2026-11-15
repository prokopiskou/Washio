import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { suggestRebook, REBOOK_AFTER_DAYS } from '@/lib/rebook-suggest'

// GET → { suggestion | null, show } — show = πέρασαν ≥ REBOOK_AFTER_DAYS μέρες από το τελευταίο πλύσιμο.
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function GET() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ suggestion: null, show: false })
  const s = await suggestRebook(db, user.id).catch(() => null)
  return NextResponse.json({ suggestion: s, show: !!s && s.daysSince >= REBOOK_AFTER_DAYS }, { headers: { 'Cache-Control': 'no-store' } })
}
