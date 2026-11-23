import { NextRequest, NextResponse } from 'next/server'

// washio.gr/get-app → σωστό store για τη συσκευή (email/push «Κατέβασε την εφαρμογή»).
// ?c=<campaign> περνάει στο tracking των stores.
export function GET(req: NextRequest) {
  const ua = req.headers.get('user-agent') || ''
  const c = (req.nextUrl.searchParams.get('c') || 'get_app').replace(/[^a-z0-9_-]/gi, '').slice(0, 40)
  const ios = `https://apps.apple.com/app/apple-store/id6785925766?pt=129101712&ct=${c}&mt=8`
  const android = 'https://play.google.com/store/apps/details?id=gr.washio.app&referrer=' + encodeURIComponent(`utm_source=washio&utm_medium=campaign&utm_campaign=${c}`)
  const to = /iphone|ipad|ipod/i.test(ua) ? ios : /android/i.test(ua) ? android : new URL('/landing#app', req.url).toString()
  return NextResponse.redirect(to, 302)
}
