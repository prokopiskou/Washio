import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'
import { contractsDb } from '@/lib/contracts'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const { id } = await ctx.params
  const db = contractsDb()
  const { data: c } = await db.from('partner_contracts').select('pdf_path').eq('id', id).maybeSingle()
  if (!c?.pdf_path) return NextResponse.json({ error: 'Δεν έχει υπογραφεί ακόμα' }, { status: 404 })
  const { data } = await db.storage.from('contracts').createSignedUrl(c.pdf_path, 120)
  return data?.signedUrl ? NextResponse.redirect(data.signedUrl) : NextResponse.json({ error: 'Δεν βρέθηκε' }, { status: 404 })
}
