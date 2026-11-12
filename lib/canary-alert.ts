// Ειδοποίηση όταν «χτυπηθεί» το canary (lib/canary.ts). Μία ειδοποίηση / IP / 24ώρο, όλα στο security_events.
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

const ALERT_TO = 'withinsuccess@gmail.com'

export async function canaryHit(req: Request, url: string) {
  try {
    const h = req.headers
    const ip = (h.get('x-forwarded-for') || '').split(',')[0].trim() || h.get('x-real-ip') || 'unknown'
    const ua = h.get('user-agent') || ''
    const ref = h.get('referer') || h.get('origin') || ''
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
    const { data: prev } = await db.from('security_events').select('id').eq('ip', ip).eq('reason', 'canary')
      .gte('created_at', new Date(Date.now() - 864e5).toISOString()).limit(1)
    await db.from('security_events').insert({ ip, path: url.slice(0, 300), reason: 'canary', user_agent: (ua + (ref ? ` | ref: ${ref}` : '')).slice(0, 300) })
    if (prev?.length || !process.env.RESEND_API_KEY) return
    const esc = (s: string) => s.replace(/</g, '&lt;')
    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: 'Washio <noreply@washio.gr>', to: ALERT_TO,
      subject: '🚨 Washio: χτυπήθηκε το ψεύτικο πλυντήριο «AquaPrime Car Spa»',
      html: `<div style="font-family:-apple-system,Arial,sans-serif;font-size:14px;color:#10182A">
        <p>Κάποιος ζήτησε το ψεύτικο πλυντήριο που υπάρχει ΜΟΝΟ στα δεδομένα μας. Πιθανή αντιγραφή.</p>
        <p><b>URL:</b> ${esc(url.slice(0, 200))}<br><b>Προέλευση (referer):</b> ${esc(ref) || '—'}<br><b>IP:</b> ${ip}<br><b>User-Agent:</b> ${esc(ua.slice(0, 200)) || '—'}</p>
        <p>Αν το referer είναι άλλο site/εφαρμογή → κράτα screenshot, είναι απόδειξη. Ιστορικό: πίνακας security_events.</p></div>`,
    })
  } catch { /* best-effort */ }
}
