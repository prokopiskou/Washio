import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { sendPush } from '@/lib/push'
import { isOptedOut } from '@/lib/unsubscribe'
import { isInternalEmail } from '@/lib/internal'
import { athensToday } from '@/lib/time'
import { type WxDay, isWet, bestWashDay } from '@/lib/weather'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'

// «Αύριο βρέχει — μετάθεσε δωρεάν». Το απόγευμα (18:00–20:59 Ελλάδα), μία φορά τη μέρα:
// κρατήσεις ΑΥΡΙΟ σε πλυντήριο όπου η πρόγνωση δίνει ΔΥΝΑΤΗ βροχή (≥5mm ή καταιγίδα — lib/weather.ts).
// Κανάλι: push (αν έχει) → αλλιώς email. Link → σελίδα κράτησης με ανοιχτή τη μετάθεση + προτεινόμενη μέρα.
// Γιατί: σε μέρες ≥5mm ακυρώνεται 52% των κρατήσεων (vs 21%) — μετατρέπουμε ακύρωση σε μετάθεση.
// GET (cron) · POST (admin) → preview χωρίς αποστολή.
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const resend = new Resend(process.env.RESEND_API_KEY)
const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const WD = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο']

function addDays(ymd: string, n: number) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}
const dayLabel = (ymd: string) => { const d = new Date(ymd + 'T12:00:00Z'); return `${WD[d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}` }

async function forecast(lat: number, lng: number): Promise<WxDay[]> {
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(1)}&longitude=${lng.toFixed(1)}&daily=weather_code,precipitation_probability_max,precipitation_sum&timezone=Europe%2FAthens&forecast_days=7`)
  if (!r.ok) return []
  const d = (await r.json())?.daily || {}
  return (d.time || []).map((date: string, i: number) => {
    const code = Number(d.weather_code?.[i]) || 0, prob = Number(d.precipitation_probability_max?.[i]) || 0, mm = Number(d.precipitation_sum?.[i]) || 0
    return { date, prob, mm, kind: code >= 95 ? 'storm' : mm >= 5 || (mm >= 2 && prob >= 60) ? 'rain' : code <= 1 ? 'sun' : 'cloud' } as WxDay
  })
}

type Row = {
  id: string; booking_ref: string; user_id: string; location_id: string; slot_start_time: string
  locations: { name?: string; lat?: number | null; lng?: number | null; location_hours?: { day_of_week: number; is_closed: boolean | null }[] } | null
  profiles: { email?: string | null; full_name?: string | null } | null
}

async function run(dry: boolean) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  const today = athensToday()
  if (!dry) {
    if (h < 18 || h > 20) return { skipped: 'hours' }
    const { data: flag } = await db.from('app_settings').select('value').eq('key', 'rain_notice_last').maybeSingle()
    if ((flag?.value as { day?: string } | null)?.day === today) return { skipped: 'sent' }
    const { error } = await db.from('app_settings').upsert({ key: 'rain_notice_last', value: { day: today }, updated_at: new Date().toISOString() })
    if (error) return { skipped: 'no app_settings' }
  }
  const tomorrow = addDays(today, 1)
  const { data, error } = await db.from('bookings')
    .select('id, booking_ref, user_id, location_id, slot_start_time, locations(name, lat, lng, location_hours(day_of_week, is_closed)), profiles(email, full_name)')
    .eq('slot_date', tomorrow).eq('status', 'confirmed').not('user_id', 'is', null)
    .or('source.is.null,source.eq.platform').limit(500)
  if (error) return { ok: false, error: error.message }
  const rows = ((data || []) as unknown as Row[]).filter(b => !isInternalEmail(b.profiles?.email))
  if (!rows.length) return { ok: true, tomorrow, bookings: 0 }

  // Πρόγνωση ανά πλυντήριο (cache ανά κελί ~10km).
  const cache = new Map<string, WxDay[]>()
  const wet: { b: Row; mm: number; alt: string | null }[] = []
  for (const b of rows) {
    const lat = Number(b.locations?.lat), lng = Number(b.locations?.lng)
    if (!isFinite(lat) || !isFinite(lng) || (!lat && !lng)) continue
    const key = `${lat.toFixed(1)},${lng.toFixed(1)}`
    if (!cache.has(key)) cache.set(key, await forecast(lat, lng).catch(() => []))
    const days = cache.get(key)!
    const t = days.find(d => d.date === tomorrow)
    if (!t || !isWet(t)) continue
    const hours = b.locations?.location_hours || []
    const closed = (ymd: string) => {
      const js = new Date(ymd + 'T12:00:00Z').getUTCDay(); const dow = js === 0 ? 7 : js
      const hh = hours.find(x => x.day_of_week === dow)
      return hours.length ? (!hh || !!hh.is_closed) : js === 0
    }
    // Προτεινόμενη μέρα: μετά το αύριο.
    const alt = bestWashDay(days.filter(d => d.date > tomorrow), closed)
    wet.push({ b, mm: Math.round(t.mm), alt })
  }
  if (dry) return { ok: true, tomorrow, bookings: rows.length, wet: wet.map(w => ({ ref: w.b.booking_ref, place: w.b.locations?.name, mm: w.mm, alt: w.alt })) }
  if (!wet.length) return { ok: true, tomorrow, bookings: rows.length, wet: 0 }

  const users = [...new Set(wet.map(w => w.b.user_id))]
  const [{ data: nat }, { data: web }] = await Promise.all([
    db.from('native_push_tokens').select('user_id').in('user_id', users),
    db.from('push_subscriptions').select('user_id').in('user_id', users),
  ])
  const hasPush = new Set([...(nat || []), ...(web || [])].map(r => (r as { user_id: string }).user_id))
  const stats = { wet: wet.length, push: 0, email: 0, skipped: 0, failed: 0 }

  for (const { b, alt } of wet) {
    const place = b.locations?.name || 'το πλυντήριο'
    const time = String(b.slot_start_time || '').slice(0, 5)
    const path = `/profile/bookings/${b.id}?reschedule=1${alt ? `&to=${alt}` : ''}`
    const altTxt = alt ? ` Προτείνουμε ${dayLabel(alt)}.` : ''
    try {
      if (hasPush.has(b.user_id)) {
        await sendPush(b.user_id, { title: '🌧️ Αύριο βρέχει', body: `Το πλύσιμο στο ${place} (${time}) — μετάθεσέ το δωρεάν με ένα πάτημα.${altTxt}`, url: path })
        stats.push++
      } else if (b.profiles?.email) {
        const { data: u } = await db.auth.admin.getUserById(b.user_id)
        if (isOptedOut(u?.user?.app_metadata as Record<string, unknown>)) { stats.skipped++; continue }
        const first = (b.profiles.full_name || '').trim().split(/\s+/)[0]
        const url = `https://www.washio.gr${path}`
        const r = await resend.emails.send({
          from: 'Washio <noreply@washio.gr>', to: b.profiles.email,
          subject: `🌧️ Αύριο βρέχει — μετάθεσε το πλύσιμο δωρεάν`,
          html: `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#10182A;line-height:1.6;font-size:15px;">
            <p style="margin:0 0 18px;font-weight:800;font-size:18px;">Washio</p>
            <p style="margin:0 0 12px;">${first ? esc(first) + ', α' : 'Α'}ύριο η πρόγνωση δίνει δυνατή βροχή.</p>
            <p style="margin:0 0 18px;">Το πλύσιμό σου στο <b>${esc(place)}</b> στις <b>${esc(time)}</b> μπορεί να πάει σε άλλη μέρα — δωρεάν, με ένα πάτημα.${alt ? ` Προτείνουμε <b>${esc(dayLabel(alt))}</b>.` : ''}</p>
            <a href="${url}" style="display:inline-block;background:#10182A;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:12px;">Άλλαξε μέρα</a>
            <p style="margin:18px 0 0;color:#6B7280;font-size:13px;">Αν θες να πλύνεις κανονικά, δεν χρειάζεται να κάνεις τίποτα.</p>
            <p style="margin:14px 0 0;color:#CCC;font-size:11px;">Washio · ${esc(b.booking_ref)}</p>
          </div>`,
        })
        if (r.error) { stats.failed++; continue }
        stats.email++
      } else stats.skipped++
    } catch { stats.failed++ }
  }
  return { ok: true, tomorrow, ...stats }
}

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await run(false))
}

export async function POST() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  return NextResponse.json(await run(true))
}
