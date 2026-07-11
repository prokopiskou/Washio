import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { sendPush } from '@/lib/push'

// Abandoned-checkout recovery: όποιος έφτασε στην πληρωμή (δημιουργήθηκε PaymentIntent)
// αλλά δεν ολοκλήρωσε κράτηση σε ~90', λαμβάνει ένα email «ολοκλήρωσε την κράτησή σου».
// Τρέχει από cron (bearer CRON_SECRET). Στέλνει μία φορά ανά attempt.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY)

const MIN_AGE_MIN = 90    // περίμενε 90' πριν θεωρήσεις abandoned
const MAX_AGE_H = 24      // μην ενοχλείς attempts παλαιότερα από 24h

function emailHtml(service: string, url: string): string {
  return `
  <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; background: #fff;">
    <div style="background: #0A0A0A; padding: 32px; text-align: center; border-radius: 16px 16px 0 0;">
      <h1 style="color: white; font-size: 22px; font-weight: 600; margin: 0;">washio</h1>
    </div>
    <div style="padding: 32px; border: 1px solid #F0F0F0; border-top: none; border-radius: 0 0 16px 16px;">
      <h2 style="font-size: 20px; font-weight: 700; color: #0A0A0A; margin: 0 0 14px;">Δεν ολοκλήρωσες την κράτησή σου.</h2>
      <p style="color: #444; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        Ξεκίνησες κράτηση για <strong>${service || 'πλύσιμο'}</strong> αλλά δεν ολοκληρώθηκε. Το πλύσιμό σου σε περιμένει — κλείσε το σε 30 δευτερόλεπτα.
      </p>
      <a href="${url}" style="display: block; background: #0A0A0A; color: white; text-align: center; padding: 15px; border-radius: 12px; text-decoration: none; font-size: 15px; font-weight: 600; margin-bottom: 24px;">Ολοκλήρωσε την κράτηση</a>
      <p style="color: #999; font-size: 12px; margin: 0;">— Η ομάδα του Washio</p>
    </div>
  </div>`
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = Date.now()
    const maxAge = new Date(now - MAX_AGE_H * 3600_000).toISOString()
    const minAge = new Date(now - MIN_AGE_MIN * 60_000).toISOString()

    const { data: attempts } = await supabase
      .from('checkout_attempts')
      .select('id, payment_intent_id, user_id, email, service_name, location_id')
      .eq('reminded', false)
      .lt('created_at', minAge)
      .gt('created_at', maxAge)

    if (!attempts || attempts.length === 0) return NextResponse.json({ ok: true, sent: 0 })

    let sent = 0
    for (const a of attempts) {
      // Ολοκληρώθηκε τελικά; (booking με αυτό το payment_intent) → μην στείλεις.
      const { data: booking } = await supabase
        .from('bookings')
        .select('id')
        .eq('stripe_payment_intent_id', a.payment_intent_id)
        .maybeSingle()

      if (!booking) {
        // Link στο πλυντήριο αν το ξέρουμε, αλλιώς στον χάρτη.
        let url = 'https://washio.gr/map'
        if (a.location_id) {
          const { data: loc } = await supabase.from('locations').select('slug').eq('id', a.location_id).maybeSingle()
          if (loc?.slug) url = `https://washio.gr/locations/${loc.slug}`
        }
        if (a.email) {
          try {
            await resend.emails.send({
              from: 'Washio <noreply@washio.gr>',
              to: a.email,
              subject: 'Δεν ολοκλήρωσες την κράτησή σου',
              html: emailHtml(a.service_name || '', url),
            })
            sent++
          } catch (e) { console.error('Abandoned email error:', e) }
        }
        // best-effort push επίσης
        await sendPush(a.user_id, {
          title: 'Η κράτησή σου σε περιμένει',
          body: 'Δεν ολοκληρώθηκε η κράτηση. Κλείσε το πλύσιμό σου σε 30 δευτερόλεπτα.',
          url: '/map',
        })
      }

      await supabase.from('checkout_attempts').update({ reminded: true }).eq('id', a.id)
    }

    return NextResponse.json({ ok: true, sent })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Σφάλμα'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
