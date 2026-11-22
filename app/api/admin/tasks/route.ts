import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'
import { PROKOPIS, nameOf, athensTodayAt, type OpsTask, type TaskItem } from '@/lib/ops-tasks'

// Admin → CRM & Operations: εργασίες ομάδας.
//   GET  → { me, tasks (ανοιχτές + κλεισμένες 7 ημερών), stats }
//   POST { action, ... }
//     create  { title, assignee, priority, due_at, details, parent_id?, location_id?, application_id? }
//     status  { id, status }                              (todo | in_progress | blocked | done)
//     outcome { id, outcome, next_at? }                   resolved → done · no_answer → ξανά (next_at ή αύριο 11:00)
//                                                         needs_tech → blocked + υποεργασία στον Προκόπη · waiting → blocked
//     assign  { id, assignee } · item { id, key, done } · note { id, text } · edit { id, title?, details?, priority?, due_at? }
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function me() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  return user && isAdminEmail(user.email) ? (user.email as string).toLowerCase() : null
}
const now = () => new Date().toISOString()

export async function GET() {
  const email = await me()
  if (!email) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString()
  const [{ data: open }, { data: done }, { data: apps }] = await Promise.all([
    db.from('ops_tasks').select('*').neq('status', 'done').order('due_at', { ascending: true, nullsFirst: false }).limit(500),
    db.from('ops_tasks').select('*').eq('status', 'done').gte('done_at', weekAgo).order('done_at', { ascending: false }).limit(200),
    db.from('applications').select('id, stage, followup_at, location_id'),
  ])
  const a = (apps || []) as { stage: string; followup_at: string | null; location_id: string | null }[]
  const activeLeads = a.filter(x => !x.location_id && !['done', 'lost', 'onboarding'].includes(x.stage)).length
  const end = athensTodayAt(0, 1)
  const followups = a.filter(x => x.stage === 'followup' && x.followup_at && x.followup_at >= new Date().toISOString()).length
  return NextResponse.json({ me: email, tasks: [...(open || []), ...(done || [])], stats: { activeLeads, followups, endOfToday: end } })
}

export async function POST(req: NextRequest) {
  const email = await me()
  if (!email) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const action = String(b.action || '')
  const id = String(b.id || '')
  const get = async () => {
    const { data } = await db.from('ops_tasks').select('*').eq('id', id).maybeSingle()
    return data as OpsTask | null
  }
  const logged = (t: OpsTask, text: string) => [...(t.log || []), { at: now(), by: email, text }]
  const save = async (patch: Record<string, unknown>) => {
    const { error } = await db.from('ops_tasks').update({ ...patch, updated_at: now() }).eq('id', id)
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }

  if (action === 'create') {
    const title = String(b.title || '').trim()
    if (title.length < 3) return NextResponse.json({ error: 'Γράψε τίτλο' }, { status: 400 })
    const assignee = isAdminEmail(String(b.assignee || '')) ? String(b.assignee).toLowerCase() : email
    const { data, error } = await db.from('ops_tasks').insert({
      title, details: String(b.details || '').trim() || null, assignee, created_by: email, source: 'manual',
      priority: ['high', 'normal', 'low'].includes(String(b.priority)) ? b.priority : 'normal',
      due_at: b.due_at ? new Date(String(b.due_at)).toISOString() : null,
      parent_id: b.parent_id || null, location_id: b.location_id || null, application_id: b.application_id || null,
      log: [{ at: now(), by: email, text: assignee === email ? 'Δημιουργήθηκε' : `Ανατέθηκε στον/στην ${nameOf(assignee)}` }],
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Υποεργασία: η αρχική μένει ανοιχτή, σε «Blocked» μέχρι να κλείσει η υποεργασία.
    if (b.parent_id) {
      const { data: p } = await db.from('ops_tasks').select('*').eq('id', String(b.parent_id)).maybeSingle()
      if (p) await db.from('ops_tasks').update({ status: 'blocked', updated_at: now(), log: [...((p as OpsTask).log || []), { at: now(), by: email, text: `Περιμένει: «${title}» (${nameOf(assignee)})` }] }).eq('id', (p as OpsTask).id)
    }
    return NextResponse.json({ ok: true, id: data.id })
  }

  const t = await get()
  if (!t) return NextResponse.json({ error: 'Δεν βρέθηκε' }, { status: 404 })

  if (action === 'status') {
    const s = String(b.status)
    if (!['todo', 'in_progress', 'blocked', 'done'].includes(s)) return NextResponse.json({ error: 'Λάθος κατάσταση' }, { status: 400 })
    const res = await save({ status: s, claimed_at: t.claimed_at || (s !== 'todo' ? now() : null), done_at: s === 'done' ? now() : null, log: logged(t, `Κατάσταση: ${s}`) })
    if (s === 'done') await unblockParent(t, email)
    return res
  }
  if (action === 'outcome') {
    const o = String(b.outcome)
    if (o === 'resolved') { const r = await save({ status: 'done', outcome: o, done_at: now(), claimed_at: t.claimed_at || now(), log: logged(t, 'Επιλύθηκε') }); await unblockParent(t, email); return r }
    if (o === 'no_answer') {
      const next = b.next_at ? new Date(String(b.next_at)).toISOString() : athensTodayAt(11, 1)
      return save({ status: 'todo', outcome: o, due_at: next, claimed_at: t.claimed_at || now(), log: logged(t, `Δεν απάντησε · ξανά ${new Date(next).toLocaleString('el-GR', { timeZone: 'Europe/Athens', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' })}`) })
    }
    if (o === 'waiting') return save({ status: 'blocked', outcome: o, claimed_at: t.claimed_at || now(), log: logged(t, `Αναμονή τρίτου${b.text ? `: ${b.text}` : ''}`) })
    if (o === 'needs_tech') {
      const what = String(b.text || '').trim() || t.title
      await db.from('ops_tasks').insert({
        title: `Τεχνικό: ${what}`, details: `Από: «${t.title}» (${nameOf(email)})${t.details ? `\n\n${t.details}` : ''}`, assignee: PROKOPIS, created_by: email,
        source: 'manual', priority: t.priority === 'high' ? 'high' : 'normal', parent_id: t.id, location_id: t.location_id, application_id: t.application_id,
        log: [{ at: now(), by: email, text: 'Δημιουργήθηκε από κλήση' }],
      })
      return save({ status: 'blocked', outcome: o, claimed_at: t.claimed_at || now(), log: logged(t, `Χρειάζεται τεχνική υποστήριξη → Προκόπης: ${what}`) })
    }
    return NextResponse.json({ error: 'Λάθος κατάληξη' }, { status: 400 })
  }
  if (action === 'assign') {
    const a = String(b.assignee || '').toLowerCase()
    if (!isAdminEmail(a)) return NextResponse.json({ error: 'Λάθος άτομο' }, { status: 400 })
    return save({ assignee: a, escalated_at: null, log: logged(t, `Ανατέθηκε στον/στην ${nameOf(a)}`) })
  }
  if (action === 'item') {
    const items = (t.items || []).map((i: TaskItem) => i.key === String(b.key) ? { ...i, done: !!b.done } : i)
    const allDone = items.length > 0 && items.every(i => i.done)
    const patch: Record<string, unknown> = { items, claimed_at: t.claimed_at || now(), status: t.status === 'todo' ? 'in_progress' : t.status }
    if (allDone && t.rule === 'yesterday_calls') Object.assign(patch, { status: 'done', outcome: 'resolved', done_at: now(), log: logged(t, 'Όλες οι κλήσεις έγιναν') })
    return save(patch)
  }
  if (action === 'note') {
    const text = String(b.text || '').trim().slice(0, 1000)
    if (!text) return NextResponse.json({ error: 'Κενή σημείωση' }, { status: 400 })
    return save({ log: logged(t, text) })
  }
  if (action === 'edit') {
    const patch: Record<string, unknown> = {}
    if (typeof b.title === 'string' && b.title.trim()) patch.title = b.title.trim()
    if (typeof b.details === 'string') patch.details = b.details.trim() || null
    if (['high', 'normal', 'low'].includes(String(b.priority))) patch.priority = b.priority
    if (b.due_at !== undefined) patch.due_at = b.due_at ? new Date(String(b.due_at)).toISOString() : null
    return save({ ...patch, log: logged(t, 'Επεξεργασία') })
  }
  return NextResponse.json({ error: 'Άγνωστη ενέργεια' }, { status: 400 })
}

// Όταν κλείσει υποεργασία → η αρχική ξαναγίνεται «To Do» (αν δεν έχει άλλες ανοιχτές υποεργασίες).
async function unblockParent(t: OpsTask, by: string) {
  if (!t.parent_id) return
  const { data: siblings } = await db.from('ops_tasks').select('id').eq('parent_id', t.parent_id).neq('status', 'done').neq('id', t.id)
  if ((siblings || []).length) return
  const { data: p } = await db.from('ops_tasks').select('*').eq('id', t.parent_id).maybeSingle()
  if (p && (p as OpsTask).status === 'blocked') {
    await db.from('ops_tasks').update({ status: 'todo', updated_at: now(), log: [...((p as OpsTask).log || []), { at: now(), by, text: `Ολοκληρώθηκε: «${t.title}» → συνέχισε` }] }).eq('id', (p as OpsTask).id)
  }
}
