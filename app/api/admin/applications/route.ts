import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'
import { activateOnboarding } from '@/lib/onboarding-activate'
import { createAndSendContract, sendContractLink } from '@/lib/contracts'
import type { ContractFields } from '@/lib/contract-text'

// Admin → Αιτήσεις: στάδια διαδικασίας για αιτήσεις πλυντηρίων (apply / Meta leads).
//  POST { id, action, ... }
//   answered            → σήκωσε (stage=answered)
//   no_answer           → δεν σήκωσε (+1 προσπάθεια) + υπενθύμιση αύριο 10:00
//   followup {at}       → follow-up σε ημερομηνία/ώρα (email 15' πριν σε όποιον το όρισε)
//   to_onboarding       → πάει στο στάδιο onboarding
//   onboard {afm, doy, address?, iban?, ibanHolder?} → «Onboarding κομπλέ»: δημιουργεί onboarding + πρατήριο (ανενεργό)
//   lost / reopen       → δεν ενδιαφέρεται / ξανά νέα
//   note {text}         → σημειώσεις
// Αύριο 10:00 ώρα Ελλάδας (σωστό για χειμερινή/θερινή ώρα).
function tomorrowMorningAthens(): string {
  const now = new Date()
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map(x => [x.type, x.value]))
  const offsetH = Number(p.hour) - now.getUTCHours()
  const off = ((offsetH % 24) + 24) % 24 // 2 ή 3
  const d = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) + 1, 10 - off, 0, 0))
  return d.toISOString()
}

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
    id?: string; action?: string; at?: string; afm?: string; doy?: string; address?: string; iban?: string; ibanHolder?: string; text?: string; answered?: boolean
    businessName?: string; contactName?: string; phone?: string; email?: string; city?: string; promoMonths?: number; legacy?: boolean
  }
  const { data: app } = await admin.from('applications').select('*').eq('id', b.id || '').maybeSingle()
  if (!app) return NextResponse.json({ error: 'Η αίτηση δεν βρέθηκε' }, { status: 404 })
  const now = new Date().toISOString()
  // «Σήκωσε» + απόφαση στο ίδιο βήμα (onboarding / follow-up / δεν ενδιαφέρεται) → μετράει και την κλήση.
  const callLog = b.answered ? { call_attempts: (app.call_attempts || 0) + 1, last_call_at: now, last_call_by: user.email } : {}
  const set = async (patch: Record<string, unknown>) => {
    const { error } = await admin.from('applications').update({ ...callLog, ...patch, stage_updated_at: now }).eq('id', app.id)
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }

  switch (b.action) {
    case 'answered':
      return set({ stage: 'answered', call_attempts: (app.call_attempts || 0) + 1, last_call_at: now, last_call_by: user.email })
    case 'no_answer':
      // Δεν σήκωσε → υπενθύμιση αύριο το πρωί (10:00) σε όποιον πάτησε.
      return set({ stage: 'no_answer', call_attempts: (app.call_attempts || 0) + 1, last_call_at: now, last_call_by: user.email,
        followup_at: tomorrowMorningAthens(), followup_by: user.email, followup_notified_at: null })
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
    // Υποβολή → ηλεκτρονικό συμφωνητικό (υπογεγραμμένο από Washio) στο email του συνεργάτη.
    case 'send_contract': {
      const afm = String(b.afm || '').replace(/\D/g, '')
      const fields: Omit<ContractFields, 'date'> = {
        afm, doy: String(b.doy || '').trim(), businessName: String(b.businessName || '').trim(),
        address: String(b.address || '').trim(), contactName: String(b.contactName || '').trim(),
        promoMonths: Math.max(0, Math.min(12, Math.round(Number(b.promoMonths) || 0))),
        ibanHolder: String(b.ibanHolder || '').trim().slice(0, 120),
      }
      const email = String(b.email || app.email || '').trim().toLowerCase()
      const phone = String(b.phone || app.phone || '').trim()
      const iban = String(b.iban || '').replace(/\s/g, '').toUpperCase()
      if (afm.length !== 9) return NextResponse.json({ error: 'Το ΑΦΜ πρέπει να έχει 9 ψηφία' }, { status: 400 })
      if (!fields.doy) return NextResponse.json({ error: 'Συμπλήρωσε ΔΟΥ' }, { status: 400 })
      if (!fields.businessName) return NextResponse.json({ error: 'Συμπλήρωσε επωνυμία' }, { status: 400 })
      if (!fields.address) return NextResponse.json({ error: 'Συμπλήρωσε διεύθυνση έδρας' }, { status: 400 })
      if (fields.contactName.length < 3) return NextResponse.json({ error: 'Συμπλήρωσε υπεύθυνο' }, { status: 400 })
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Λάθος email' }, { status: 400 })
      if (iban && !/^GR\d{25}$/.test(iban)) return NextResponse.json({ error: 'Λάθος IBAN (GR + 25 ψηφία)' }, { status: 400 })
      if (iban && (fields.ibanHolder || '').length < 3) return NextResponse.json({ error: 'Συμπλήρωσε δικαιούχο του IBAN' }, { status: 400 })
      if (app.location_id) return NextResponse.json({ error: 'Έχει ήδη γίνει onboarding' }, { status: 409 })
      const r = await createAndSendContract(admin, { applicationId: app.id, fields, email, phone, iban, sentBy: user.email || '' })
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
      return set({ stage: 'done', contract_id: r.id, contract_status: 'sent', afm, doy: fields.doy, address: fields.address,
        business_name: fields.businessName, owner_name: fields.contactName, email, phone })
    }
    case 'resend_contract': {
      if (!app.contract_id) return NextResponse.json({ error: 'Δεν υπάρχει συμβόλαιο' }, { status: 400 })
      const { data: c } = await admin.from('partner_contracts').select('token, email, fields, status').eq('id', app.contract_id).maybeSingle()
      if (!c || c.status !== 'sent') return NextResponse.json({ error: 'Το συμβόλαιο δεν περιμένει υπογραφή' }, { status: 400 })
      const r = await sendContractLink({ token: c.token, email: c.email, fields: c.fields })
      return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 500 })
    }
    case 'delete': {
      const { error } = await admin.from('applications').delete().eq('id', app.id)
      return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
    }
    case 'note':
      return set({ pipeline_notes: String(b.text || '').slice(0, 2000) })
    case 'onboard': {
      // Παλιά ροή (χωρίς συμβόλαιο) — πλέον μόνο μέσω ηλεκτρονικού συμφωνητικού (send_contract).
      if (!b.legacy) return NextResponse.json({ error: 'Ανανέωσε τη σελίδα (Cmd+Shift+R) — το onboarding γίνεται πλέον με αποστολή συμβολαίου.' }, { status: 409 })
      const afm = String(b.afm || '').replace(/\D/g, '')
      const doy = String(b.doy || '').trim()
      const address = String(b.address || app.address || '').trim()
      if (afm.length !== 9) return NextResponse.json({ error: 'Το ΑΦΜ πρέπει να έχει 9 ψηφία' }, { status: 400 })
      if (!doy) return NextResponse.json({ error: 'Συμπλήρωσε ΔΟΥ' }, { status: 400 })
      if (app.location_id) return NextResponse.json({ error: 'Έχει ήδη γίνει onboarding' }, { status: 409 })
      // Τελικά στοιχεία (final check με τον πελάτη) — υπερισχύουν της αίτησης.
      const businessName = String(b.businessName ?? app.business_name ?? '').trim()
      const contactName = String(b.contactName ?? app.owner_name ?? '').trim()
      const phone = String(b.phone ?? app.phone ?? '').trim()
      const email = String(b.email ?? app.email ?? '').trim().toLowerCase()
      const city = String(b.city ?? app.city ?? '').trim()
      const iban = String(b.iban || '').replace(/\s/g, '').toUpperCase()
      if (!businessName) return NextResponse.json({ error: 'Συμπλήρωσε επωνυμία' }, { status: 400 })
      if (phone.replace(/\D/g, '').length < 10) return NextResponse.json({ error: 'Λάθος κινητό' }, { status: 400 })
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Λάθος email' }, { status: 400 })
      if (iban && !/^GR\d{25}$/.test(iban)) return NextResponse.json({ error: 'Λάθος IBAN (GR + 25 ψηφία)' }, { status: 400 })
      const { data: ob, error: obErr } = await admin.from('partner_onboarding').insert({
        business_name: businessName,
        afm, doy, address,
        iban_holder: String(b.ibanHolder || '').trim(),
        iban,
        contact_name: contactName || '—',
        phone,
        email: email || '—',
        declaration_accepted: false,
        status: 'pending',
      }).select('*').single()
      if (obErr || !ob) return NextResponse.json({ error: obErr?.message || 'Αποτυχία onboarding' }, { status: 500 })
      const r = await activateOnboarding(admin, ob, { city })
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
      await admin.from('applications').update({
        ...callLog, stage: 'done', status: 'approved', afm, doy, address,
        business_name: businessName, owner_name: contactName, phone, email: email || app.email, city, iban: iban || app.iban, onboarding_id: ob.id, location_id: r.locationId, stage_updated_at: now,
      }).eq('id', app.id)
      return NextResponse.json({ ok: true, locationId: r.locationId })
    }
    default:
      return NextResponse.json({ error: 'Άγνωστη ενέργεια' }, { status: 400 })
  }
}
