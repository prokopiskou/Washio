import { NextRequest, NextResponse } from 'next/server'
import { contractsDb, contractByToken, signContract } from '@/lib/contracts'

export const maxDuration = 60

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const b = await req.json().catch(() => ({})) as { otp?: string; signerName?: string; signature?: string; accept?: boolean }
  if (!b.accept) return NextResponse.json({ error: 'Πρέπει να αποδεχτείτε τους όρους' }, { status: 400 })
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(b.signature || ''))
  if (!m) return NextResponse.json({ error: 'Βάλτε την υπογραφή σας' }, { status: 400 })
  const png = Buffer.from(m[1], 'base64')
  if (png.length > 2_000_000) return NextResponse.json({ error: 'Μη έγκυρη υπογραφή' }, { status: 400 })
  const db = contractsDb()
  const c = await contractByToken(db, token)
  if (!c) return NextResponse.json({ error: 'Μη έγκυρο link' }, { status: 404 })
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || undefined
  const r = await signContract(db, c, { otp: String(b.otp || ''), signerName: String(b.signerName || ''), signaturePng: new Uint8Array(png), ip, userAgent: req.headers.get('user-agent') || undefined })
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 400 })
}
