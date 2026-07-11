import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

// Αυτόματη ειδοποίηση waitlist: όταν ανοίγει (is_active=true) ένα πλυντήριο σε
// περιοχή που έχει κόσμο στη waitlist, τους στέλνει email «Το Washio ήρθε στην
// περιοχή σου!». Τρέχει από cron (bearer CRON_SECRET). Κάθε location ειδοποιεί
// ΜΙΑ φορά (waitlist_notified_at).

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY)

const RADIUS_KM = 12 // ακτίνα εξυπηρέτησης για ταίριασμα waitlist ↔ νέο πλυντήριο

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function emailHtml(area: string): string {
  return `
  <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; background: #fff;">
    <div style="background: #0A0A0A; padding: 32px; text-align: center; border-radius: 16px 16px 0 0;">
      <h1 style="color: white; font-size: 22px; font-weight: 600; margin: 0;">washio</h1>
    </div>
    <div style="padding: 32px; border: 1px solid #F0F0F0; border-top: none; border-radius: 0 0 16px 16px;">
      <h2 style="font-size: 20px; font-weight: 700; color: #0A0A0A; margin: 0 0 14px;">Ήρθαμε στη γειτονιά σου.</h2>
      <p style="color: #444; font-size: 14px; line-height: 1.6; margin: 0 0 14px;">
        Ζήτησες Washio στην περιοχή <strong>${area}</strong>. Μόλις άνοιξε πλυντήριο κοντά σου.
      </p>
      <p style="color: #444; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        Κλείσε το πρώτο σου πλύσιμο σε 30 δευτερόλεπτα — διάλεξε ώρα, εμφανίσου, φύγε με αστραφτερό αμάξι. Χωρίς ουρές, χωρίς αναμονή.
      </p>
      <a href="https://washio.gr/map" style="display: block; background: #0A0A0A; color: white; text-align: center; padding: 15px; border-radius: 12px; text-decoration: none; font-size: 15px; font-weight: 600; margin-bottom: 24px;">Κλείσε πλύσιμο</a>
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
    // Ενεργά πλυντήρια που δεν έχουν ειδοποιήσει waitlist ακόμα.
    const { data: locations } = await supabase
      .from('locations')
      .select('id, name, city, lat, lng')
      .eq('is_active', true)
      .is('waitlist_notified_at', null)

    if (!locations || locations.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, sent: 0 })
    }

    // Όλες οι μη-ειδοποιημένες waitlist εγγραφές (ο πίνακας είναι μικρός).
    const { data: entries } = await supabase
      .from('waitlist')
      .select('id, email, lat, lng, area_label')
      .eq('notified', false)

    let sent = 0

    for (const loc of locations) {
      if (loc.lat == null || loc.lng == null) continue

      const nearby = (entries || []).filter(e =>
        e.lat != null && e.lng != null &&
        distanceKm(loc.lat, loc.lng, e.lat as number, e.lng as number) <= RADIUS_KM
      )

      // Dedup ανά email (κράτα το πρώτο area_label).
      const byEmail = new Map<string, { area: string; ids: string[] }>()
      for (const e of nearby) {
        const key = e.email
        const existing = byEmail.get(key)
        if (existing) existing.ids.push(e.id)
        else byEmail.set(key, { area: e.area_label || loc.city || 'την περιοχή σου', ids: [e.id] })
      }

      for (const [email, info] of byEmail) {
        try {
          await resend.emails.send({
            from: 'Washio <noreply@washio.gr>',
            to: email,
            subject: 'Το Washio ήρθε στην περιοχή σου!',
            html: emailHtml(info.area),
          })
          sent++
          await supabase.from('waitlist').update({ notified: true }).in('id', info.ids)
        } catch (e) {
          console.error('Waitlist email error:', e)
        }
      }

      await supabase.from('locations').update({ waitlist_notified_at: new Date().toISOString() }).eq('id', loc.id)
    }

    return NextResponse.json({ ok: true, processed: locations.length, sent })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Σφάλμα'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
