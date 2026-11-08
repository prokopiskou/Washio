// Ενημερώσεις Washio → πλυντήρια, με επιβεβαίωση ανάγνωσης (supabase/announcements.sql).
// Αποστολή: push (εφαρμογή) + email στον ιδιοκτήτη. Επιμονή: 4 ώρες χωρίς «διάβασα» → 2ο push + SMS.
// 24 ώρες → εμφανίζεται στο admin «Πάρε τηλέφωνο».
import type { SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { sendPush } from '@/lib/push'

const resend = new Resend(process.env.RESEND_API_KEY)
const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export type Announcement = { id: string; title: string; body: string; important: boolean; target_location_ids: string[] | null; created_at: string }

async function ownerContact(db: SupabaseClient, ownerId: string): Promise<{ email: string | null; phone: string | null }> {
  const { data: p } = await db.from('profiles').select('email, phone').eq('id', ownerId).maybeSingle()
  let email = (p?.email as string) || null
  if (!email) { try { const { data } = await db.auth.admin.getUserById(ownerId); email = data?.user?.email || null } catch { /* ignore */ } }
  return { email, phone: (p?.phone as string) || null }
}

export function announcementEmailHtml(a: Pick<Announcement, 'title' | 'body' | 'important'>, locationName: string) {
  return `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:22px;color:#10182A;">
    <p style="margin:0 0 14px;font-weight:800;font-size:18px;">Washio</p>
    ${a.important ? '<p style="margin:0 0 10px;display:inline-block;background:#FEF2F2;color:#B91C1C;font-size:12px;font-weight:700;padding:4px 10px;border-radius:8px;">ΣΗΜΑΝΤΙΚΟ</p>' : ''}
    <h2 style="margin:0 0 12px;font-size:20px;">${esc(a.title)}</h2>
    <p style="margin:0 0 18px;line-height:1.6;white-space:pre-line;">${esc(a.body)}</p>
    <p style="margin:0 0 6px;color:#6B7280;font-size:13px;">Για: ${esc(locationName)}</p>
    <p style="margin:18px 0 0;"><a href="https://www.washio.gr/dashboard?tab=updates" style="display:inline-block;background:#10182A;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:12px;">Άνοιγμα & «Το διάβασα ✓»</a></p>
    <p style="margin:18px 0 0;color:#9CA3AF;font-size:12px;">Πάτησε «Το διάβασα» στο dashboard ώστε να ξέρουμε ότι το έλαβες.</p>
  </div>`
}

/** Δημιουργεί receipts για τα ενεργά πλυντήρια (ή τα επιλεγμένα) και στέλνει push + email. */
export async function sendAnnouncement(db: SupabaseClient, a: Announcement) {
  let q = db.from('locations').select('id, name, owner_id').eq('is_active', true).not('owner_id', 'is', null)
  if (a.target_location_ids?.length) q = q.in('id', a.target_location_ids)
  const { data: locs } = await q
  let sent = 0
  for (const l of (locs || []) as { id: string; name: string; owner_id: string }[]) {
    const { data: rec, error } = await db.from('announcement_receipts')
      .insert({ announcement_id: a.id, location_id: l.id, owner_id: l.owner_id }).select('id').single()
    if (error || !rec) continue
    try { await sendPush(l.owner_id, { title: `${a.important ? '❗ ' : ''}${a.title}`, body: a.body.slice(0, 140), url: '/dashboard?tab=updates' }) } catch { /* best-effort */ }
    try {
      const { email } = await ownerContact(db, l.owner_id)
      if (email) await resend.emails.send({ from: 'Washio <noreply@washio.gr>', to: [email], subject: `${a.important ? '❗ ' : ''}Washio: ${a.title}`, html: announcementEmailHtml(a, l.name) })
    } catch { /* best-effort */ }
    sent++
  }
  return { sent }
}

/** 4 ώρες χωρίς «διάβασα» → 2ο push + SMS (μία φορά). Καλείται από cron. */
export async function remindUnacked(db: SupabaseClient, sms?: (phone: string, text: string) => Promise<unknown>) {
  const cutoff = new Date(Date.now() - 4 * 3600_000).toISOString()
  const { data } = await db.from('announcement_receipts')
    .select('id, owner_id, location_id, announcements(title, important), locations(name)')
    .is('acked_at', null).is('reminded_at', null).lte('sent_at', cutoff).limit(100)
  let reminded = 0
  for (const r of (data || []) as unknown as { id: string; owner_id: string; announcements: { title: string; important: boolean } | null; locations: { name: string } | null }[]) {
    const { data: claimed } = await db.from('announcement_receipts').update({ reminded_at: new Date().toISOString() }).eq('id', r.id).is('reminded_at', null).select('id')
    if (!claimed?.length) continue
    const title = r.announcements?.title || 'Νέα ενημέρωση'
    try { await sendPush(r.owner_id, { title: `Δεν έχεις διαβάσει: ${title}`, body: 'Άνοιξε το dashboard και πάτα «Το διάβασα ✓».', url: '/dashboard?tab=updates' }) } catch { /* ignore */ }
    if (sms) {
      try {
        const { phone } = await ownerContact(db, r.owner_id)
        if (phone) { await sms(phone, `Washio: νέα ενημέρωση «${title.slice(0, 60)}». Δες την στο washio.gr/dashboard και πάτα «Το διάβασα».`); await db.from('announcement_receipts').update({ sms_at: new Date().toISOString() }).eq('id', r.id) }
      } catch { /* ignore */ }
    }
    reminded++
  }
  return { reminded }
}
