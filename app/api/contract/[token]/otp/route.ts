import { NextRequest, NextResponse } from 'next/server'
import { contractsDb, contractByToken, sendOtp } from '@/lib/contracts'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const db = contractsDb()
  const c = await contractByToken(db, token)
  if (!c) return NextResponse.json({ error: 'Μη έγκυρο link' }, { status: 404 })
  const r = await sendOtp(db, c)
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 })
}
