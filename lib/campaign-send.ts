// Στοχευμένες καμπάνιες πλυντηρίων (πίνακας campaigns — supabase/audience.sql).
// Κανόνας καναλιού: όποιος έχει push → ΜΟΝΟ push · email ΜΟΝΟ σε όσους δεν έχουν push (ποτέ και τα δύο).
// Κάθε κύμα = μία γραμμή campaigns με ΕΝΑ κανάλι ('email' ή 'push') και scheduled_at.
// segment (jsonb): { all, km, days, viewed_days, booked, favorite, svc_like, exclude_booked_since, exclude_campaign_bookers }
//   all: true → ΟΛΟΙ οι χρήστες (π.χ. ανακοίνωση Washio Club) — χωρίς πλυντήριο
// offer (jsonb):   { url, cta, preheader, kicker, headline, bullets[], footnote }
import type { SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { sendPush } from '@/lib/push'
import { unsubHeaders, unsubFooterLink } from '@/lib/unsubscribe'

const resend = new Resend(process.env.RESEND_API_KEY)
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export type Campaign = {
  id: string; location_id: string | null; title: string; body: string | null
  offer: { url?: string; cta?: string; preheader?: string; kicker?: string; headline?: string; bullets?: string[]; footnote?: string } | null
  segment: { all?: boolean; km?: number; days?: number; viewed_days?: number; booked?: boolean; favorite?: boolean; svc_like?: string; exclude_booked_since?: string } | null
  channels: string[]; status: string; scheduled_at: string | null
}
type Person = { user_id: string; email: string | null; can_push: boolean; can_email: boolean }

const withUtm = (url: string, channel: string, id: string) => {
  const u = new URL(url)
  u.searchParams.set('utm_source', channel); u.searchParams.set('utm_medium', 'campaign'); u.searchParams.set('utm_campaign', `cmp_${id.slice(0, 8)}`)
  return u.toString()
}

/** Κοινό καμπάνιας (χωρίς ομάδα/δοκιμές). */
export async function campaignAudience(db: SupabaseClient, c: Campaign): Promise<Person[]> {
  const seg = c.segment || {}
  const ids = new Set<string>()
  if (c.location_id) {
    const { data, error } = await db.rpc('audience_segment', {
      p_location: c.location_id, p_km: seg.km ?? null, p_days: seg.days ?? 60, p_viewed_days: seg.viewed_days ?? null,
      p_booked: !!seg.booked, p_favorite: !!seg.favorite, p_lapsed_days: null,
    })
    if (error) throw new Error('audience_segment: ' + error.message)
    for (const r of (data || []) as { user_id: string }[]) ids.add(r.user_id)
  }
  // Όσοι κοίταξαν τέτοια υπηρεσία (π.χ. «βιολογ») οπουδήποτε, τις τελευταίες 60 μέρες.
  if (seg.svc_like) {
    const since = new Date(Date.now() - 60 * 864e5).toISOString()
    const { data: fe } = await db.from('funnel_events').select('user_id, device_id').eq('step', 'service_select')
      .ilike('meta->>svc', `%${seg.svc_like}%`).gte('created_at', since).limit(5000)
    const devs = new Set<string>()
    for (const r of (fe || []) as { user_id: string | null; device_id: string | null }[]) { if (r.user_id) ids.add(r.user_id); else if (r.device_id) devs.add(r.device_id) }
    if (devs.size) {
      const { data: dl } = await db.from('device_links').select('user_id').in('device_id', [...devs])
      for (const r of (dl || []) as { user_id: string }[]) if (r.user_id) ids.add(r.user_id)
    }
  }
  // Όλοι οι χρήστες (γενική ανακοίνωση, π.χ. Washio Club).
  if (seg.all) {
    for (let from = 0; from < 50000; from += 1000) {
      const { data } = await db.from('audience_profiles').select('user_id').range(from, from + 999)
      for (const r of (data || []) as { user_id: string }[]) ids.add(r.user_id)
      if (!data || data.length < 1000) break
    }
  }
  if (!ids.size) return []
  // Όσοι έκλεισαν ήδη στο πλυντήριο μετά από ημερομηνία (π.χ. υπενθύμιση: «μόνο όσοι δεν έκλεισαν»).
  if (seg.exclude_booked_since && c.location_id) {
    const { data: bk } = await db.from('bookings').select('user_id').eq('location_id', c.location_id)
      .gte('created_at', seg.exclude_booked_since).neq('status', 'cancelled')
    for (const r of (bk || []) as { user_id: string | null }[]) if (r.user_id) ids.delete(r.user_id)
  }
  const out: Person[] = []
  const all = [...ids]
  for (let i = 0; i < all.length; i += 300) {
    const { data } = await db.from('audience_profiles').select('user_id, email, can_push, can_email, internal').in('user_id', all.slice(i, i + 300))
    for (const p of (data || []) as (Person & { internal: boolean })[]) if (!p.internal) out.push(p)
  }
  return out
}

/** Ποιοι παίρνουν αυτό το κύμα: push → can_push · email → can_email ΚΑΙ ΟΧΙ can_push. */
export function recipientsFor(people: Person[], channel: string): Person[] {
  if (channel === 'push') return people.filter(p => p.can_push)
  if (channel === 'email') return people.filter(p => p.can_email && !p.can_push && !!p.email)
  return []
}

export function campaignEmailHtml(c: Campaign, userId: string, url: string): string {
  const o = c.offer || {}
  const bullets = (o.bullets || []).map(b => `<tr><td style="padding:5px 0;vertical-align:top;width:22px;color:#19A8C7;font-weight:800;">✓</td><td style="padding:5px 0;color:#374151;font-size:14px;line-height:1.5;">${esc(b)}</td></tr>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#F7FAFC;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(o.preheader || '')}</div>
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 16px;">
    <div style="background:#10182A;border-radius:18px 18px 0 0;padding:28px 28px 22px;text-align:center;">
      <img src="https://washio.gr/logo.png" alt="Washio" width="120" style="display:block;margin:0 auto 6px;" />
      ${o.kicker ? `<p style="margin:0;color:#D4AF37;font-size:12px;font-weight:700;letter-spacing:1.6px;">${esc(o.kicker)}</p>` : ''}
    </div>
    <div style="background:#FFFFFF;border:1px solid #E8EEF2;border-top:none;border-radius:0 0 18px 18px;padding:28px;">
      <h1 style="margin:0 0 14px;color:#10182A;font-size:23px;line-height:1.3;font-weight:800;">${o.headline || esc(c.title)}</h1>
      <p style="margin:0 0 16px;color:#4B5563;font-size:15px;line-height:1.6;">${esc(c.body || '')}</p>
      ${bullets ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse;">${bullets}</table>` : ''}
      <a href="${esc(url)}" style="display:block;background:#19A8C7;color:#FFFFFF;text-align:center;padding:16px;border-radius:14px;text-decoration:none;font-size:16px;font-weight:700;">${esc(o.cta || 'Κλείσε ώρα →')}</a>
      ${o.footnote ? `<p style="margin:18px 0 0;color:#9AA3AF;font-size:12px;line-height:1.6;">${esc(o.footnote)}</p>` : ''}
    </div>
    <p style="margin:16px 0 0;color:#9AA3AF;font-size:11px;line-height:1.5;text-align:center;">Λαμβάνεις αυτό το email επειδή έχεις λογαριασμό στο Washio. Δεν θέλεις τέτοια μηνύματα; ${unsubFooterLink(userId)}.</p>
  </div></body></html>`
}

/** Στέλνει ένα κύμα (ένα κανάλι) σε λίστα παραληπτών. Καταγραφή στο campaign_sends (μία φορά ανά χρήστη/κανάλι). */
export async function sendCampaignTo(db: SupabaseClient, c: Campaign, people: Person[], opts: { record: boolean }) {
  const channel = c.channels[0]
  const base = c.offer?.url || 'https://www.washio.gr/map'
  let sent = 0, skipped = 0, failed = 0
  if (channel === 'push') {
    const url = withUtm(base, 'push', c.id).replace('https://www.washio.gr', '')
    for (const p of people) {
      if (opts.record) {
        const { error } = await db.from('campaign_sends').insert({ campaign_id: c.id, user_id: p.user_id, channel })
        if (error) { skipped++; continue } // ήδη στάλθηκε (unique)
      }
      try { await sendPush(p.user_id, { title: c.title, body: c.body || '', url }); sent++ } catch { failed++ }
    }
  } else if (channel === 'email') {
    const url = withUtm(base, 'email', c.id)
    const todo: Person[] = []
    for (const p of people) {
      if (opts.record) {
        const { error } = await db.from('campaign_sends').insert({ campaign_id: c.id, user_id: p.user_id, channel })
        if (error) { skipped++; continue }
      }
      todo.push(p)
    }
    for (let i = 0; i < todo.length; i += 100) {
      const chunk = todo.slice(i, i + 100)
      try {
        const r = await resend.batch.send(chunk.map(p => ({
          from: 'Washio <noreply@washio.gr>', to: [p.email!], subject: c.title,
          html: campaignEmailHtml(c, p.user_id, url), headers: unsubHeaders(p.user_id),
          tags: [{ name: 'campaign', value: `cmp_${c.id.slice(0, 8)}` }],
        })))
        if (r.error) failed += chunk.length; else sent += chunk.length
      } catch { failed += chunk.length }
    }
  }
  return { sent, skipped, failed }
}
