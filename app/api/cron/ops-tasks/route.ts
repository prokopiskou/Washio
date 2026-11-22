import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GIORGOS, PROKOPIS, upsertTask, athensDay, athensHour, athensTodayAt, type TaskItem } from '@/lib/ops-tasks'
import { sendPush } from '@/lib/push'

// ============================================================
// Αυτόματες εργασίες CRM & Operations (κάθε 30' από το /api/cron/emails, 07:00–22:59).
// Κάθε κανόνας φτιάχνει task ΜΟΝΟ όταν υπάρχει σαφής ενέργεια · ένα ανοιχτό task ανά πρόβλημα (dedupe).
// ?dry=1 → μόνο μέτρηση (χωρίς εγγραφές).
// ============================================================

export const maxDuration = 120
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const TEAM_RE = /(withinsuccess|prokopis71|giwrgos2070|alexandr\.sph|sk5vhy6dhz|g7cbwtydrr|\+test|appreview)/i

type Prof = { id: string; full_name: string | null; phone: string | null }
async function profiles(ids: string[]): Promise<Map<string, Prof>> {
  const m = new Map<string, Prof>()
  const uniq = [...new Set(ids.filter(Boolean))]
  for (let i = 0; i < uniq.length; i += 300) {
    const { data } = await db.from('profiles').select('id, full_name, phone').in('id', uniq.slice(i, i + 300))
    for (const p of (data || []) as Prof[]) m.set(p.id, p)
  }
  return m
}
async function teamIds(): Promise<Set<string>> {
  const s = new Set<string>()
  for (let page = 1; page <= 20; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    for (const u of data?.users || []) if (u.email && TEAM_RE.test(u.email)) s.add(u.id)
    if (!data || data.users.length < 1000) break
  }
  return s
}
const locNames = async () => {
  const { data } = await db.from('locations').select('id, name, phone, is_active, created_at')
  return new Map(((data || []) as { id: string; name: string; phone: string | null; is_active: boolean; created_at: string }[]).map(l => [l.id, l]))
}

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const out: Record<string, unknown> = {}
  const hour = athensHour()
  const today = athensDay(0), yesterday = athensDay(-1)
  const locs = await locNames()
  const team = await teamIds()
  const dueToday = athensTodayAt(18)
  const run = async (name: string, fn: () => Promise<unknown>) => { try { out[name] = await fn() } catch (e) { out[name] = { error: (e as Error).message } } }

  // P1 · Αξιολόγηση ≤3★ (τελευταίες 3 μέρες)
  await run('review_low', async () => {
    const since = new Date(Date.now() - 3 * 864e5).toISOString()
    const { data } = await db.from('reviews').select('id, rating, comment, created_at, user_id, location_id, booking_id').lte('rating', 3).gte('created_at', since)
    const rows = (data || []) as { id: string; rating: number; comment: string | null; user_id: string | null; location_id: string; booking_id: string | null }[]
    const pr = await profiles(rows.map(r => r.user_id || ''))
    let n = 0
    for (const r of rows) {
      if (r.user_id && team.has(r.user_id)) continue
      const p = r.user_id ? pr.get(r.user_id) : undefined
      const { data: b } = r.booking_id ? await db.from('bookings').select('booking_ref').eq('id', r.booking_id).maybeSingle() : { data: null }
      const res = await upsertTask(db, {
        dedupe_key: `review:${r.id}`, rule: 'review_low', priority: 'high', assignee: GIORGOS, due_at: dueToday,
        title: `Κάλεσε ${p?.full_name || 'τον πελάτη'}: ${r.rating}★ στο ${locs.get(r.location_id)?.name || '—'}`,
        details: [r.comment ? `«${r.comment}»` : 'Χωρίς σχόλιο.', p?.phone ? `📞 ${p.phone}` : '', b?.booking_ref ? `Κράτηση ${b.booking_ref}` : '',
          'Στόχος: μάθε τι έγινε, ενημέρωσε το πλυντήριο αν χρειάζεται, γράψε την κατάληξη.'].filter(Boolean).join('\n'),
        location_id: r.location_id, booking_id: r.booking_id, review_id: r.id,
        items: p?.phone ? [{ key: 'call', label: p.full_name || 'Πελάτης', phone: p.phone }] : [],
      })
      if (res === 'created') n++
    }
    return n
  })

  // P1 · QR: >20% μη σκαναρισμένες, τελευταίες 7 μέρες, ≥5 επιλέξιμες (ραντεβού που πέρασαν, όχι ακύρωση/no-show)
  await run('qr_unscanned', async () => {
    const { data } = await db.from('bookings').select('id, booking_ref, location_id, slot_date, status, checked_in_at, source, user_id')
      .gte('slot_date', athensDay(-7)).lte('slot_date', yesterday).not('status', 'in', '(cancelled,no_show)')
    const by = new Map<string, { all: number; miss: { id: string; ref: string; day: string }[] }>()
    for (const b of (data || []) as { id: string; booking_ref: string; location_id: string; slot_date: string; checked_in_at: string | null; source: string | null; user_id: string | null }[]) {
      if (b.source === 'manual' || (b.user_id && team.has(b.user_id))) continue
      const x = by.get(b.location_id) || { all: 0, miss: [] }
      x.all++
      if (!b.checked_in_at) x.miss.push({ id: b.id, ref: b.booking_ref, day: b.slot_date })
      by.set(b.location_id, x)
    }
    let n = 0
    for (const [loc, x] of by) {
      if (x.all < 5 || x.miss.length / x.all <= 0.2) continue
      const pct = Math.round((100 * x.miss.length) / x.all)
      const l = locs.get(loc)
      const res = await upsertTask(db, {
        dedupe_key: `qr:${loc}`, rule: 'qr_unscanned', priority: 'high', assignee: GIORGOS, due_at: dueToday, location_id: loc,
        title: `Πρόβλημα QR: ${l?.name || '—'} (${pct}% χωρίς σκανάρισμα)`,
        details: `${x.miss.length} από ${x.all} κρατήσεις των τελευταίων 7 ημερών δεν σκαναρίστηκαν.${l?.phone ? `\n📞 ${l.phone}` : ''}\nΡώτα: ήρθαν; δουλεύει ο scanner; Ό,τι δεν ήρθε → no-show.`,
        items: x.miss.map(m => ({ key: m.id, label: m.ref, sub: m.day.split('-').reverse().slice(0, 2).join('/') })),
      })
      if (res === 'created') n++
    }
    return n
  })

  // P1 · Νέο lead → πρώτη επικοινωνία σε 2 ώρες
  await run('new_lead', async () => {
    const { data } = await db.from('applications').select('id, business_name, owner_name, phone, created_at, stage, wash_type').in('stage', ['new', 'self_onboarding']).is('location_id', null)
    let n = 0
    for (const a of (data || []) as { id: string; business_name: string; owner_name: string; phone: string; created_at: string; stage: string; wash_type: string }[]) {
      const res = await upsertTask(db, {
        dedupe_key: `lead_new:${a.id}`, rule: 'new_lead', priority: 'high', assignee: GIORGOS, application_id: a.id,
        due_at: new Date(new Date(a.created_at).getTime() + 2 * 3600e3).toISOString(),
        title: a.stage === 'self_onboarding' ? `Στείλε συμφωνητικό: ${a.business_name}` : `Πρώτη επικοινωνία: ${a.business_name}`,
        details: [a.owner_name, a.phone ? `📞 ${a.phone}` : '', a.wash_type ? `Πηγή: ${a.wash_type}` : ''].filter(Boolean).join('\n'),
        items: a.phone ? [{ key: 'call', label: a.owner_name || a.business_name, phone: a.phone }] : [],
      })
      if (res === 'created') n++
    }
    // Κλείνει μόνο του όταν το lead φύγει από «Νέο» (έγινε η επαφή / στάλθηκε συμφωνητικό)
    const open = (data || []).map(a => `lead_new:${(a as { id: string }).id}`)
    const { data: stale } = await db.from('ops_tasks').select('id, dedupe_key').eq('rule', 'new_lead').neq('status', 'done')
    for (const t of (stale || []) as { id: string; dedupe_key: string }[]) {
      if (!open.includes(t.dedupe_key)) await db.from('ops_tasks').update({ status: 'done', outcome: 'resolved', done_at: new Date().toISOString(), log: [{ at: new Date().toISOString(), by: 'auto', text: 'Έκλεισε αυτόματα: το lead προχώρησε.' }] }).eq('id', t.id)
    }
    return n
  })

  // P1 · Lead χωρίς επόμενη ενέργεια (follow-up χωρίς ημερομηνία ή ληγμένο >1 μέρα)
  await run('lead_no_next', async () => {
    const { data } = await db.from('applications').select('id, business_name, owner_name, phone, stage, followup_at').in('stage', ['followup', 'no_answer', 'answered']).is('location_id', null)
    const cut = Date.now() - 864e5
    let n = 0
    for (const a of (data || []) as { id: string; business_name: string; owner_name: string; phone: string; stage: string; followup_at: string | null }[]) {
      const missing = !a.followup_at || new Date(a.followup_at).getTime() < cut
      const key = `lead_next:${a.id}`
      if (!missing) {
        await db.from('ops_tasks').update({ status: 'done', outcome: 'resolved', done_at: new Date().toISOString() }).eq('dedupe_key', key).neq('status', 'done')
        continue
      }
      const res = await upsertTask(db, {
        dedupe_key: key, rule: 'lead_no_next', priority: 'normal', assignee: GIORGOS, application_id: a.id, due_at: dueToday,
        title: `Lead χωρίς επόμενη ενέργεια: ${a.business_name}`,
        details: [a.followup_at ? `Το follow-up έληξε ${new Date(a.followup_at).toLocaleDateString('el-GR', { timeZone: 'Europe/Athens' })}.` : 'Δεν έχει ημερομηνία επόμενης επαφής.', a.phone ? `📞 ${a.phone}` : '', 'Κάλεσε ή βάλε νέα ημερομηνία στις Αιτήσεις.'].filter(Boolean).join('\n'),
        items: a.phone ? [{ key: 'call', label: a.owner_name || a.business_name, phone: a.phone }] : [],
      })
      if (res === 'created') n++
    }
    return n
  })

  // P1 · Κάθε πρωί (από 08:00): ΜΙΑ λίστα κλήσεων για όσους έκλεισαν ραντεβού χθες
  await run('yesterday_calls', async () => {
    if (hour < 8) return 'later'
    const from = athensTodayAt(0, -1), to = athensTodayAt(0, 0)
    const { data } = await db.from('bookings').select('id, booking_ref, user_id, location_id, slot_date, status, source, total_amount')
      .gte('created_at', from).lt('created_at', to).neq('status', 'cancelled')
    const rows = ((data || []) as { id: string; booking_ref: string; user_id: string | null; location_id: string; slot_date: string; source: string | null; total_amount: number }[])
      .filter(b => b.source !== 'manual' && !(b.user_id && team.has(b.user_id)))
    if (!rows.length) return 0
    const pr = await profiles(rows.map(r => r.user_id || ''))
    const items: TaskItem[] = rows.map(b => {
      const p = b.user_id ? pr.get(b.user_id) : undefined
      return { key: b.id, label: `${p?.full_name || 'Πελάτης'} · ${locs.get(b.location_id)?.name || ''}`, sub: `${b.booking_ref} · ${b.slot_date.split('-').reverse().slice(0, 2).join('/')} · ${b.total_amount}€`, phone: p?.phone || undefined }
    })
    const r = await upsertTask(db, {
      dedupe_key: `calls:${yesterday}`, rule: 'yesterday_calls', priority: 'normal', assignee: GIORGOS, due_at: athensTodayAt(13),
      title: `Κλήσεις χθεσινών πελατών (${items.length})`,
      details: 'Σύντομη κλήση: πώς ήταν η εμπειρία; Πρόβλημα → «+ Υποεργασία» για ξεχωριστό task.', items,
    })
    return r
  })

  // P2 · Ακύρωση από πλυντήριο (τελευταίες 24 ώρες)
  await run('washer_cancel', async () => {
    const { data } = await db.from('bookings').select('id, booking_ref, location_id, slot_date, cancelled_at').eq('status', 'cancelled').eq('cancelled_by', 'partner')
      .gte('cancelled_at', new Date(Date.now() - 864e5).toISOString())
    let n = 0
    for (const b of (data || []) as { id: string; booking_ref: string; location_id: string; slot_date: string }[]) {
      const l = locs.get(b.location_id)
      const r = await upsertTask(db, {
        dedupe_key: `wcancel:${b.location_id}:${today}`, rule: 'washer_cancel', priority: 'normal', assignee: GIORGOS, due_at: dueToday, location_id: b.location_id,
        title: `Ακύρωση από πλυντήριο: ${l?.name || '—'}`, details: `Μάθε γιατί ακύρωσε.${l?.phone ? `\n📞 ${l.phone}` : ''}`,
        items: [{ key: b.id, label: b.booking_ref, sub: b.slot_date.split('-').reverse().slice(0, 2).join('/') }],
      })
      if (r === 'created') n++
    }
    return n
  })

  // P2 · Ενεργό πλυντήριο (>14 μέρες στο Washio) χωρίς καμία κράτηση 7 μέρες — μία φορά τη Δευτέρα
  await run('washer_idle', async () => {
    const dow = new Date().toLocaleDateString('en-US', { timeZone: 'Europe/Athens', weekday: 'short' })
    if (dow !== 'Mon' || hour < 9) return 'not monday'
    const { data } = await db.from('bookings').select('location_id').gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString())
    const busy = new Set(((data || []) as { location_id: string }[]).map(b => b.location_id))
    let n = 0
    for (const [id, l] of locs) {
      if (!l.is_active || busy.has(id) || Date.now() - new Date(l.created_at).getTime() < 14 * 864e5) continue
      const r = await upsertTask(db, {
        dedupe_key: `idle:${id}`, rule: 'washer_idle', priority: 'low', assignee: GIORGOS, due_at: athensTodayAt(18), location_id: id,
        title: `0 κρατήσεις 7 μέρες: ${l.name}`, details: `Έλεγξε ωράριο, τιμές, φωτογραφίες· ρώτα αν όλα καλά.${l.phone ? `\n📞 ${l.phone}` : ''}`,
      })
      if (r === 'created') n++
    }
    return n
  })

  // P2 · Checkout: ≥3 «πληρωμή» χωρίς κράτηση σήμερα → τεχνικός έλεγχος (Προκόπης)
  await run('pay_abandon', async () => {
    const since = athensTodayAt(0)
    const { data } = await db.from('funnel_events').select('step, device_id, session_id, created_at, meta').in('step', ['pay_click', 'booked']).gte('created_at', since)
    const ev = (data || []) as { step: string; device_id: string | null; session_id: string | null; created_at: string; meta: { method?: string } | null }[]
    const booked = new Set(ev.filter(e => e.step === 'booked').map(e => e.device_id || e.session_id))
    const lost = new Map<string, string>()
    for (const e of ev) if (e.step === 'pay_click' && !booked.has(e.device_id || e.session_id) && Date.now() - new Date(e.created_at).getTime() > 20 * 60e3) lost.set(String(e.device_id || e.session_id), e.meta?.method || '')
    if (lost.size < 3) return lost.size
    return upsertTask(db, {
      dedupe_key: `payab:${today}`, rule: 'pay_abandon', priority: 'high', assignee: PROKOPIS, due_at: dueToday,
      title: `Checkout: ${lost.size} πάτησαν «πληρωμή» χωρίς κράτηση σήμερα`,
      details: `Κάρτα: ${[...lost.values()].filter(m => m === 'card').length} · Μετρητά: ${[...lost.values()].filter(m => m === 'cash').length}\nΈλεγξε Stripe (Incomplete), checkout, τελευταίες αλλαγές.`,
    })
  })

  // Κλιμάκωση: υψηλή εργασία του Γιώργου χωρίς ανάληψη 4 ώρες → και στον Προκόπη
  await run('escalation', async () => {
    const { data } = await db.from('ops_tasks').select('id').eq('priority', 'high').eq('status', 'todo').is('claimed_at', null).is('escalated_at', null)
      .neq('assignee', PROKOPIS).lt('created_at', new Date(Date.now() - 4 * 3600e3).toISOString())
    const ids = ((data || []) as { id: string }[]).map(t => t.id)
    if (ids.length) await db.from('ops_tasks').update({ escalated_at: new Date().toISOString() }).in('id', ids)
    return ids.length
  })

  // Πρωινή σύνοψη (09:00–09:59, μία φορά τη μέρα): push σε κάθε μέλος
  await run('digest', async () => {
    if (hour !== 9) return 'not 9'
    const { data: st } = await db.from('app_settings').select('value').eq('key', 'ops_digest_last').maybeSingle()
    if ((st?.value as { day?: string } | null)?.day === today) return 'sent'
    await db.from('app_settings').upsert({ key: 'ops_digest_last', value: { day: today } }, { onConflict: 'key' })
    const { data: open } = await db.from('ops_tasks').select('assignee, priority, due_at').neq('status', 'done')
    const end = athensTodayAt(0, 1)
    const ids: Record<string, string> = {}
    for (let page = 1; page <= 20; page++) {
      const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 })
      for (const u of data?.users || []) if (u.email && [PROKOPIS, GIORGOS].includes(u.email.toLowerCase())) ids[u.email.toLowerCase()] = u.id
      if (!data || data.users.length < 1000) break
    }
    for (const who of [PROKOPIS, GIORGOS]) {
      const mine = ((open || []) as { assignee: string; priority: string; due_at: string | null }[]).filter(t => t.assignee === who && (!t.due_at || t.due_at < end))
      if (!mine.length || !ids[who]) continue
      const hi = mine.filter(t => t.priority === 'high').length
      await sendPush(ids[who], { title: `Σήμερα: ${mine.length} εργασίες`, body: hi ? `${hi} υψηλής προτεραιότητας. Άνοιξε τη λίστα σου.` : 'Άνοιξε τη λίστα σου.', url: '/admin?tab=ops' })
    }
    return 'ok'
  })

  return NextResponse.json({ ok: true, ...out })
}
