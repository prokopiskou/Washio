import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { isInternalEmail } from '@/lib/internal'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'

// Κάθε πρωί 10:00 (Ελλάδα) → email στον Γιώργο: λίστα πελατών που έπλυναν ΧΘΕΣ (κρατήσεις μέσω Washio),
// με κινητό / όνομα / πλυντήριο / υπηρεσία — για τηλέφωνο feedback.
// Μία φορά τη μέρα (app_settings 'feedback_calls_last'). Τρέχει από /api/cron/emails κάθε 15'.
// POST (admin) { mode: 'preview' } → τη λίστα ως JSON, χωρίς email.
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const resend = new Resend(process.env.RESEND_API_KEY)
const TO = ['giwrgos2070@gmail.com']
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(d)
const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

type Row = {
  booking_ref: string; slot_start_time: string; checked_in_at: string | null; customer_name: string | null; customer_phone: string | null
  locations: { name?: string } | null; services: { name?: string } | null
  profiles: { full_name?: string | null; phone?: string | null; email?: string | null } | null
}

async function list(day: string) {
  const { data, error } = await db.from('bookings')
    .select('booking_ref, slot_start_time, checked_in_at, customer_name, customer_phone, locations(name), services(name), profiles(full_name, phone, email)')
    .eq('slot_date', day).in('status', ['confirmed', 'completed'])
    .or('source.is.null,source.eq.platform')
    .order('slot_start_time', { ascending: true }).limit(300)
  if (error) throw new Error(error.message)
  return ((data || []) as unknown as Row[])
    .filter(b => !isInternalEmail(b.profiles?.email))
    .map(b => ({
      name: (b.customer_name || b.profiles?.full_name || '').trim(),
      phone: (b.customer_phone || b.profiles?.phone || '').trim(),
      place: b.locations?.name || '—',
      service: b.services?.name || '—',
      time: String(b.slot_start_time || '').slice(0, 5),
      scanned: !!b.checked_in_at,
      ref: b.booking_ref,
    }))
}

function html(dayLabel: string, rows: Awaited<ReturnType<typeof list>>) {
  const items = rows.map((r, i) => `
    <tr style="border-top:1px solid #F0F0F0;">
      <td style="padding:10px 6px 10px 0;color:#9CA3AF;vertical-align:top;">${i + 1}.</td>
      <td style="padding:10px 0;">
        <div style="font-weight:700;color:#10182A;">${r.phone ? `<a href="tel:${esc(r.phone)}" style="color:#1A6FD4;text-decoration:none;">${esc(r.phone)}</a>` : '<span style="color:#9CA3AF;">χωρίς κινητό</span>'}${r.name ? ` · ${esc(r.name)}` : ''}</div>
        <div style="color:#374151;font-size:13px;margin-top:2px;">${esc(r.place)} · ${esc(r.service)} · ${esc(r.time)}${r.scanned ? '' : ' <span style="color:#B45309;">(χωρίς σκανάρισμα)</span>'}</div>
      </td>
    </tr>`).join('')
  return `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#10182A;">
    <h2 style="margin:0 0 4px;">📞 Feedback · ${esc(dayLabel)}</h2>
    <p style="margin:0 0 14px;color:#6B7280;font-size:13px;">${rows.length} πελάτες έπλυναν χθες μέσω Washio. Πάρε τηλέφωνο: πώς πήγε, τι τους άρεσε, τι θα άλλαζαν.</p>
    ${rows.length ? `<table style="width:100%;font-size:14px;border-collapse:collapse;">${items}</table>` : '<p style="color:#6B7280;">Κανένα πλύσιμο χθες.</p>'}
  </div>`
}

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  if (h < 10 || h > 11) return NextResponse.json({ skipped: 'hours' })
  const today = ymd(new Date())
  const { data: flag } = await db.from('app_settings').select('value').eq('key', 'feedback_calls_last').maybeSingle()
  if ((flag?.value as { day?: string } | null)?.day === today) return NextResponse.json({ skipped: 'sent' })
  const { error: fErr } = await db.from('app_settings').upsert({ key: 'feedback_calls_last', value: { day: today }, updated_at: new Date().toISOString() })
  if (fErr) return NextResponse.json({ skipped: 'no app_settings' })

  const yest = ymd(new Date(Date.now() - 864e5))
  const rows = await list(yest)
  const dayLabel = new Intl.DateTimeFormat('el-GR', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'UTC' }).format(new Date(yest + 'T12:00:00Z'))
  const r = await resend.emails.send({ from: 'Washio <noreply@washio.gr>', to: TO, subject: `📞 Feedback: ${rows.length} πελάτες έπλυναν ${dayLabel}`, html: html(dayLabel, rows) })
  if (r.error) {
    await db.from('app_settings').upsert({ key: 'feedback_calls_last', value: { day: '' }, updated_at: new Date().toISOString() })
    return NextResponse.json({ ok: false, error: r.error.message })
  }
  return NextResponse.json({ ok: true, sent: rows.length })
}

export async function POST() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const yest = ymd(new Date(Date.now() - 864e5))
  return NextResponse.json({ day: yest, rows: await list(yest) })
}
