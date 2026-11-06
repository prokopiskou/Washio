import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { sendPush } from '@/lib/push'
import { ADMIN_EMAILS } from '@/lib/admins'
import { isThrottled, ipFrom } from '@/lib/throttle'
import { BL_AREAS, BL_TIMINGS, BL_INTENTS } from '@/lib/business-leads'

// «Απόκτησε το δικό σου πλυντήριο αυτοκινήτων» — φόρμα από το banner της αρχικής.
// Γράφει στον πίνακα business_leads (supabase/business_leads.sql) + push & email στους admins.
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const resend = new Resend(process.env.RESEND_API_KEY)


const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export async function POST(req: NextRequest) {
  if (await isThrottled(`blead:${ipFrom(req)}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Πολλές προσπάθειες — δοκίμασε αργότερα' }, { status: 429 })
  }
  const b = await req.json().catch(() => ({})) as { area?: string; timing?: string; intent?: string; name?: string; phone?: string; userId?: string }
  const area = BL_AREAS.find(a => a === b.area)
  const timing = BL_TIMINGS.find(t => t === b.timing)
  const intent = BL_INTENTS.find(i => i === b.intent)
  const name = String(b.name || '').trim().slice(0, 120)
  const phone = String(b.phone || '').replace(/[^\d+]/g, '').slice(0, 20)
  if (!area || !timing || !intent) return NextResponse.json({ error: 'Συμπλήρωσε όλες τις επιλογές' }, { status: 400 })
  if (name.length < 3) return NextResponse.json({ error: 'Γράψε το ονοματεπώνυμό σου' }, { status: 400 })
  if (phone.replace(/\D/g, '').length < 10) return NextResponse.json({ error: 'Γράψε σωστό κινητό' }, { status: 400 })

  const { error } = await admin.from('business_leads').insert({
    area, timing, intent, name, phone, user_id: b.userId || null, source: 'home_banner',
  })
  if (error) {
    console.error('business_leads insert', error.message)
    return NextResponse.json({ error: 'Κάτι πήγε στραβά — δοκίμασε ξανά' }, { status: 500 })
  }

  const summary = `${name} · ${phone} · ${area} · ${intent} · ${timing}`
  try {
    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const ids = (users?.users || []).filter(u => u.email && ADMIN_EMAILS.includes(u.email.toLowerCase())).map(u => u.id)
    await Promise.all(ids.map(uid => sendPush(uid, { title: '🏁 Ενδιαφέρον για δικό του πλυντήριο', body: summary, url: '/admin' })))
  } catch { /* best-effort */ }
  try {
    await resend.emails.send({
      from: 'Washio <noreply@washio.gr>',
      to: ADMIN_EMAILS,
      subject: `🏁 Θέλει δικό του πλυντήριο · ${area} · ${timing}`,
      html: `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#10182A;">
        <h2 style="margin:0 0 12px;">Νέο ενδιαφέρον: «Απόκτησε το δικό σου πλυντήριο»</h2>
        <table style="width:100%;font-size:14px;border-collapse:collapse;">
          <tr><td style="color:#6B7280;padding:6px 0;">Όνομα</td><td style="text-align:right;font-weight:600;">${esc(name)}</td></tr>
          <tr><td style="color:#6B7280;padding:6px 0;">Κινητό</td><td style="text-align:right;font-weight:600;"><a href="tel:${esc(phone)}">${esc(phone)}</a></td></tr>
          <tr><td style="color:#6B7280;padding:6px 0;">Περιοχή</td><td style="text-align:right;">${esc(area)}</td></tr>
          <tr><td style="color:#6B7280;padding:6px 0;">Ενδιαφέρον</td><td style="text-align:right;">${esc(intent)}</td></tr>
          <tr><td style="color:#6B7280;padding:6px 0;">Πότε</td><td style="text-align:right;">${esc(timing)}</td></tr>
        </table>
      </div>`,
    })
  } catch { /* best-effort */ }
  return NextResponse.json({ ok: true })
}
