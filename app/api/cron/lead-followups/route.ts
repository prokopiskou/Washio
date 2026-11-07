import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { sendPush } from '@/lib/push'
import { ADMIN_EMAILS } from '@/lib/admins'

// Υπενθύμιση follow-up αιτήσεων πλυντηρίων: email (+ push) ~15' πριν, σε όποιον όρισε το follow-up.
// Τρέχει από το /api/cron/emails (κάθε 15') → παράθυρο 0–20' → φτάνει ~5–20' πριν. Μία φορά (followup_notified_at).
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const resend = new Resend(process.env.RESEND_API_KEY)
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const now = new Date()
  const to = new Date(now.getTime() + 20 * 60 * 1000)
  const { data, error } = await db.from('applications')
    .select('id, business_name, owner_name, phone, email, followup_at, followup_by, pipeline_notes')
    .eq('stage', 'followup').is('followup_notified_at', null)
    .gte('followup_at', new Date(now.getTime() - 60 * 60 * 1000).toISOString()).lte('followup_at', to.toISOString())
  if (error) return NextResponse.json({ ok: false, skipped: 'column', error: error.message })

  let sent = 0
  for (const a of data || []) {
    const { data: claimed } = await db.from('applications').update({ followup_notified_at: now.toISOString() })
      .eq('id', a.id).is('followup_notified_at', null).select('id')
    if (!claimed?.length) continue
    const when = new Intl.DateTimeFormat('el-GR', { timeZone: 'Europe/Athens', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(a.followup_at))
    const mins = Math.max(0, Math.round((new Date(a.followup_at).getTime() - now.getTime()) / 60000))
    const toEmail = a.followup_by && ADMIN_EMAILS.includes(String(a.followup_by).toLowerCase()) ? [a.followup_by] : ADMIN_EMAILS
    const name = String(a.business_name || 'Πλυντήριο').trim()
    try {
      await resend.emails.send({
        from: 'Washio <noreply@washio.gr>', to: toEmail,
        subject: `📞 Follow-up σε ${mins}' · ${name}`,
        html: `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px;color:#10182A;">
          <h2 style="margin:0 0 10px;">📞 Follow-up σε ${mins}'</h2>
          <p style="margin:0 0 14px;color:#6B7280;">${esc(when)}</p>
          <table style="width:100%;font-size:14px;border-collapse:collapse;">
            <tr><td style="color:#6B7280;padding:6px 0;">Πλυντήριο</td><td style="text-align:right;font-weight:600;">${esc(name)}</td></tr>
            <tr><td style="color:#6B7280;padding:6px 0;">Υπεύθυνος</td><td style="text-align:right;">${esc(a.owner_name || '—')}</td></tr>
            <tr><td style="color:#6B7280;padding:6px 0;">Κινητό</td><td style="text-align:right;font-weight:600;"><a href="tel:${esc(a.phone || '')}">${esc(a.phone || '—')}</a></td></tr>
            <tr><td style="color:#6B7280;padding:6px 0;">Email</td><td style="text-align:right;">${esc(a.email || '—')}</td></tr>
          </table>
          ${a.pipeline_notes ? `<p style="margin:14px 0 0;padding:10px 12px;background:#F3F4F6;border-radius:10px;font-size:13px;white-space:pre-line;">${esc(a.pipeline_notes)}</p>` : ''}
          <p style="margin:16px 0 0;"><a href="https://www.washio.gr/admin?tab=applications" style="color:#1A6FD4;font-weight:600;">Άνοιγμα στο admin →</a></p>
        </div>`,
      })
      sent++
    } catch { /* best-effort */ }
    try {
      const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const ids = (users?.users || []).filter(u => u.email && toEmail.map(String).map(s => s.toLowerCase()).includes(u.email.toLowerCase())).map(u => u.id)
      await Promise.all(ids.map(uid => sendPush(uid, { title: `📞 Follow-up σε ${mins}' · ${name}`, body: `${a.owner_name || ''} ${a.phone || ''}`.trim(), url: '/admin?tab=applications' })))
    } catch { /* best-effort */ }
  }
  return NextResponse.json({ ok: true, sent })
}
