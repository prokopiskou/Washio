import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail, ADMIN_EMAILS } from '@/lib/admins'

// Καμπάνια email «Από Δευτέρα ήλιος — κλείσε με −3€».
// POST { mode: 'preview' }  → πόσοι παραλήπτες + δείγμα (δεν στέλνει τίποτα)
// POST { mode: 'test' }     → στέλνει ΜΟΝΟ στον admin που είναι συνδεδεμένος
// POST { mode: 'send' }     → στέλνει σε όλους τους παραλήπτες (batch, έως 100/κλήση)
// Παραλήπτες: χρήστες ΧΩΡΙΣ καμία ενεργή κράτηση, όχι ιδιοκτήτες πλυντηρίων, όχι admins.
export const maxDuration = 60

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const resend = new Resend(process.env.RESEND_API_KEY)

const CAMPAIGN = 'sunny_week_oct'
const URL_CTA = `https://washio.gr/map?utm_source=email&utm_medium=campaign&utm_campaign=${CAMPAIGN}`
const SUBJECT = 'Από Δευτέρα ήλιος ☀️ Κλείσε το πλύσιμό σου με −3€'

function html(hasCoupon: boolean): string {
  return `<!doctype html><html><body style="margin:0;background:#F7FAFC;">
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 16px;">
    <div style="background:#10182A;border-radius:18px 18px 0 0;padding:28px 28px 22px;text-align:center;">
      <img src="https://washio.gr/logo.png" alt="Washio" width="120" style="display:block;margin:0 auto 6px;" />
      <p style="margin:0;color:#19A8C7;font-size:12px;font-weight:700;letter-spacing:1.6px;">ΚΑΙΡΟΣ ΓΙΑ ΠΛΥΣΙΜΟ</p>
    </div>
    <div style="background:#FFFFFF;border:1px solid #E8EEF2;border-top:none;border-radius:0 0 18px 18px;padding:28px;">
      <h1 style="margin:0 0 14px;color:#10182A;font-size:22px;line-height:1.3;font-weight:800;">Από Δευτέρα, μια ολόκληρη εβδομάδα ήλιος. ☀️</h1>
      <p style="margin:0 0 12px;color:#4B5563;font-size:15px;line-height:1.6;">Μετά τις μπόρες του Σαββατοκύριακου, ήρθε η καλύτερη στιγμή για να λάμψει ξανά το αυτοκίνητό σου.</p>
      <p style="margin:0 0 20px;color:#4B5563;font-size:15px;line-height:1.6;"><strong style="color:#10182A;">Κλείσε από τώρα την ώρα σου</strong> για Δευτέρα, Τρίτη ή όποια μέρα σε βολεύει. Πας και σε περιμένουν. Χωρίς αναμονή.</p>
      ${hasCoupon ? `<div style="background:#EAF8FB;border:1px solid #CFECF3;border-radius:14px;padding:14px 16px;margin:0 0 22px;">
        <p style="margin:0;color:#078EAD;font-size:15px;font-weight:800;">🎁 Το κουπόνι −3€ είναι ήδη στον λογαριασμό σου</p>
        <p style="margin:4px 0 0;color:#6F7785;font-size:12px;">Ισχύει με πληρωμή κάρτας, σε πλύσιμο από 12€.</p>
      </div>` : ''}
      <a href="${URL_CTA}" style="display:block;background:#19A8C7;color:#FFFFFF;text-align:center;padding:16px;border-radius:14px;text-decoration:none;font-size:16px;font-weight:700;">Κλείσε την ώρα σου →</a>
      <p style="margin:20px 0 0;color:#9AA3AF;font-size:12px;line-height:1.6;text-align:center;">📍 Αργυρούπολη · Άλιμος · Άγ. Δημήτριος · Ηλιούπολη · Βύρωνας · Ζωγράφου</p>
    </div>
    <p style="margin:16px 0 0;color:#9AA3AF;font-size:11px;line-height:1.5;text-align:center;">Λαμβάνεις αυτό το email επειδή έχεις λογαριασμό στο Washio. Δεν θέλεις τέτοια μηνύματα; <a href="mailto:withinsuccess@gmail.com?subject=Unsubscribe%20Washio" style="color:#9AA3AF;">Διαγραφή</a>.</p>
  </div></body></html>`
}

async function recipients() {
  // Όλοι οι χρήστες (σελιδοποίηση Auth API).
  const users: { id: string; email: string }[] = []
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    for (const u of data.users) if (u.email) users.push({ id: u.id, email: u.email.toLowerCase() })
    if (data.users.length < 1000) break
  }
  const [{ data: booked }, { data: owners }, { data: profs }] = await Promise.all([
    admin.from('bookings').select('user_id').not('user_id', 'is', null).neq('status', 'cancelled'),
    admin.from('locations').select('owner_id').not('owner_id', 'is', null),
    admin.from('profiles').select('id, referral_credit'),
  ])
  const bookedSet = new Set((booked || []).map(b => b.user_id as string))
  const ownerSet = new Set((owners || []).map(o => o.owner_id as string))
  const credit = new Map((profs || []).map(p => [p.id as string, Number(p.referral_credit) || 0]))
  return users
    .filter(u => !bookedSet.has(u.id) && !ownerSet.has(u.id) && !ADMIN_EMAILS.includes(u.email))
    .map(u => ({ ...u, hasCoupon: (credit.get(u.id) || 0) >= 3 }))
}

export async function POST(req: NextRequest) {
  try {
    const sb = await createServerClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })

    const { mode } = (await req.json().catch(() => ({}))) as { mode?: 'preview' | 'test' | 'send' }
    const list = await recipients()

    if (mode === 'preview') {
      return NextResponse.json({
        subject: SUBJECT,
        total: list.length,
        withCoupon: list.filter(r => r.hasCoupon).length,
        sample: list.slice(0, 5).map(r => r.email.replace(/^(.{2}).*(@.*)$/, '$1***$2')),
      })
    }

    if (mode === 'test') {
      const { error } = await resend.emails.send({
        from: 'Washio <noreply@washio.gr>',
        to: user.email!,
        subject: '[ΔΟΚΙΜΗ] ' + SUBJECT,
        html: html(true),
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, sentTo: user.email })
    }

    if (mode === 'send') {
      let sent = 0
      const errors: string[] = []
      for (let i = 0; i < list.length; i += 100) {
        const chunk = list.slice(i, i + 100)
        const { error } = await resend.batch.send(chunk.map(r => ({
          from: 'Washio <noreply@washio.gr>',
          to: r.email,
          subject: SUBJECT,
          html: html(r.hasCoupon),
          headers: { 'List-Unsubscribe': '<mailto:withinsuccess@gmail.com?subject=Unsubscribe%20Washio>' },
          tags: [{ name: 'campaign', value: CAMPAIGN }],
        })))
        if (error) errors.push(error.message)
        else sent += chunk.length
      }
      return NextResponse.json({ ok: errors.length === 0, sent, errors })
    }

    return NextResponse.json({ error: 'mode: preview | test | send' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Σφάλμα' }, { status: 500 })
  }
}
