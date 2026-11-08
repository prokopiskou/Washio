import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { ADMIN_EMAILS } from '@/lib/admins'
import { windowStats, compare } from '@/lib/metrics'

// Καθημερινή αναφορά (email στους admins) κάθε πρωί 08:00–09:59: χθες vs ίδια μέρα προηγούμενης εβδομάδας
// + ⚠️ ειδοποίηση αν κάποιο βήμα έπεσε σημαντικά (95%). Μία φορά τη μέρα (app_settings 'metrics_daily_last').
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const resend = new Resend(process.env.RESEND_API_KEY)
const ymd = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(d)
const athensMidnight = (day: string) => new Date(new Date(`${day}T12:00:00Z`).toLocaleString('en-US', { timeZone: 'UTC' }))

function dayStart(day: string): Date {
  // 00:00 ώρα Ελλάδας της μέρας → UTC (θερινή/χειμερινή)
  const noonUtc = new Date(`${day}T12:00:00Z`)
  const athensNoon = new Date(noonUtc.toLocaleString('en-US', { timeZone: 'Europe/Athens' }))
  const offsetMs = athensNoon.getTime() - athensMidnight(day).getTime()
  return new Date(new Date(`${day}T00:00:00Z`).getTime() - offsetMs)
}

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  if (h < 8 || h > 9) return NextResponse.json({ skipped: 'hours' })
  const today = ymd(new Date())
  const { data: flag } = await db.from('app_settings').select('value').eq('key', 'metrics_daily_last').maybeSingle()
  if ((flag?.value as { day?: string } | null)?.day === today) return NextResponse.json({ skipped: 'sent' })
  const { error: fErr } = await db.from('app_settings').upsert({ key: 'metrics_daily_last', value: { day: today }, updated_at: new Date().toISOString() })
  if (fErr) return NextResponse.json({ skipped: 'no app_settings' })

  const yest = ymd(new Date(Date.now() - 864e5))
  const yStart = dayStart(yest), yEnd = dayStart(today)
  const [y, w] = await Promise.all([
    windowStats(db, yStart, yEnd),
    windowStats(db, new Date(yStart.getTime() - 7 * 864e5), new Date(yEnd.getTime() - 7 * 864e5)),
  ])
  const rows = compare(w, y)
  const drops = rows.filter(r => r.sig && !r.better)
  const p = (v: number | null) => v == null ? '—' : `${Math.round(v * 100)}%`
  const eur = (v: number) => `${v.toFixed(2).replace('.', ',')}€`
  const cpb = y.ad_spend && y.bookings ? eur(y.ad_spend / y.bookings) : '—'
  const dayName = new Intl.DateTimeFormat('el-GR', { weekday: 'long', day: 'numeric', month: 'numeric', timeZone: 'UTC' }).format(new Date(yest + 'T12:00:00Z'))
  const line = (label: string, a: string, b: string) => `<tr><td style="padding:5px 0;color:#6B7280;">${label}</td><td style="text-align:right;font-weight:700;color:#10182A;">${a}</td><td style="text-align:right;color:#9CA3AF;padding-left:10px;">${b}</td></tr>`
  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:20px;color:#10182A;">
    <h2 style="margin:0 0 4px;">📊 Washio · ${dayName}</h2>
    <p style="margin:0 0 14px;color:#6B7280;font-size:13px;">Δεξιά: ίδια μέρα προηγούμενης εβδομάδας</p>
    ${drops.length ? `<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:10px 12px;margin:0 0 14px;font-size:13px;color:#991B1B;"><b>⚠️ Σημαντική πτώση:</b> ${drops.map(d => `${d.label} ${p(d.before)} → ${p(d.after)}`).join(' · ')}</div>` : ''}
    <table style="width:100%;font-size:14px;border-collapse:collapse;">
      ${line('Κρατήσεις', String(y.bookings), String(w.bookings))}
      ${line('Επισκέπτες χάρτη', String(y.map_open), String(w.map_open))}
      ${rows.map(r => line(r.label, p(r.after), p(r.before))).join('')}
      ${line('Προμήθεια', eur(y.commission), eur(w.commission))}
      ${line('Διαφήμιση', y.ad_spend ? eur(y.ad_spend) : '—', w.ad_spend ? eur(w.ad_spend) : '—')}
      ${line('Κόστος / κράτηση', cpb, w.ad_spend && w.bookings ? eur(w.ad_spend / w.bookings) : '—')}
    </table>
    <p style="margin:16px 0 0;"><a href="https://www.washio.gr/admin" style="color:#1A6FD4;font-weight:600;">Admin → Μετρήσεις →</a></p>
  </div>`
  try {
    await resend.emails.send({ from: 'Washio <noreply@washio.gr>', to: ADMIN_EMAILS, subject: `📊 ${y.bookings} κρατήσεις χθες${drops.length ? ' · ⚠️ πτώση' : ''}`, html })
  } catch { /* best-effort */ }
  return NextResponse.json({ ok: true, yesterday: y, drops: drops.length })
}
