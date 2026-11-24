import { NextRequest, NextResponse } from 'next/server'
import { icsText } from '@/lib/calendar'

// .ics για «Πρόσθεσε στο ημερολόγιο» (Apple Calendar / iPhone / Android). Δεν περιέχει προσωπικά δεδομένα.
export function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  const date = p.get('d') || '', time = p.get('h') || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}/.test(time)) return new NextResponse('Bad request', { status: 400 })
  const clean = (s: string | null, n: number) => String(s || '').replace(/[<>]/g, '').slice(0, n)
  const body = icsText({ title: clean(p.get('t'), 120) || 'Πλύσιμο αυτοκινήτου', date, time: time.slice(0, 5), durMin: Math.min(1440, Math.max(15, Number(p.get('m')) || 60)), location: clean(p.get('l'), 200), details: clean(p.get('x'), 300) }, `${date}-${time.replace(':', '')}-${Math.random().toString(36).slice(2, 8)}`)
  return new NextResponse(body, { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="washio.ics"', 'Cache-Control': 'no-store' } })
}
