import { NextResponse } from 'next/server'

// QR του αρωματικού Aqua × Washio → «Κάλεσε φίλους» (κοινοποίηση του προσωπικού link).
// Σύντομο URL = πιο αραιό QR (σκανάρεται εύκολα σε 6,5×10 εκ.) + μετράει στα analytics ως /aqua.
export function GET() {
  return NextResponse.redirect('https://www.washio.gr/profile/rewards?tab=referral&do=share&utm_source=aqua&utm_medium=print&utm_campaign=airfreshener', 302)
}
