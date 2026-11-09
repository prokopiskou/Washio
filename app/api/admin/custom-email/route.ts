import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'

// Admin → έκτακτο email σε πελάτες συγκεκριμένων κρατήσεων (π.χ. ενημέρωση για ένα πλυντήριο).
//  POST { refs: string[], subject, paragraphs: string[], ps?: { [ref]: string }, mode: 'test' | 'send' }
//   test → μόνο στον admin που είναι συνδεδεμένος (με το Υ.Γ. της 1ης κράτησης που έχει)
//   send → σε κάθε πελάτη (μία φορά ανά email), εκτός όσων έχουν κάνει διαγραφή από emails
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const resend = new Resend(process.env.RESEND_API_KEY)
const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function html(paragraphs: string[], ps?: string) {
  return `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#10182A;line-height:1.6;font-size:15px;">
    <p style="margin:0 0 20px;font-weight:800;font-size:18px;letter-spacing:-0.3px;">Washio</p>
    ${paragraphs.map(p => `<p style="margin:0 0 14px;">${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}
    ${ps ? `<p style="margin:18px 0 0;color:#374151;">${esc(ps)}</p>` : ''}
  </div>`
}

export async function POST(req: NextRequest) {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { refs?: string[]; subject?: string; paragraphs?: string[]; ps?: Record<string, string>; mode?: string }
  const refs = (b.refs || []).map(r => String(r).toUpperCase()).filter(r => /^WS-[A-Z0-9]{4,12}$/.test(r)).slice(0, 200)
  const subject = String(b.subject || '').trim().slice(0, 150)
  const paragraphs = (b.paragraphs || []).map(p => String(p).trim()).filter(Boolean).slice(0, 20)
  if (!refs.length || !subject || !paragraphs.length) return NextResponse.json({ error: 'refs / subject / paragraphs' }, { status: 400 })

  const { data: bks } = await db.from('bookings').select('booking_ref, user_id').in('booking_ref', refs)
  const rows: { ref: string; email: string; optOut: boolean }[] = []
  for (const bk of (bks || []) as { booking_ref: string; user_id: string | null }[]) {
    if (!bk.user_id) continue
    const { data } = await db.auth.admin.getUserById(bk.user_id)
    const email = data?.user?.email
    if (!email) continue
    rows.push({ ref: bk.booking_ref, email, optOut: !!(data?.user?.app_metadata as Record<string, unknown> | undefined)?.email_opt_out })
  }

  if (b.mode === 'test') {
    const first = rows.find(r => b.ps?.[r.ref]) || rows[0]
    const r = await resend.emails.send({ from: 'Washio <noreply@washio.gr>', to: user.email!, subject: `[ΔΟΚΙΜΗ] ${subject}`, html: html(paragraphs, first ? b.ps?.[first.ref] : undefined) })
    return NextResponse.json({ ok: !r.error, error: r.error?.message, to: user.email, recipients: rows.map(r => ({ ref: r.ref, email: r.email, optOut: r.optOut })) })
  }
  if (b.mode !== 'send') return NextResponse.json({ error: 'mode: test | send' }, { status: 400 })

  const seen = new Set<string>()
  const out: { ref: string; email: string; status: string }[] = []
  for (const r of rows) {
    const key = r.email.toLowerCase()
    if (seen.has(key)) { out.push({ ref: r.ref, email: r.email, status: 'duplicate' }); continue }
    seen.add(key)
    if (r.optOut) { out.push({ ref: r.ref, email: r.email, status: 'opted_out' }); continue }
    const res = await resend.emails.send({ from: 'Washio <noreply@washio.gr>', to: r.email, subject, html: html(paragraphs, b.ps?.[r.ref]) })
    out.push({ ref: r.ref, email: r.email, status: res.error ? `error: ${res.error.message}` : 'sent' })
  }
  return NextResponse.json({ ok: true, results: out })
}
