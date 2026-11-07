import { NextRequest, NextResponse } from 'next/server'
import { contractsDb, contractByToken, publicContract } from '@/lib/contracts'

// Δημόσιο (με το προσωπικό token): στοιχεία & κείμενο του συμφωνητικού για τη σελίδα υπογραφής.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const db = contractsDb()
  const c = await contractByToken(db, token)
  if (!c || c.status === 'void') return NextResponse.json({ error: 'Το link δεν είναι έγκυρο ή έχει αντικατασταθεί.' }, { status: 404 })
  if (c.status === 'sent') await db.from('partner_contracts').update({ opened_at: new Date().toISOString() }).eq('id', c.id).is('opened_at', null)
  return NextResponse.json(publicContract(c), { headers: { 'Cache-Control': 'no-store' } })
}
