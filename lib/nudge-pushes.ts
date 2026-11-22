import type { SupabaseClient } from '@supabase/supabase-js'
import { sendPush } from '@/lib/push'

// Επιπλέον «σπρωξίματα» με PUSH (μόνο σε όσους έχουν ενεργές ειδοποιήσεις).
// Καλούνται από το /api/cron/welcome-nudge (κάθε 15–30').
//  1) day3: γράφτηκε πριν 2–4 μέρες, δεν έχει κάνει καμία κράτηση, έχει ακόμα το −3€ → ένα push.
//  2) payAbandon: πάτησε «πληρωμή» πριν 25–120' και δεν έκλεισε → ένα push (το πολύ 1 / 72 ώρες).
// Ποτέ σε ομάδα/δοκιμές ή πλυντές (ιδιοκτήτες / μέλη πλυντηρίων).

const athensHour = () => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))

async function pushUsers(db: SupabaseClient, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const [{ data: n }, { data: w }] = await Promise.all([
    db.from('native_push_tokens').select('user_id').in('user_id', ids),
    db.from('push_subscriptions').select('user_id').in('user_id', ids),
  ])
  return new Set([...(n || []), ...(w || [])].map(r => (r as { user_id: string }).user_id))
}
async function partners(db: SupabaseClient): Promise<Set<string>> {
  const s = new Set<string>()
  const { data: l } = await db.from('locations').select('owner_id')
  for (const r of (l || []) as { owner_id: string | null }[]) if (r.owner_id) s.add(r.owner_id)
  try { const { data: m } = await db.from('location_members').select('user_id'); for (const r of (m || []) as { user_id: string }[]) s.add(r.user_id) } catch { /* */ }
  return s
}
async function meta(db: SupabaseClient, id: string) {
  const { data } = await db.auth.admin.getUserById(id)
  return { user: data?.user, app: (data?.user?.app_metadata || {}) as Record<string, unknown> }
}

/** Push 3ης μέρας: «Το −3€ σου ισχύει ακόμα Χ μέρες». */
export async function day3Push(db: SupabaseClient, opts: { dryRun?: boolean } = {}) {
  const h = athensHour()
  if (!opts.dryRun && (h < 11 || h > 20)) return { skipped: 'hours' }
  const from = new Date(Date.now() - 96 * 3600e3).toISOString(), to = new Date(Date.now() - 48 * 3600e3).toISOString()
  const { data: aud } = await db.from('audience_profiles').select('user_id, internal, can_push, signed_up_at')
    .gte('signed_up_at', from).lte('signed_up_at', to).eq('can_push', true).eq('internal', false).limit(500)
  const ids = ((aud || []) as { user_id: string }[]).map(a => a.user_id)
  if (!ids.length) return { candidates: 0, sent: 0 }
  const [{ data: bk }, { data: pr }, part] = await Promise.all([
    db.from('bookings').select('user_id').in('user_id', ids),
    db.from('profiles').select('id, referral_credit').in('id', ids),
    partners(db),
  ])
  const booked = new Set(((bk || []) as { user_id: string }[]).map(b => b.user_id))
  const credit = new Map(((pr || []) as { id: string; referral_credit: number }[]).map(p => [p.id, Number(p.referral_credit) || 0]))
  const list = ids.filter(id => !booked.has(id) && !part.has(id) && (credit.get(id) || 0) >= 3)
  let sent = 0
  for (const id of list.slice(0, 60)) {
    const { app } = await meta(db, id)
    if (app.day3_push_at) continue
    const exp = app.coupon_expires_at ? new Date(String(app.coupon_expires_at)).getTime() : 0
    const days = exp ? Math.ceil((exp - Date.now()) / 864e5) : 0
    if (exp && days < 1) continue
    if (opts.dryRun) { sent++; continue }
    await db.auth.admin.updateUserById(id, { app_metadata: { day3_push_at: new Date().toISOString() } })
    try {
      await sendPush(id, {
        title: 'Το −3€ σου σε περιμένει 🎁',
        body: days ? `Ισχύει ακόμα ${days} ${days === 1 ? 'μέρα' : 'μέρες'}. Κλείσε ώρα κοντά σου σε 30″.` : 'Κλείσε ώρα κοντά σου σε 30″.',
        url: '/map',
      })
      sent++
    } catch { /* */ }
  }
  return { candidates: list.length, sent }
}

/** Push «δεν ολοκληρώθηκε»: πάτησε «πληρωμή» πριν 25–120' και δεν έκλεισε. */
export async function payAbandonPush(db: SupabaseClient, opts: { dryRun?: boolean } = {}) {
  const h = athensHour()
  if (!opts.dryRun && (h < 9 || h > 21)) return { skipped: 'hours' }
  const { data: ev } = await db.from('funnel_events').select('user_id, location_id, created_at').eq('step', 'pay_click')
    .not('user_id', 'is', null).gte('created_at', new Date(Date.now() - 120 * 60e3).toISOString())
    .lte('created_at', new Date(Date.now() - 25 * 60e3).toISOString())
  const last = new Map<string, { loc: string | null; at: string }>()
  for (const e of (ev || []) as { user_id: string; location_id: string | null; created_at: string }[]) last.set(e.user_id, { loc: e.location_id, at: e.created_at })
  const ids = [...last.keys()]
  if (!ids.length) return { candidates: 0, sent: 0 }
  const [push, part] = await Promise.all([pushUsers(db, ids), partners(db)])
  let sent = 0, candidates = 0
  for (const id of ids) {
    if (!push.has(id) || part.has(id)) continue
    const p = last.get(id)!
    const { count } = await db.from('bookings').select('id', { count: 'exact', head: true }).eq('user_id', id).gte('created_at', new Date(new Date(p.at).getTime() - 10 * 60e3).toISOString())
    if ((count || 0) > 0) continue
    const { user, app } = await meta(db, id)
    if (!user || /(withinsuccess|prokopis71|giwrgos2070|alexandr\.sph|sk5vhy6dhz|g7cbwtydrr|\+test|appreview)/i.test(user.email || '')) continue
    if (app.abandon_push_at && Date.now() - new Date(String(app.abandon_push_at)).getTime() < 72 * 3600e3) continue
    candidates++
    if (opts.dryRun) continue
    await db.auth.admin.updateUserById(id, { app_metadata: { abandon_push_at: new Date().toISOString() } })
    let url = '/map'
    if (p.loc) { const { data: l } = await db.from('locations').select('slug').eq('id', p.loc).maybeSingle(); if (l?.slug) url = `/locations/${l.slug}` }
    try {
      await sendPush(id, { title: 'Η κράτησή σου δεν ολοκληρώθηκε', body: 'Η ώρα σου μπορεί να είναι ακόμα ελεύθερη. Κλείσε σε 1 λεπτό, πληρώνεις και στο πλυντήριο.', url })
      sent++
    } catch { /* */ }
  }
  return { candidates, sent }
}
