import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { phoneKey } from '@/lib/referral'
import { plateKey } from '@/lib/coupon-guard'
import { isThrottled } from '@/lib/throttle'

// Εβδομαδιαίο report ΥΠΟΠΤΩΝ κουπονιών (Δευτέρα 09:00 Αθήνα) → email στον admin.
// «Ύποπτο» = κρατήσεις με κουπόνι από ΔΙΑΦΟΡΕΤΙΚΟΥΣ λογαριασμούς που μοιράζονται:
//   συσκευή · πινακίδα · κάρτα (ισχυρά σήματα) · κινητό · IP · όνομα (ασθενή).
// GET (cron, Bearer CRON_SECRET) — καλείται κάθε 15' από το GitHub workflow, στέλνει μία φορά
// τη Δευτέρα (09:00–11:59). ?force=1 → στέλνει τώρα (για δοκιμή).
export const maxDuration = 60

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const resend = new Resend(process.env.RESEND_API_KEY)
const REPORT_TO = 'withinsuccess@gmail.com'

type Row = {
  id: string; booking_ref: string; user_id: string; created_at: string; coupon_amount: number
  car_plate: string | null; device_id?: string | null; client_ip?: string | null; card_fingerprint?: string | null
  location_name?: string
}

function athensParts(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]))
  return { wd: p.weekday, h: Number(p.hour), m: Number(p.minute) }
}
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const normName = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zα-ω]/g, '')

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const force = req.nextUrl.searchParams.get('force') === '1'
  const { wd, h, m } = athensParts()
  // Δευτέρα 09:00–11:59 (το GitHub cron μπορεί να αργήσει) — ΜΙΑ φορά (κλειδί ανά 6 ώρες).
  if (!force) {
    if (!(wd === 'Mon' && h >= 9 && h < 12)) return NextResponse.json({ ok: true, skipped: true })
    if (await isThrottled('coupon-report-weekly', 1, 6 * 60 * 60 * 1000)) return NextResponse.json({ ok: true, alreadySent: true })
  }
  void m

  // Κρατήσεις με κουπόνι (όχι ακυρωμένες). Με/χωρίς τις νέες στήλες (πριν το coupon_guard.sql).
  let rows: Row[] = []
  const full = await admin.from('bookings')
    .select('id, booking_ref, user_id, created_at, coupon_amount, car_plate, device_id, client_ip, card_fingerprint, locations(name)')
    .gt('coupon_amount', 0).neq('status', 'cancelled').not('user_id', 'is', null).limit(20000)
  if (!full.error) rows = (full.data || []).map(r => ({ ...(r as unknown as Row), location_name: (r as { locations?: { name?: string } }).locations?.name }))
  else {
    const basic = await admin.from('bookings').select('id, booking_ref, user_id, created_at, coupon_amount, car_plate, locations(name)')
      .gt('coupon_amount', 0).neq('status', 'cancelled').not('user_id', 'is', null).limit(20000)
    rows = (basic.data || []).map(r => ({ ...(r as unknown as Row), location_name: (r as { locations?: { name?: string } }).locations?.name }))
  }

  const userIds = [...new Set(rows.map(r => r.user_id))]
  const { data: profs } = userIds.length
    ? await admin.from('profiles').select('id, phone, full_name').in('id', userIds)
    : { data: [] as { id: string; phone: string | null; full_name: string | null }[] }
  const prof = new Map((profs || []).map(p => [p.id as string, p as { phone: string | null; full_name: string | null }]))
  const emails = new Map<string, string>()
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    for (const u of data?.users || []) if (userIds.includes(u.id)) emails.set(u.id, u.email || '')
    if (!data || data.users.length < 1000) break
  }

  const signals: { key: string; label: string; strong: boolean; get: (r: Row) => string | null }[] = [
    { key: 'device', label: 'Ίδια συσκευή', strong: true, get: r => r.device_id || null },
    { key: 'plate', label: 'Ίδια πινακίδα', strong: true, get: r => plateKey(r.car_plate) },
    { key: 'card', label: 'Ίδια κάρτα', strong: true, get: r => r.card_fingerprint || null },
    { key: 'phone', label: 'Ίδιο κινητό', strong: true, get: r => phoneKey(prof.get(r.user_id)?.phone) },
    { key: 'ip', label: 'Ίδια IP (ασθενές — κοινόχρηστο Wi-Fi/κεραία)', strong: false, get: r => r.client_ip || null },
    { key: 'name', label: 'Ίδιο όνομα (ασθενές)', strong: false, get: r => { const n = normName(prof.get(r.user_id)?.full_name || ''); return n.length >= 5 ? n : null } },
  ]

  const sections: string[] = []
  let strongGroups = 0
  for (const s of signals) {
    const groups = new Map<string, Row[]>()
    for (const r of rows) { const k = s.get(r); if (!k) continue; (groups.get(k) || groups.set(k, []).get(k)!).push(r) }
    const bad = [...groups.entries()].filter(([, rs]) => new Set(rs.map(r => r.user_id)).size >= 2)
    if (!bad.length) continue
    if (s.strong) strongGroups += bad.length
    sections.push(`<h3 style="margin:22px 0 6px;font-size:15px;color:#10182A">${esc(s.label)} — ${bad.length}</h3>` + bad.map(([, rs]) =>
      `<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px">${rs.map(r => `<tr>
        <td style="padding:4px;border-bottom:1px solid #eee;font-family:monospace">${esc(r.booking_ref)}</td>
        <td style="padding:4px;border-bottom:1px solid #eee">${esc(r.created_at.slice(0, 10))}</td>
        <td style="padding:4px;border-bottom:1px solid #eee">${esc(emails.get(r.user_id) || r.user_id.slice(0, 8))}</td>
        <td style="padding:4px;border-bottom:1px solid #eee">${esc(prof.get(r.user_id)?.full_name || '')}</td>
        <td style="padding:4px;border-bottom:1px solid #eee">${esc(prof.get(r.user_id)?.phone || '')}</td>
        <td style="padding:4px;border-bottom:1px solid #eee">${esc(r.car_plate || '')}</td>
        <td style="padding:4px;border-bottom:1px solid #eee">${esc(r.location_name || '')}</td>
        <td style="padding:4px;border-bottom:1px solid #eee;text-align:right">−${Number(r.coupon_amount).toFixed(2)} €</td>
      </tr>`).join('')}</table>`).join(''))
  }

  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000
  const weekCount = rows.filter(r => new Date(r.created_at).getTime() >= weekAgo).length
  const html = `<div style="font-family:-apple-system,sans-serif;max-width:760px">
    <h2 style="color:#10182A;margin:0 0 4px">Κουπόνια — εβδομαδιαίο report</h2>
    <p style="color:#666;font-size:13px;margin:0 0 14px">Κρατήσεις με κουπόνι: <b>${rows.length}</b> συνολικά · <b>${weekCount}</b> τις τελευταίες 7 μέρες.
    Ύποπτες ομάδες (ισχυρά σήματα): <b>${strongGroups}</b>.</p>
    ${sections.length ? sections.join('') : '<p style="font-size:14px">✅ Καμία ύποπτη επανάληψη κουπονιού.</p>'}
    <p style="color:#999;font-size:11px;margin-top:18px">Ισχυρά: συσκευή, πινακίδα, κάρτα, κινητό. Ασθενή (μόνο για έλεγχο): IP, όνομα.</p>
  </div>`

  const { error } = await resend.emails.send({
    from: 'Washio <noreply@washio.gr>',
    to: REPORT_TO,
    subject: `Washio · Κουπόνια: ${strongGroups} ύποπτες ομάδες`,
    html,
  })
  return NextResponse.json({ ok: !error, strongGroups, couponBookings: rows.length, error: error?.message })
}
