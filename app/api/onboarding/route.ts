import { ipFrom, isThrottled } from '@/lib/throttle'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const NOTIFY_TO = ['withinsuccess@gmail.com', 'giwrgos2070@gmail.com']

/**
 * Αν το κάνεις true, το πλήρες IBAN μπαίνει στο email ειδοποίησης.
 * Προτείνεται false: το IBAN είναι ευαίσθητο και βρίσκεται ήδη στη βάση.
 */
const INCLUDE_FULL_IBAN_IN_EMAIL = false

type ObRow = { id: string; business_name: string; afm: string; doy: string; address: string; iban: string; iban_holder?: string; contact_name: string; phone: string; email: string }

/** Onboarding χωρίς αίτηση → γραμμή στις «Αιτήσεις» (στάδιο self_onboarding). Αν υπάρχει ήδη αίτηση
 *  με ίδιο κινητό/email (χωρίς πρατήριο), ενημερώνεται εκείνη αντί για διπλή. */
async function linkToApplication(ob: ObRow) {
  const digits = String(ob.phone || '').replace(/\D/g, '').slice(-10)
  const fields = {
    stage: 'self_onboarding', stage_updated_at: new Date().toISOString(), onboarding_id: ob.id,
    afm: ob.afm, doy: ob.doy, address: ob.address, owner_name: ob.contact_name, business_name: ob.business_name,
    iban: ob.iban || null, email: ob.email,
    ...(ob.iban_holder ? { bank_name: ob.iban_holder } : {}), // δικαιούχος IBAN (προσυμπλήρωση στο συμβόλαιο)
  }
  const { data: cands } = await supabaseAdmin.from('applications').select('id, phone, email, location_id')
    .is('location_id', null).order('created_at', { ascending: false }).limit(500)
  const match = (cands || []).find((a: { phone?: string; email?: string }) =>
    (digits.length >= 10 && String(a.phone || '').replace(/\D/g, '').slice(-10) === digits) ||
    (ob.email && String(a.email || '').trim().toLowerCase() === ob.email))
  if (match) {
    await supabaseAdmin.from('applications').update(fields).eq('id', (match as { id: string }).id)
    return
  }
  await supabaseAdmin.from('applications').insert({
    ...fields, phone: ob.phone, city: '', hours: '', lanes: '', wash_type: 'Onboarding', status: 'pending', call_attempts: 0,
  })
}

function normalizeIban(value: string): string {
  return String(value ?? '').replace(/\s+/g, '').toUpperCase()
}

function maskIban(iban: string): string {
  const v = normalizeIban(iban)
  if (v.length <= 8) return v
  return `${v.slice(0, 4)} •••• •••• ${v.slice(-4)}`
}

function isValidAfm(value: string): boolean {
  const afm = String(value ?? '').trim()
  if (!/^\d{9}$/.test(afm)) return false
  if (afm === '000000000') return false
  const digits = afm.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 8; i++) sum += digits[i] * 2 ** (8 - i)
  return ((sum % 11) % 10) === digits[8]
}

function isValidIban(value: string): boolean {
  const iban = normalizeIban(value)
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false
  if (iban.length < 15 || iban.length > 34) return false
  if (iban.startsWith('GR') && iban.length !== 27) return false
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  const expanded = rearranged.replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55))
  let remainder = 0
  for (const ch of expanded) remainder = (remainder * 10 + Number(ch)) % 97
  return remainder === 1
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function POST(req: Request) {
  try {
    if (await isThrottled('onboarding:' + ipFrom(req), 5, 3600000)) {
      return NextResponse.json({ error: 'Πολλές προσπάθειες. Δοκίμασε αργότερα.' }, { status: 429 })
    }
    const body = await req.json()
    const {
      businessName,
      afm,
      doy,
      address,
      ibanHolder,
      iban,
      contactName,
      phone,
      email,
      declarationAccepted,
    } = body ?? {}

    if (
      !businessName ||
      !afm ||
      !doy ||
      !address ||
      !contactName ||
      !phone ||
      !email ||
      !declarationAccepted
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!isValidAfm(afm)) {
      return NextResponse.json({ error: 'Invalid AFM' }, { status: 400 })
    }

    // IBAN προαιρετικό — αν δοθεί, πρέπει να είναι έγκυρο. Κενό = '' (η στήλη είναι NOT NULL).
    const cleanIban = iban ? normalizeIban(String(iban)) : ''
    if (cleanIban && !isValidIban(cleanIban)) {
      return NextResponse.json({ error: 'Invalid IBAN' }, { status: 400 })
    }

    const { data: obRow, error: dbError } = await supabaseAdmin.from('partner_onboarding').insert({
      business_name: String(businessName).trim(),
      afm: String(afm).trim(),
      doy: String(doy).trim(),
      address: String(address).trim(),
      iban_holder: String(ibanHolder || '').trim(),
      iban: cleanIban,
      contact_name: String(contactName).trim(),
      phone: String(phone).trim(),
      email: String(email).trim().toLowerCase(),
      declaration_accepted: true,
      declaration_accepted_at: new Date().toISOString(),
      status: 'pending',
    }).select('*').single()

    if (dbError) {
      console.error('Onboarding DB insert error:', dbError)
      return NextResponse.json({ error: 'Failed to save onboarding data' }, { status: 500 })
    }

    // ΔΕΝ δημιουργείται πλυντήριο εδώ: μπαίνει στις «Αιτήσεις» → καρτέλα «Onboarding» με τα στοιχεία
    // συμπληρωμένα → «Αποστολή συμβολαίου». Το πρατήριο δημιουργείται μόλις ΥΠΟΓΡΑΨΕΙ (όπως όλοι).
    try { if (obRow) await linkToApplication(obRow) } catch (e) { console.error('onboarding → applications', e) }
    const details: [string, string][] = [
      ['Επωνυμία', String(businessName)],
      ['ΑΦΜ', String(afm)],
      ['ΔΟΥ', String(doy)],
      ['Διεύθυνση έδρας', String(address)],
      ['Δικαιούχος λογαριασμού', String(ibanHolder || '').trim() || '—'],
      ['IBAN', !cleanIban ? '— (δεν δόθηκε)' : INCLUDE_FULL_IBAN_IN_EMAIL ? cleanIban : maskIban(cleanIban)],
      ['Υπεύθυνος', String(contactName)],
      ['Τηλέφωνο', String(phone)],
      ['Email', String(email)],
      ['Αποδοχή δήλωσης', 'Ναι'],
    ]

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Νέα στοιχεία συνεργασίας — ${escapeHtml(businessName)}</h2>
        <table style="border-collapse: collapse; width: 100%; max-width: 700px;">
          <tbody>
            ${details
              .map(
                ([label, value]) => `
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb; width: 220px; font-weight: 600;">${escapeHtml(label)}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(value)}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
        ${
          INCLUDE_FULL_IBAN_IN_EMAIL
            ? ''
            : '<p style="color:#6b7280;font-size:13px;margin-top:12px;">Το πλήρες IBAN βρίσκεται στον πίνακα <code>partner_onboarding</code> στο Supabase.</p>'
        }
      </div>
    `

    await resend.emails.send({
      from: 'Washio <noreply@washio.gr>',
      to: NOTIFY_TO,
      subject: `Στοιχεία συνεργασίας: ${businessName}`,
      html,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Onboarding route error:', err)
    return NextResponse.json({ error: 'Failed to submit onboarding data' }, { status: 500 })
  }
}
