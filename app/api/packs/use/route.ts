import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { redeemPackWash } from '@/lib/packs'

// POST { purchaseId, carPlate? } → 1 πλύσιμο από το πακέτο → κράτηση τώρα + κωδικός QR.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function POST(req: NextRequest) {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })
  const { purchaseId, carPlate } = await req.json().catch(() => ({}))
  const r = await redeemPackWash(admin, user.id, String(purchaseId || ''), carPlate ? String(carPlate) : undefined)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json(r)
}
