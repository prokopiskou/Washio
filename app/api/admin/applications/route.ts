import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'
import { activateOnboarding } from '@/lib/onboarding-activate'

// Admin → Αιτήσεις: στάδια διαδικασίας για αιτήσεις πλυντηρίων (apply / Meta leads).
//  POST { id, action, ... }
//   answered            → σήκωσε (stage=answered)
//   no_answer           → δεν σήκωσε (+1 προσπάθεια)
//   followup {at}       → follow-up σε ημερομηνία/ώρα (email 15' πριν σε όποιον το όρισε)
//   to_onboarding       → πάει στο στάδιο onboarding
//   onboard {afm, doy, address?, iban?, ibanHolder?} → «Onboarding κομπλέ»: δημιουργεί onboarding + πρατήριο (ανενεργό)
//   lost / reopen       → δεν ενδιαφέρεται / ξανά νέα
//   note {text}         → σημειώσεις
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function requireAdmin() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  return user && isAdminEmail(user.email) ? user : null
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as {
    id?: string; action?: string; at?: string; afm?: string; doy?: string; address?: string; iban?: string; ibanHolder?: string; text?: string
  }
  const { data: app } = await admin.from('applications').select('*').eq('id', b.id || '').maybeSingle()
  if (!app) return NextResponse.json({ error: 'Η αίτηση δεν βρέθηκε' }, { status: 404 })
  const now = new Date().toISOString()
  const set = async (patch: Record<string, unknown>) => {
    const { error } = await admin.from('applications').update({ ...patch, stage_updated_at: now }).eq('id', app.id)
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }

  switch (b.action) {
    case 'answered':
      return set({ stage: 'answered', call_attempts: (app.call_attempts || 0) + 1, last_call_at: now, last_call_by: user.email })
    case 'no_answer':
      return set({ stage: 'no_answer', call_attempts: (app.call_attempts || 0) + 1, last_call_at: now, last_call_by: user.email })
    case 'followup': {
      const at = b.at ? new Date(b.at) : null
      if (!at || isNaN(at.getTime())) return NextResponse.json({ error: 'Λάθος ημερομηνία' }, { status: 400 })
      return set({ stage: 'followup', followup_at: at.toISOString(), followup_by: user.email, followup_notified_at: null })
    }
    case 'to_onboarding':
      return set({ stage: 'onboarding' })
    case 'lost':
      return set({ stage: 'lost', status: 'rejected' })
    case 'reopen':
      return set({ stage: 'new', status: 'pending' })
    case 'delete': {
      const { error } = await admin.from('applications').delete().eq('id', app.id)
      return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
    }
    case 'note':
      return set({ pipeline_notes: String(b.text || '').slice(0, 2000) })
    case 'onboard': {
      const afm = String(b.afm || '').replace(/\D/g, '')
      const doy = String(b.doy || '').trim()
      const address = String(b.address || app.address || '').trim()
      if (afm.length !== 9) return NextResponse.json({ error: 'Το ΑΦΜ πρέπει να έχει 9 ψηφία' }, { status: 400 })
      if (!doy) return NextResponse.json({ error: 'Συμπλήρωσε ΔΟΥ' }, { status: 400 })
      if (app.location_id) return NextResponse.json({ error: 'Έχει ήδη γίνει onboarding' }, { status: 409 })
      const { data: ob, error: obErr } = await admin.from('partner_onboarding').insert({
        business_name: String(app.business_name || '').trim() || 'Νέο πλυντήριο',
        afm, doy, address,
        iban_holder: String(b.ibanHolder || '').trim(),
        iban: String(b.iban || '').replace(/\s/g, '').toUpperCase(),
        contact_name: String(app.owner_name || '').trim() || '—',
        phone: String(app.phone || '').trim() || '—',
        email: String(app.email || '').trim().toLowerCase() || '—',
        declaration_accepted: false,
        status: 'pending',
      }).select('*').single()
      if (obErr || !ob) return NextResponse.json({ error: obErr?.message || 'Αποτυχία onboarding' }, { status: 500 })
      const r = await activateOnboarding(admin, ob)
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
      await admin.from('applications').update({
        stage: 'done', status: 'approved', afm, doy, address, onboarding_id: ob.id, location_id: r.locationId, stage_updated_at: now,
      }).eq('id', app.id)
      return NextResponse.json({ ok: true, locationId: r.locationId })
    }
    default:
      return NextResponse.json({ error: 'Άγνωστη ενέργεια' }, { status: 400 })
  }
}
