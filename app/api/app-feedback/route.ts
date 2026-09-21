import { ipFrom, isThrottled } from '@/lib/throttle'
import { escapeHtml } from '@/lib/escape-html'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// Εσωτερικό feedback από το app-rating popup όταν ο χρήστης βάλει < 4 αστέρια.
// Δεν πάει στο store — έρχεται σε εμάς για να το χειριστούμε.
export async function POST(req: Request) {
  try {
    if (await isThrottled('feedback:' + ipFrom(req), 10, 3600000)) {
      return NextResponse.json({ error: 'Πολλές προσπάθειες. Δοκίμασε αργότερα.' }, { status: 429 })
    }
    const body = await req.json()
    const { rating, comment, email } = body ?? {}

    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'Invalid rating' }, { status: 400 })
    }

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.5;">
        <h2>Εσωτερικό feedback εφαρμογής (${rating}★)</h2>
        <p><strong>Βαθμολογία:</strong> ${rating} / 5</p>
        <p><strong>Χρήστης:</strong> ${email ? escapeHtml(email) : '—'}</p>
        <p><strong>Σχόλιο:</strong></p>
        <p style="white-space: pre-wrap; padding: 10px; background: #f7f7f7; border-radius: 8px;">${comment ? escapeHtml(comment) : '(χωρίς σχόλιο)'}</p>
      </div>
    `

    await resend.emails.send({
      from: 'Washio <noreply@washio.gr>',
      to: 'withinsuccess@gmail.com',
      subject: `Εσωτερικό feedback app: ${rating}★`,
      html,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to send feedback' }, { status: 500 })
  }
}
