'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApplicationsPipeline } from '@/components/admin/ApplicationsPipeline'
import { TEAM, RULES, nameOf, type OpsTask } from '@/lib/ops-tasks'

// Admin → CRM & Operations
// Κανένα lead χωρίς επόμενη ενέργεια, κανένα σοβαρό πρόβλημα χωρίς υπεύθυνο.
/* eslint-disable @typescript-eslint/no-explicit-any -- γραμμές applications από τον admin (dynamic) */

type View = 'overview' | 'leads' | 'tasks' | 'automations'
const PRI: Record<string, { l: string; c: string }> = {
  high: { l: 'Υψηλή', c: 'bg-red-50 text-red-700 border-red-200' },
  normal: { l: 'Κανονική', c: 'bg-gray-50 text-gray-600 border-gray-200' },
  low: { l: 'Χαμηλή', c: 'bg-gray-50 text-gray-400 border-gray-200' },
}
const ST: Record<string, string> = { todo: 'To Do', in_progress: 'In Progress', blocked: 'Blocked', done: 'Done' }
const fmtDue = (iso: string | null) => iso ? new Date(iso).toLocaleString('el-GR', { timeZone: 'Europe/Athens', weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const toLocal = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}` }

export function OpsPanel({ applications, reloadApplications }: { applications: any[]; reloadApplications: () => void }) {
  const [view, setView] = useState<View>('overview')
  const [tasks, setTasks] = useState<OpsTask[]>([])
  const [me, setMe] = useState('')
  const [stats, setStats] = useState<{ activeLeads: number; followups: number; endOfToday: string } | null>(null)
  const [who, setWho] = useState<'all' | 'me' | string>('all')
  const [showDone, setShowDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [nowIso, setNowIso] = useState('')

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/tasks', { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    setLoading(false)
    if (!r.ok) { setErr(j.error || 'Σφάλμα'); return }
    setTasks(j.tasks || []); setMe(j.me || ''); setStats(j.stats || null); setNowIso(new Date().toISOString())
  }, [])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const post = async (body: Record<string, unknown>) => {
    const r = await fetch('/api/admin/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { alert(j.error || 'Σφάλμα'); return false }
    await load(); return true
  }

  // «Εγώ» = ΜΟΝΟ όσα έχουν ανατεθεί σε μένα · «Όλοι» = όλα · όνομα = μόνο εκείνου.
  const mineFilter = (t: OpsTask) => who === 'all' ? true : who === 'me' ? t.assignee === me : t.assignee === who
  // Οι μετρητές της Επισκόπησης ακολουθούν το φίλτρο (Όλοι / Εγώ / Γιώργος).
  const open = useMemo(() => tasks.filter(t => t.status !== 'done').filter(t => who === 'all' ? true : who === 'me' ? t.assignee === me : t.assignee === who), [tasks, who, me])
  const end = stats?.endOfToday || ''
  const todayList = open.filter(mineFilter).filter(t => !t.due_at || t.due_at < end)
    .sort((a, b) => (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1) || String(a.due_at || '').localeCompare(String(b.due_at || '')))
  const attention = open.filter(t => t.priority === 'high' || (t.due_at && t.due_at < nowIso) || t.escalated_at || t.status === 'blocked').length

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {([['overview', 'Επισκόπηση'], ['leads', 'Leads'], ['tasks', 'Tasks'], ['automations', 'Automations']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} className={`shrink-0 px-3 h-8 rounded-full text-[12px] font-semibold border ${view === k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>{l}</button>
        ))}
      </div>
      {err && <p className="text-[13px] text-red-600">{err}{/ops_tasks/.test(err) ? ' — τρέξε το supabase/ops_tasks.sql' : ''}</p>}

      {view === 'overview' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {[
            ['Ενεργά leads', stats?.activeLeads ?? '—', 'Προς επικοινωνία'],
            ['Εργασίες σήμερα', open.filter(t => !t.due_at || t.due_at < end).length, `${open.filter(t => t.priority === 'high').length} υψηλής προτερ.`],
            ['Follow-ups', stats?.followups ?? '—', 'Προγραμματισμένα'],
            ['Χρειάζονται προσοχή', attention, 'Ληγμένα / blocked / κλιμάκωση'],
          ].map(([l, v, s]) => (
            <div key={String(l)} className="rounded-2xl border border-gray-200 bg-white p-3.5">
              <p className="text-[11px] font-semibold text-gray-500">{l}</p>
              <p className="text-[24px] font-bold text-gray-900 leading-tight mt-0.5">{v}</p>
              <p className="text-[11px] text-gray-400">{s}</p>
            </div>
          ))}
        </div>
      )}

      {(view === 'overview' || view === 'tasks') && (
        <>
          <div className="flex items-center gap-1.5 flex-wrap">
            {([['all', 'Όλοι'], ['me', 'Εγώ'], ...TEAM.filter(t => t.email !== me).map(t => [t.email, t.name])] as [string, string][]).map(([k, l]) => (
              <button key={k} onClick={() => setWho(k)} className={`px-3 h-8 rounded-lg text-[12px] font-semibold border ${who === k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>{l}</button>
            ))}
            {view === 'tasks' && (
              <button onClick={() => setShowDone(s => !s)} className="ml-auto px-3 h-8 rounded-lg text-[12px] font-semibold border bg-white text-gray-600 border-gray-200">{showDone ? 'Μόνο εκκρεμείς' : 'Και ολοκληρωμένες'}</button>
            )}
          </div>
          <NewTask me={me} onCreate={b => post({ action: 'create', ...b })} />
          {loading && <p className="text-[13px] text-gray-400 py-4 text-center">Φόρτωση…</p>}
          {!loading && (() => {
            const list = view === 'overview' ? todayList
              : tasks.filter(mineFilter).filter(t => showDone || t.status !== 'done').sort((a, b) => (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0) || String(a.due_at || 'z').localeCompare(String(b.due_at || 'z')))
            if (!list.length) return <p className="text-[13px] text-gray-400 py-6 text-center">{view === 'overview' ? 'Τίποτα για σήμερα 🎉' : 'Καμία εργασία.'}</p>
            return <div className="space-y-2">{list.map(t => <TaskRow key={t.id} t={t} me={me} tasks={tasks} nowIso={nowIso} post={post} />)}</div>
          })()}
        </>
      )}

      {view === 'leads' && (
        <div className="space-y-2">
          <p className="text-[12px] text-gray-500">Κανένα lead χωρίς επόμενη ενέργεια: όσα δεν έχουν ημερομηνία επαφής γίνονται αυτόματα εργασία του Γιώργου.</p>
          <ApplicationsPipeline applications={applications} reload={reloadApplications} />
        </div>
      )}

      {view === 'automations' && (
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          {RULES.map(r => {
            const n = tasks.filter(t => t.rule === r.key).length
            return (
              <div key={r.key} className="flex items-start gap-3 px-4 py-3 border-b border-gray-100 last:border-0">
                <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${r.p === 'P1' ? 'bg-red-50 text-red-700' : r.p === 'P2' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{r.p}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-gray-900">{r.trigger}</p>
                  <p className="text-[12px] text-gray-500">→ {r.action} · {r.who}</p>
                </div>
                <span className="shrink-0 text-[11px] text-gray-400">{n} (7 μ.)</span>
              </div>
            )
          })}
          <p className="text-[11px] text-gray-400 px-4 py-2.5">Τρέχουν κάθε 30′ (07:00–23:00). Ένα ανοιχτό task ανά πρόβλημα — όχι διπλά. Πρωινή σύνοψη με push στις 09:00.</p>
        </div>
      )}
    </div>
  )
}

function NewTask({ me, onCreate }: { me: string; onCreate: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ title: '', assignee: '', priority: 'normal', due: '', details: '' })
  if (!open) return <button onClick={() => { setF(x => ({ ...x, assignee: TEAM.find(t => t.email !== me)?.email || me })); setOpen(true) }} className="w-full h-10 rounded-xl border border-dashed border-gray-300 text-[13px] font-semibold text-gray-600">+ Νέα εργασία</button>
  const inp = 'w-full h-10 px-3 rounded-lg border border-gray-200 text-[14px] bg-white'
  return (
    <div className="rounded-2xl border-2 border-gray-900 bg-white p-3.5 space-y-2">
      <input className={inp} placeholder="Τίτλος εργασίας" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
      <div className="grid grid-cols-3 gap-2">
        <select className={inp} value={f.assignee} onChange={e => setF({ ...f, assignee: e.target.value })}>
          {TEAM.map(t => <option key={t.email} value={t.email}>{t.email === me ? `${t.name} (εγώ)` : t.name}</option>)}
        </select>
        <select className={inp} value={f.priority} onChange={e => setF({ ...f, priority: e.target.value })}>
          <option value="high">Υψηλή</option><option value="normal">Κανονική</option><option value="low">Χαμηλή</option>
        </select>
        <input type="datetime-local" className={inp} value={f.due} onChange={e => setF({ ...f, due: e.target.value })} />
      </div>
      <textarea className="w-full min-h-[56px] px-3 py-2 rounded-lg border border-gray-200 text-[14px]" placeholder="Σημειώσεις / οδηγίες" value={f.details} onChange={e => setF({ ...f, details: e.target.value })} />
      <div className="flex gap-2">
        <button onClick={() => setOpen(false)} className="h-10 px-4 rounded-lg border border-gray-200 text-[13px] font-semibold text-gray-600">Άκυρο</button>
        <button disabled={f.title.trim().length < 3} onClick={async () => { if (await onCreate({ title: f.title, assignee: f.assignee, priority: f.priority, due_at: f.due ? new Date(f.due).toISOString() : null, details: f.details })) { setF({ title: '', assignee: '', priority: 'normal', due: '', details: '' }); setOpen(false) } }}
          className="flex-1 h-10 rounded-lg bg-gray-900 text-white text-[13px] font-semibold disabled:opacity-40">Αποθήκευση</button>
      </div>
    </div>
  )
}

function TaskRow({ t, me, tasks, nowIso, post }: { t: OpsTask; me: string; tasks: OpsTask[]; nowIso: string; post: (b: Record<string, unknown>) => Promise<boolean> }) {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [note, setNote] = useState('')
  const [next, setNext] = useState('')
  const overdue = t.status !== 'done' && t.due_at && t.due_at < nowIso
  const children = tasks.filter(c => c.parent_id === t.id)
  const parent = t.parent_id ? tasks.find(p => p.id === t.parent_id) : null
  const itemsDone = (t.items || []).filter(i => i.done).length
  const btn = 'h-9 px-3 rounded-lg text-[12px] font-semibold border'
  return (
    <div className={`rounded-2xl border bg-white ${t.status === 'done' ? 'border-gray-100 opacity-60' : overdue || t.escalated_at ? 'border-red-200' : 'border-gray-200'}`}>
      <div className="flex items-start gap-3 p-3.5">
        <button aria-label="Ολοκλήρωση" onClick={() => t.status === 'done' ? post({ action: 'status', id: t.id, status: 'todo' }) : setClosing(c => !c)}
          className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border-2 ${t.status === 'done' ? 'bg-gray-900 border-gray-900' : 'border-gray-300'}`} />
        <button onClick={() => setOpen(o => !o)} className="min-w-0 flex-1 text-left">
          <p className={`text-[14px] font-semibold text-gray-900 ${t.status === 'done' ? 'line-through' : ''}`}>{t.title}</p>
          <p className="text-[12px] text-gray-500 mt-0.5 line-clamp-1">{(t.details || '').split('\n')[0]}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${PRI[t.priority]?.c}`}>{PRI[t.priority]?.l}</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{nameOf(t.assignee)}</span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-gray-50 text-gray-500">{t.source === 'auto' ? 'Αυτόματο' : 'Χειροκίνητο'}</span>
            {t.status !== 'todo' && t.status !== 'done' && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${t.status === 'blocked' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>{ST[t.status]}</span>}
            {t.escalated_at && t.status !== 'done' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white">Κλιμάκωση</span>}
            {t.items?.length > 0 && <span className="text-[10px] font-semibold text-gray-500">{itemsDone}/{t.items.length}</span>}
            <span className={`text-[10px] font-semibold ${overdue ? 'text-red-600' : 'text-gray-400'}`}>{overdue ? 'Έληξε · ' : ''}{fmtDue(t.due_at)}</span>
          </div>
        </button>
      </div>

      {closing && t.status !== 'done' && (
        <div className="px-3.5 pb-3.5 space-y-2">
          <p className="text-[11px] font-semibold text-gray-500">Τι έγινε;</p>
          <div className="grid grid-cols-2 gap-1.5">
            <button className={btn + ' bg-green-600 text-white border-green-600'} onClick={() => post({ action: 'outcome', id: t.id, outcome: 'resolved' })}>✓ Επιλύθηκε</button>
            <button className={btn + ' bg-white text-gray-700 border-gray-200'} onClick={() => post({ action: 'outcome', id: t.id, outcome: 'no_answer', next_at: next ? new Date(next).toISOString() : null })}>📵 Δεν απάντησε → ξανά</button>
            <button className={btn + ' bg-white text-gray-700 border-gray-200'} onClick={() => { const x = prompt('Τι χρειάζεται από την εφαρμογή;') ?? ''; if (x.trim()) post({ action: 'outcome', id: t.id, outcome: 'needs_tech', text: x }) }}>🛠 Χρειάζεται τεχνικό</button>
            <button className={btn + ' bg-white text-gray-700 border-gray-200'} onClick={() => post({ action: 'outcome', id: t.id, outcome: 'waiting' })}>⏳ Αναμονή τρίτου</button>
          </div>
          <label className="block text-[11px] text-gray-500">Επόμενη προσπάθεια (προαιρετικό — αλλιώς αύριο 11:00)
            <input type="datetime-local" value={next} onChange={e => setNext(e.target.value)} className="mt-1 w-full h-9 px-2.5 rounded-lg border border-gray-200 text-[13px]" />
          </label>
        </div>
      )}

      {open && (
        <div className="px-3.5 pb-3.5 space-y-2.5 border-t border-gray-100 pt-3">
          {parent && <p className="text-[12px] text-gray-500">Υποεργασία του: <b>{parent.title}</b></p>}
          {t.details && <p className="text-[13px] text-gray-700 whitespace-pre-line">{t.details}</p>}
          {t.items?.length > 0 && (
            <div className="rounded-xl border border-gray-100 divide-y divide-gray-100">
              {t.items.map(i => (
                <div key={i.key} className="flex items-center gap-2.5 px-3 py-2">
                  <input type="checkbox" checked={!!i.done} onChange={e => post({ action: 'item', id: t.id, key: i.key, done: e.target.checked })} className="w-4 h-4" />
                  <div className="min-w-0 flex-1">
                    <p className={`text-[13px] text-gray-800 truncate ${i.done ? 'line-through text-gray-400' : ''}`}>{i.label}</p>
                    {i.sub && <p className="text-[11px] text-gray-400">{i.sub}</p>}
                  </div>
                  {i.phone && <a href={`tel:${i.phone}`} className="shrink-0 text-[12px] font-semibold text-blue-700">📞 Κλήση</a>}
                </div>
              ))}
            </div>
          )}
          {children.length > 0 && (
            <div className="text-[12px] text-gray-600">Υποεργασίες: {children.map(c => <span key={c.id} className="mr-2">{c.status === 'done' ? '✓' : '•'} {c.title} ({nameOf(c.assignee)})</span>)}</div>
          )}
          <div className="flex flex-wrap gap-1.5">
            {(['todo', 'in_progress', 'blocked'] as const).map(s => (
              <button key={s} onClick={() => post({ action: 'status', id: t.id, status: s })} className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold border ${t.status === s ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}>{ST[s]}</button>
            ))}
            {TEAM.filter(m => m.email !== t.assignee).map(m => (
              <button key={m.email} onClick={() => post({ action: 'assign', id: t.id, assignee: m.email })} className="h-8 px-2.5 rounded-lg text-[11px] font-semibold border bg-white text-gray-600 border-gray-200">→ {m.name}</button>
            ))}
            <button onClick={() => { const x = prompt('Υποεργασία (τι χρειάζεται;)'); if (x && x.trim()) post({ action: 'create', title: x, parent_id: t.id, assignee: TEAM.find(m => m.email !== me)?.email || me, priority: t.priority, location_id: t.location_id, application_id: t.application_id }) }}
              className="h-8 px-2.5 rounded-lg text-[11px] font-semibold border bg-white text-gray-600 border-gray-200">+ Υποεργασία</button>
            <input type="datetime-local" defaultValue={toLocal(t.due_at)} onBlur={e => { if (e.target.value && new Date(e.target.value).toISOString() !== t.due_at) post({ action: 'edit', id: t.id, due_at: new Date(e.target.value).toISOString() }) }}
              className="h-8 px-2 rounded-lg border border-gray-200 text-[11px]" />
          </div>
          <div className="flex gap-1.5">
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Σημείωση…" className="flex-1 h-9 px-3 rounded-lg border border-gray-200 text-[13px]" />
            <button disabled={!note.trim()} onClick={async () => { if (await post({ action: 'note', id: t.id, text: note })) setNote('') }} className="h-9 px-3 rounded-lg bg-gray-900 text-white text-[12px] font-semibold disabled:opacity-40">Προσθήκη</button>
          </div>
          {t.log?.length > 0 && (
            <div className="space-y-1">
              {[...t.log].reverse().slice(0, 8).map((l, k) => (
                <p key={k} className="text-[11px] text-gray-500"><span className="text-gray-400">{fmtDue(l.at)} · {l.by === 'auto' ? 'Σύστημα' : nameOf(l.by)}:</span> {l.text}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
