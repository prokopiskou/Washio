import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

// Abandoned-checkout recovery: όποιος έφτασε στην πληρωμή (δημιουργήθηκε PaymentIntent)
// αλλά δεν ολοκλήρωσε κράτηση σε ~90', λαμβάνει ένα email «ολοκλήρωσε την κράτησή σου».
// Τρέχει από cron (bearer CRON_SECRET). ΕΝΑ email ανά χρήστη, το πολύ ένα ανά 72 ώρες.
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
    <div style="background: #10182A; padding: 32px; text-align: center; border-radius: 16px 16px 0 0;">
      <h1 style="color: white; font-size: 22px; font-weight: 600; margin: 0;">washio</h1>
    </div>
    <div style="padding: 32px; border: 1px solid #F0F0F0; border-top: none; border-radius: 0 0 16px 16px;">
      <h2 style="font-size: 20px; font-weight: 700; color: #10182A; margin: 0 0 14px;">Δεν ολοκλήρωσες την κράτησή σου.</h2>
      <p style="color: #444; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        Ξεκίνησες κράτηση για <strong>${service || 'πλύσιμο'}</strong> αλλά δεν ολοκληρώθηκε. Το πλύσιμό σου σε περιμένει — κλείσε το σε 30 δευτερόλεπτα.
      </p>
      <a href="${url}" style="display: block; background: #10182A; color: white; text-align: center; padding: 15px; border-radius: 12px; text-decoration: none; font-size: 15px; font-weight: 600; margin-bottom: 24px;">Ολοκλήρωσε την κράτηση</a>
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
      .select('id, payment_intent_id, user_id, email, service_name, location_id, created_at')
      .eq('reminded', false)
      .lt('created_at', minAge)
      .gt('created_at', maxAge)
      .order('created_at', { ascending: true })

    if (!attempts || attempts.length === 0) return NextResponse.json({ ok: true, sent: 0 })

    // ΕΝΑ email ανά χρήστη: κάθε άνοιγμα της σελίδας κράτησης δημιουργεί attempt,
    // άρα ένας χρήστης μπορεί να έχει 3-4 ταυτόχρονα → έπαιρνε 3-4 ίδια email.
    // Κρατάμε το πιο πρόσφατο attempt ανά χρήστη/email και σημαδεύουμε τα υπόλοιπα.
    const keyOf = (a: { user_id?: string | null; email?: string | null }) =>
      (a.user_id || (a.email || '').toLowerCase() || '') as string
    const latest = new Map<string, (typeof attempts)[number]>()
    for (const a of attempts) {
      const k = keyOf(a)
      if (!k) continue
      latest.set(k, a) // τα attempts έρχονται με σειρά δημιουργίας → το τελευταίο κερδίζει
    }
    const toSend = new Set([...latest.values()].map(a => a.id))

    // Μην ξαναστείλεις σε όποιον πήρε υπενθύμιση τις τελευταίες 72 ώρες.
    const since72 = new Date(now - 72 * 3600_000).toISOString()
    const userIds = [...new Set(attempts.map(a => a.user_id).filter(Boolean))] as string[]
    const { data: recent } = userIds.length
      ? await supabase.from('checkout_attempts').select('user_id')
          .in('user_id', userIds).eq('reminded', true).gt('created_at', since72)
      : { data: [] as { user_id: string }[] }
    const remindedRecently = new Set((recent || []).map(r => r.user_id as string))

    let sent = 0
    for (const a of attempts) {
      const skip = !toSend.has(a.id) || (a.user_id && remindedRecently.has(a.user_id))

      // Έκλεισε τελικά; (αυτό το payment_intent Ή οποιαδήποτε κράτηση του χρήστη το τελευταίο 24ωρο) → μην στείλεις.
      const { data: booking } = skip ? { data: null } : await supabase
        .from('bookings')
        .select('id')
        .eq('stripe_payment_intent_id', a.payment_intent_id)
        .maybeSingle()
      let bookedAny = false
      if (!skip && !booking && a.user_id) {
        const { count } = await supabase.from('bookings').select('id', { count: 'exact', head: true })
          .eq('user_id', a.user_id).gt('created_at', maxAge).neq('status', 'cancelled')
        bookedAny = (count || 0) > 0
      }

      if (!skip && !booking && !bookedAny) {
        // Link στο πλυντήριο αν το ξέρουμε, αλλιώς στον χάρτη.
        let url = 'https://washio.gr/map'
        if (a.location_id) {
          const { data: loc } = await supabase.from('locations').select('slug').eq('id', a.location_id).maybeSingle()
          if (loc?.slug) url = `https://washio.gr/locations/${loc.slug}`
        }
        // ΜΟΝΟ email (όχι push) — το push «δεν ολοκλήρωσες» είναι σπαμ, ειδικά
        // όταν υπάρχουν πολλά ημιτελή attempts. Ένα διακριτικό email αρκεί.
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
      }

      await supabase.from('checkout_attempts').update({ reminded: true }).eq('id', a.id)
    }

    return NextResponse.json({ ok: true, sent })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Σφάλμα'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
