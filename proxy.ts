// Παγίδα canary: αν κάποιος ζητήσει το ψεύτικο πλυντήριο «AquaPrime Car Spa» (σελίδα ή API με το id του),
// σημαίνει ότι τα δεδομένα μας αντιγράφηκαν/χρησιμοποιούνται εκτός Washio → email στον admin + καταγραφή.
// Matcher στενός: δεν αγγίζει την υπόλοιπη κίνηση.
import { NextResponse, type NextRequest, type NextFetchEvent } from 'next/server'
import { CANARY_ID, CANARY_LOCATION } from '@/lib/canary'
import { canaryHit } from '@/lib/canary-alert'

const CANARY_SVC = CANARY_LOCATION.services[0].id

export function proxy(req: NextRequest, event: NextFetchEvent) {
  const url = decodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)
  if (url.includes(CANARY_LOCATION.slug) || url.includes(CANARY_ID) || url.includes(CANARY_SVC)) {
    event.waitUntil(canaryHit(req, url))
    if (req.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/locations/aquaprime-car-spa-peristeri/:path*', '/locations/aquaprime-car-spa-peristeri', '/api/:path*'],
}
