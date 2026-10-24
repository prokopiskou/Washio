import { NextResponse } from 'next/server'

// Σύντομο link για SMS (κάθε χαρακτήρας μετράει: 70 ανά SMS στα ελληνικά).
// washio.gr/k → οι κρατήσεις μου (αλλαγή ώρας / ακύρωση).
export function GET(req: Request) {
  return NextResponse.redirect(new URL('/profile/bookings', req.url), 302)
}
