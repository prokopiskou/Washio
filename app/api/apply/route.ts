import { ipFrom, isThrottled } from '@/lib/throttle'
import { escapeHtml } from '@/lib/escape-html'
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
    if (await isThrottled('apply:' + ipFrom(req), 5, 3600000)) {
      return NextResponse.json({ error: 'Πολλές προσπάθειες. Δοκίμασε αργότερα.' }, { status: 429 })
    }
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
      !contactName ||
      !phone ||
      !email ||
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
                <td style="padding: 8px; border: 1px solid #e5e7eb; width: 220px; font-weight: 600;">${escapeHtml(label)}</td>
                <td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(value)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `

    // Διπλή υποβολή (ίδιο κινητό ή email τις τελευταίες 24 ώρες) → δεν φτιάχνουμε νέα αίτηση,
    // ενημερώνουμε την υπάρχουσα και ΔΕΝ ξαναστέλνουμε email.
    const digits = String(phone).replace(/\D/g, '').slice(-10)
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const { data: recent } = await supabaseAdmin.from('applications')
      .select('id, phone, email').gte('created_at', since).neq('wash_type', 'Meta lead')
    const dup = (recent || []).find(r =>
      (digits.length >= 10 && String(r.phone || '').replace(/\D/g, '').slice(-10) === digits) ||
      (String(r.email || '').trim().toLowerCase() === String(email).trim().toLowerCase()))
    if (dup) {
      await supabaseAdmin.from('applications').update({
        business_name: businessName, address, city, afm: taxId, owner_name: contactName,
        phone, email, hours, lanes, wash_type: washType,
      }).eq('id', dup.id)
      return NextResponse.json({ ok: true, duplicate: true })
    }

    const { error: dbError } = await supabaseAdmin.from('applications').insert({
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

    if (dbError) {
      console.error('DB insert error:', dbError)
      return NextResponse.json({ error: 'Failed to save application', dbError }, { status: 500 })
    }

    await resend.emails.send({
      from: 'Washio <noreply@washio.gr>',
      to: 'withinsuccess@gmail.com',
      subject: `Νέα αίτηση: ${businessName}`,
      html,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to send application' }, { status: 500 })
  }
}
