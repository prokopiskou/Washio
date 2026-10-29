import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { CHECKIN_BASE, parseCheckin, checkinCode } from '@/lib/checkin'

// PNG του QR check-in (για το email επιβεβαίωσης και τη σελίδα κράτησης).
// Μόνο για έγκυρους υπογεγραμμένους κωδικούς — όχι γενικός QR generator.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code: raw } = await ctx.params
  const code = String(raw || '').replace(/\.png$/i, '')
  const p = parseCheckin(code)
  if (!p || !p.signed) return new NextResponse('Not found', { status: 404 })
  const png = await QRCode.toBuffer(`${CHECKIN_BASE}/c/${checkinCode(p.ref)}`, {
    type: 'png', width: 480, margin: 2, errorCorrectionLevel: 'M',
    color: { dark: '#10182A', light: '#FFFFFF' },
  })
  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
