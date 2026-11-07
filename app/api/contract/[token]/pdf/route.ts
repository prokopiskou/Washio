import { NextRequest, NextResponse } from 'next/server'
import { contractsDb, contractByToken } from '@/lib/contracts'

// Κατέβασμα του υπογεγραμμένου PDF από τον συνεργάτη (με το προσωπικό token).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const db = contractsDb()
  const c = await contractByToken(db, token)
  if (!c || c.status !== 'signed' || !c.pdf_path) return NextResponse.json({ error: 'Δεν βρέθηκε' }, { status: 404 })
  const { data } = await db.storage.from('contracts').createSignedUrl(c.pdf_path, 120, { download: true })
  if (!data?.signedUrl) return NextResponse.json({ error: 'Δεν βρέθηκε' }, { status: 404 })
  return NextResponse.redirect(data.signedUrl)
}
