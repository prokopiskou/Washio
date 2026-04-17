import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'

const resend = new Resend(process.env.RESEND_API_KEY)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      businessName,
      address,
      city,
      taxId,
      contactName,
      phone,
      email,
      hours,
      lanes,
      washType,
      termsAccepted,
    } = body ?? {}

    if (
      !businessName ||
      !address ||
      !city ||
      !taxId ||
      !contactName ||
      !phone ||
      !email ||
      !hours ||
      !lanes ||
      !washType ||
      !termsAccepted
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const details = [
      ['Επωνυμία πλυντηρίου', businessName],
      ['Διεύθυνση', address],
      ['Πόλη / Περιοχή', city],
      ['ΑΦΜ', taxId],
      ['Όνομα υπεύθυνου', contactName],
      ['Τηλέφωνο', phone],
      ['Email', email],
      ['Ωράριο λειτουργίας', hours],
      ['Αριθμός διαδρομών', lanes],
      ['Τύπος πλυντηρίου', washType],
      ['Αποδοχή όρων χρήσης', termsAccepted ? 'Ναι' : 'Όχι'],
    ]

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Νέα αίτηση συνεργασίας Washio</h2>
        <table style="border-collapse: collapse; width: 100%; max-width: 700px;">
          <tbody>
            ${details
              .map(
                ([label, value]) => `
              <tr>
                <td style="padding: 8px; border: 1px solid #e5e7eb; width: 220px; font-weight: 600;">${label}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${String(value)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `

    await resend.emails.send({
      from: 'Washio Apply <onboarding@resend.dev>',
      to: 'withinsuccess@gmail.com',
      subject: `Νέα αίτηση: ${businessName}`,
      html,
    })

    await supabaseAdmin.from('applications').insert({
      business_name: businessName,
      address,
      city,
      afm: taxId,
      owner_name: contactName,
      phone,
      email,
      hours,
      lanes,
      wash_type: washType,
      status: 'pending',
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to send application' }, { status: 500 })
  }
}
