import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyUnsubToken } from '@/lib/unsubscribe'

// Διαγραφή από προωθητικά emails.
//  GET  → σελίδα επιβεβαίωσης με κουμπί (όχι αυτόματη διαγραφή: τα link scanners των
//         email «πατάνε» τα GET links και θα διέγραφαν κόσμο χωρίς να το θέλει).
//  POST → διαγραφή. Το κάνει το κουμπί της σελίδας ΚΑΙ το one-click «Unsubscribe» του
//         Gmail/Apple Mail (List-Unsubscribe-Post). ΔΕΝ στέλνει τίποτα σε εμάς.
// Αποθήκευση: auth app_metadata.email_opt_out (+ email_opt_out_at).
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const page = (title: string, body: string, form = '') => new NextResponse(
  `<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Washio</title></head>
  <body style="margin:0;background:#F7FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <div style="max-width:420px;margin:60px auto;padding:28px;background:#fff;border:1px solid #E8EEF2;border-radius:18px;text-align:center;">
    <img src="https://washio.gr/logo.png" alt="Washio" width="110" style="display:block;margin:0 auto 14px;" />
    <h1 style="margin:0 0 10px;color:#10182A;font-size:20px;">${title}</h1>
    <p style="margin:0 0 18px;color:#4B5563;font-size:14px;line-height:1.6;">${body}</p>${form}
    <a href="https://www.washio.gr" style="color:#078EAD;font-size:13px;">washio.gr</a>
  </div></body></html>`,
  { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
)

export async function GET(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') || ''
  const t = req.nextUrl.searchParams.get('t') || ''
  if (!verifyUnsubToken(u, t)) return page('Μη έγκυρος σύνδεσμος', 'Ο σύνδεσμος διαγραφής δεν είναι έγκυρος.')
  const form = `<form method="post" action="/api/unsubscribe?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}" style="margin:0 0 18px;">
    <button type="submit" style="width:100%;background:#10182A;color:#fff;border:0;border-radius:12px;padding:14px;font-size:15px;font-weight:700;cursor:pointer;">Διαγραφή από τα email προσφορών</button></form>`
  return page('Διαγραφή από τα email', 'Δεν θα σου ξαναστείλουμε προσφορές και ενημερώσεις. Τα email για τις κρατήσεις σου (επιβεβαίωση, υπενθύμιση) θα συνεχίσουν να έρχονται.', form)
}

export async function POST(req: NextRequest) {
  const u = req.nextUrl.searchParams.get('u') || ''
  const t = req.nextUrl.searchParams.get('t') || ''
  if (!verifyUnsubToken(u, t)) return NextResponse.json({ ok: false }, { status: 400 })
  try {
    await admin.auth.admin.updateUserById(u, { app_metadata: { email_opt_out: true, email_opt_out_at: new Date().toISOString() } })
  } catch { /* best-effort */ }
  // One-click από mail client → αρκεί 200. Από τη φόρμα (browser) → σελίδα επιβεβαίωσης.
  const accept = req.headers.get('accept') || ''
  if (accept.includes('text/html')) return page('Έγινε ✓', 'Διαγράφηκες από τα email προσφορών του Washio.')
  return NextResponse.json({ ok: true })
}
