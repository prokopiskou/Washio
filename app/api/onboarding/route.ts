import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const NOTIFY_TO = 'withinsuccess@gmail.com'

/**
 * Αν το κάνεις true, το πλήρες IBAN μπαίνει στο email ειδοποίησης.
 * Προτείνεται false: το IBAN είναι ευαίσθητο και βρίσκεται ήδη στη βάση.
 */
const INCLUDE_FULL_IBAN_IN_EMAIL = false

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
      !ibanHolder ||
      !iban ||
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

    const cleanIban = normalizeIban(iban)
    if (!isValidIban(cleanIban)) {
      return NextResponse.json({ error: 'Invalid IBAN' }, { status: 400 })
    }

    const { error: dbError } = await supabaseAdmin.from('partner_onboarding').insert({
      business_name: String(businessName).trim(),
      afm: String(afm).trim(),
      doy: String(doy).trim(),
      address: String(address).trim(),
      iban_holder: String(ibanHolder).trim(),
      iban: cleanIban,
      contact_name: String(contactName).trim(),
      phone: String(phone).trim(),
      email: String(email).trim().toLowerCase(),
      declaration_accepted: true,
      declaration_accepted_at: new Date().toISOString(),
      status: 'pending',
    })

    if (dbError) {
      console.error('Onboarding DB insert error:', dbError)
      return NextResponse.json({ error: 'Failed to save onboarding data' }, { status: 500 })
    }

    const details: [string, string][] = [
      ['Επωνυμία', String(businessName)],
      ['ΑΦΜ', String(afm)],
      ['ΔΟΥ', String(doy)],
      ['Διεύθυνση έδρας', String(address)],
      ['Δικαιούχος λογαριασμού', String(ibanHolder)],
      ['IBAN', INCLUDE_FULL_IBAN_IN_EMAIL ? cleanIban : maskIban(cleanIban)],
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
