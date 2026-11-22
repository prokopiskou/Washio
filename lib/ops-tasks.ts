import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// CRM & Operations — εργασίες ομάδας (πίνακας ops_tasks — supabase/ops_tasks.sql)
// Κανόνας: κανένα lead χωρίς επόμενη ενέργεια, κανένα σοβαρό πρόβλημα χωρίς υπεύθυνο.
// Ένα ΑΝΟΙΧΤΟ task ανά dedupe_key: ίδιο πρόβλημα ξανά → ενημερώνεται το ίδιο task (items), όχι νέο.
// ============================================================

export const PROKOPIS = 'withinsuccess@gmail.com'
export const GIORGOS = 'giwrgos2070@gmail.com'
export const TEAM: { email: string; name: string; role: string }[] = [
  { email: PROKOPIS, name: 'Προκόπης', role: 'Product & Technology' },
  { email: GIORGOS, name: 'Γιώργος', role: 'Sales & Customer Success' },
]
export const nameOf = (email?: string | null) => TEAM.find(t => t.email === (email || '').toLowerCase())?.name || (email || '').split('@')[0]

export type TaskItem = { key: string; label: string; sub?: string; phone?: string; done?: boolean }
export type TaskLog = { at: string; by: string; text: string }
export type OpsTask = {
  id: string; created_at: string; updated_at: string; title: string; details: string | null
  assignee: string; created_by: string; source: 'manual' | 'auto'; rule: string | null
  priority: 'high' | 'normal' | 'low'; status: 'todo' | 'in_progress' | 'blocked' | 'done'; outcome: string | null
  due_at: string | null; claimed_at: string | null; done_at: string | null; escalated_at: string | null
  dedupe_key: string | null; parent_id: string | null
  application_id: string | null; location_id: string | null; booking_id: string | null; review_id: string | null
  items: TaskItem[]; log: TaskLog[]
}

export const RULES: { key: string; p: 'P1' | 'P2' | 'P3'; trigger: string; action: string; who: string }[] = [
  { key: 'review_low', p: 'P1', trigger: 'Αξιολόγηση ≤3★', action: 'Κάλεσε τον πελάτη, μάθε τι έγινε', who: 'Γιώργος' },
  { key: 'qr_unscanned', p: 'P1', trigger: 'Πλυντήριο >20% μη σκαναρισμένες (χθες με ≥2 ραντεβού ή 7 μέρες με ≥5)', action: 'Επικοινωνία με το πλυντήριο', who: 'Προκόπης' },
  { key: 'new_lead', p: 'P1', trigger: 'Νέο lead πλυντηρίου', action: 'Πρώτη επικοινωνία μέσα σε 2 ώρες', who: 'Γιώργος' },
  { key: 'yesterday_calls', p: 'P1', trigger: 'Κρατήσεις χθες (κάθε πρωί)', action: 'Μία λίστα κλήσεων με ✓ ανά πελάτη', who: 'Γιώργος' },
  { key: 'lead_no_next', p: 'P1', trigger: 'Lead χωρίς επόμενη ενέργεια ή με ληγμένο follow-up', action: 'Προγραμμάτισε επαφή', who: 'Γιώργος' },
  { key: 'washer_cancel', p: 'P2', trigger: 'Ακύρωση από πλυντήριο', action: 'Μάθε την αιτία', who: 'Γιώργος' },
  { key: 'washer_idle', p: 'P2', trigger: 'Ενεργό πλυντήριο χωρίς κρατήσεις 7 μέρες', action: 'Έλεγχος διαθεσιμότητας / κλήση', who: 'Γιώργος' },
  { key: 'pay_abandon', p: 'P2', trigger: '≥3 πατήματα «πληρωμή» χωρίς κράτηση σε μία μέρα', action: 'Έλεγχος checkout / Stripe', who: 'Προκόπης' },
  { key: 'escalation', p: 'P1', trigger: 'Υψηλή εργασία χωρίς ανάληψη 4 ώρες', action: 'Εμφανίζεται και στον Προκόπη', who: 'Προκόπης' },
]

/** Νέο task ή ενημέρωση του ανοιχτού με το ίδιο dedupe_key (συγχώνευση items). */
export async function upsertTask(db: SupabaseClient, t: Partial<OpsTask> & { title: string; assignee: string; dedupe_key?: string | null }): Promise<'created' | 'updated' | 'skip'> {
  if (t.dedupe_key) {
    const { data: ex } = await db.from('ops_tasks').select('id, items, details').eq('dedupe_key', t.dedupe_key).neq('status', 'done').maybeSingle()
    if (ex) {
      const old = (ex.items || []) as TaskItem[]
      const add = (t.items || []).filter(i => !old.some(o => o.key === i.key))
      if (!add.length && (t.details ?? ex.details) === ex.details) return 'skip'
      await db.from('ops_tasks').update({ items: [...old, ...add], details: t.details ?? ex.details, title: t.title, updated_at: new Date().toISOString() }).eq('id', ex.id)
      return 'updated'
    }
  }
  const { error } = await db.from('ops_tasks').insert({ source: 'auto', created_by: 'auto', priority: 'normal', ...t, items: t.items || [], log: t.log || [] })
  if (error && /duplicate/i.test(error.message)) return 'skip'
  return error ? 'skip' : 'created'
}

/** Ημερομηνία Ελλάδας YYYY-MM-DD (offset ημέρες). */
export function athensDay(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 864e5)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
export function athensHour(): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
}
/** Σήμερα στις HH:00 ώρα Ελλάδας → ISO. */
export function athensTodayAt(h: number, offsetDays = 0): string {
  const day = athensDay(offsetDays)
  const naive = new Date(`${day}T${String(h).padStart(2, '0')}:00:00Z`)
  const asAth = new Date(naive.toLocaleString('en-US', { timeZone: 'Europe/Athens' }))
  const asUtc = new Date(naive.toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(naive.getTime() + (asUtc.getTime() - asAth.getTime())).toISOString()
}
