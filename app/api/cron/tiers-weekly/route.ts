import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'
import { classify, allocate, loadTierData, TIER_META, type Tier, type LocStat, type Plan } from '@/lib/tiers'
import { athensToday } from '@/lib/time'

// Κάθε Δευτέρα 09:00–09:59 (Ελλάδα), μία φορά την εβδομάδα:
//  1) ξαναϋπολογίζει τις κατηγορίες πλυντηρίων (lib/tiers.ts) και τις αποθηκεύει (app_settings.location_tiers)
//     → η επόμενη εβδομάδα συγκρίνει με αυτές (ποιος ανέβηκε / έπεσε, «κρατάει τον τίτλο» winner)
//  2) email στον admin: αλλαγές κατηγορίας + πλάνο ad sets (€/μέρα ανά περιοχή) για να περαστεί στο Meta.
// GET (cron) · POST (admin) → προεπισκόπηση χωρίς αποθήκευση/αποστολή.
export const maxDuration = 60
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const TO = 'withinsuccess@gmail.com'
const esc = (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
const eur = (v: number) => `${v.toFixed(2).replace('.', ',')}€`
const RANK: Record<Tier, number> = { winner: 4, candidate: 3, new: 2, review: 1, dead: 0 }

function weekKey(ymd: string) {
  const d = new Date(ymd + 'T12:00:00Z'); const day = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - day); return d.toISOString().slice(0, 10) // Δευτέρα της εβδομάδας
}

function html(stats: LocStat[], plan: Plan) {
  const moved = stats.filter(s => s.prevTier && s.prevTier !== s.tier)
  const up = moved.filter(s => RANK[s.tier] > RANK[s.prevTier!]), down = moved.filter(s => RANK[s.tier] <= RANK[s.prevTier!])
  const line = (s: LocStat) => `<li>${esc(s.name)}: ${TIER_META[s.prevTier!].emoji} ${TIER_META[s.prevTier!].label} → <b>${TIER_META[s.tier].emoji} ${TIER_META[s.tier].label}</b> <span style="color:#888">(${esc(s.reason)})</span></li>`
  const tiers = (['winner', 'candidate', 'new', 'review', 'dead'] as Tier[]).map(t =>
    `<tr><td style="padding:3px 8px">${TIER_META[t].emoji} ${TIER_META[t].label}</td><td style="padding:3px 8px;text-align:right">${plan.byTier[t].count}</td><td style="padding:3px 8px;text-align:right">${plan.byTier[t].n14}</td><td style="padding:3px 8px;text-align:right"><b>${eur(plan.byTier[t].budget)}</b></td></tr>`).join('')
  const sets = plan.clusters.map(c =>
    `<tr><td style="padding:3px 8px"><b>${eur(c.budget)}</b></td><td style="padding:3px 8px">${c.members.map(m => `${TIER_META[m.tier].emoji} ${esc(m.name)}`).join(', ')}<br><span style="color:#888;font-size:12px">pin ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)} · 3 mi</span></td></tr>`).join('')
  const review = stats.filter(s => s.tier === 'review')
  return `<div style="font-family:-apple-system,Arial,sans-serif;font-size:14px;color:#10182A;max-width:640px">
    <h2 style="margin:0 0 8px">Washio · κατηγορίες πλυντηρίων</h2>
    <p style="margin:0 0 12px;color:#555">Budget πλάνου: <b>${eur(plan.daily)}/μέρα</b>. Αλλαγή budget: admin → Κατηγορίες.</p>
    <table style="border-collapse:collapse;font-size:13px"><tr style="color:#888"><td style="padding:3px 8px">Κατηγορία</td><td style="padding:3px 8px">Πλυντήρια</td><td style="padding:3px 8px">Κρατήσεις 14μ</td><td style="padding:3px 8px">€/μέρα</td></tr>${tiers}</table>
    ${up.length ? `<h3 style="margin:16px 0 4px">⬆️ Ανέβηκαν</h3><ul style="margin:0;padding-left:18px">${up.map(line).join('')}</ul>` : ''}
    ${down.length ? `<h3 style="margin:16px 0 4px">⬇️ Έπεσαν</h3><ul style="margin:0;padding-left:18px">${down.map(line).join('')}</ul>` : ''}
    ${review.length ? `<h3 style="margin:16px 0 4px">⚠️ Θέλουν τηλέφωνο</h3><ul style="margin:0;padding-left:18px">${review.map(s => `<li>${esc(s.name)} — ${esc(s.reason)}</li>`).join('')}</ul>` : ''}
    <h3 style="margin:16px 0 4px">Ad sets για το Meta αυτή την εβδομάδα</h3>
    <table style="border-collapse:collapse;font-size:13px">${sets}</table>
    <p style="margin-top:14px;color:#888;font-size:12px">Νεκρά πλυντήρια (0€): ${stats.filter(s => s.tier === 'dead').map(s => esc(s.name)).join(', ') || '—'}</p>
  </div>`
}

async function run(dry: boolean) {
  const d = await loadTierData(db)
  const stats = classify(d.locs, d.bookings, d.reviews, d.prev)
  const plan = allocate(stats, d.daily)
  const moved = stats.filter(s => s.prevTier && s.prevTier !== s.tier).map(s => ({ name: s.name, from: s.prevTier, to: s.tier }))
  if (dry) return { preview: true, daily: plan.daily, byTier: plan.byTier, moved, clusters: plan.clusters.length }
  const week = weekKey(athensToday())
  const { data: last } = await db.from('app_settings').select('value').eq('key', 'tiers_weekly_last').maybeSingle()
  if ((last?.value as { week?: string } | null)?.week === week) return { skipped: 'already this week' }
  await db.from('app_settings').upsert({ key: 'tiers_weekly_last', value: { week } }, { onConflict: 'key' })
  await db.from('app_settings').upsert({ key: 'location_tiers', value: { at: new Date().toISOString(), tiers: Object.fromEntries(stats.map(s => [s.id, s.tier])) } }, { onConflict: 'key' })
  if (process.env.RESEND_API_KEY) {
    const w = plan.byTier.winner
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: 'Washio <noreply@washio.gr>', to: TO,
      subject: `Washio: ${w.count} winners · ${moved.length} αλλαγές κατηγορίας · πλάνο ${eur(plan.daily)}/μέρα`,
      html: html(stats, plan),
    })
  }
  return { sent: true, week, moved: moved.length }
}

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const now = new Date()
  const wd = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', weekday: 'short' }).format(now)
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', hourCycle: 'h23' }).format(now))
  if (wd !== 'Mon' || h !== 9) return NextResponse.json({ skipped: 'not Monday 09:00' })
  return NextResponse.json(await run(false))
}

export async function POST() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  return NextResponse.json(await run(true))
}
