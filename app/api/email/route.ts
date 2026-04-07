import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  const { to, bookingRef, locationName, service, date, time } = await req.json()

  try {
    await resend.emails.send({
      from: 'Washio <onboarding@resend.dev>',
      to,
      subject: `Επιβεβαίωση κράτησης ${bookingRef}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
          <h2 style="font-size: 20px; font-weight: 600; color: #0A0A0A; margin-bottom: 8px;">
            Η κράτησή σου επιβεβαιώθηκε!
          </h2>
          <p style="color: #666; font-size: 14px; margin-bottom: 24px;">
            Τα στοιχεία της κράτησής σου:
          </p>

          <div style="background: #F7F7F7; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
            <table style="width: 100%; font-size: 14px;">
              <tr>
                <td style="color: #999; padding: 4px 0;">Κωδικός</td>
                <td style="color: #0A0A0A; font-weight: 500; text-align: right;">${bookingRef}</td>
              </tr>
              <tr>
                <td style="color: #999; padding: 4px 0;">Σταθμός</td>
                <td style="color: #0A0A0A; font-weight: 500; text-align: right;">${locationName}</td>
              </tr>
              <tr>
                <td style="color: #999; padding: 4px 0;">Υπηρεσία</td>
                <td style="color: #0A0A0A; font-weight: 500; text-align: right;">${service}</td>
              </tr>
              <tr>
                <td style="color: #999; padding: 4px 0;">Ημερομηνία</td>
                <td style="color: #0A0A0A; font-weight: 500; text-align: right;">${date}</td>
              </tr>
              <tr>
                <td style="color: #999; padding: 4px 0;">Ώρα</td>
                <td style="color: #0A0A0A; font-weight: 500; text-align: right;">${time}</td>
              </tr>
            </table>
          </div>

          <p style="color: #999; font-size: 12px; text-align: center;">
            Washio — Πλύσιμο αυτοκινήτου με ένα tap
          </p>
        </div>
      `
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}