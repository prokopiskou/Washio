import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { sendPush } from '@/lib/push'
import { ADMIN_EMAILS } from '@/lib/admins'

// Meta Lead Ads → Washio. Κάθε νέα αίτηση από τη φόρμα «Washio Συνεργάτες – Πλυντήρια»:
//   1) γράφεται στις «Αιτήσεις» του admin (πίνακας applications, wash_type = 'Meta lead')
//   2) push + email στους admins ΤΗ ΣΤΙΓΜΗ που έρχεται → τηλέφωνο την ίδια μέρα.
// Env (Vercel): META_LEADS_VERIFY_TOKEN (δικό μας τυχαίο), META_APP_SECRET, META_PAGE_TOKEN (leads_retrieval).
export const maxDuration = 30

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const resend = new Resend(process.env.RESEND_API_KEY)
const GRAPH = 'https://graph.facebook.com/v21.0'

// Επαλήθευση webhook (μία φορά, όταν το συνδέεις στο Meta App).
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === process.env.META_LEADS_VERIFY_TOKEN) {
    return new NextResponse(p.get('hub.challenge') || '', { status: 200 })
  }
  return new NextResponse('Forbidden', { status: 403 })
}

type Field = { name: string; values: string[] }

function pick(fields: Field[], ...keys: string[]): string {
  for (const f of fields) {
    const n = f.name.toLowerCase()
    if (keys.some(k => n === k || n.includes(k))) return (f.values || []).join(', ').trim()
  }
  return ''
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  // Υπογραφή Meta (X-Hub-Signature-256) — αλλιώς οποιοσδήποτε θα μπορούσε να στείλει ψεύτικες αιτήσεις.
  const secret = process.env.META_APP_SECRET
  const sig = req.headers.get('x-hub-signature-256') || ''
  if (secret) {
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex')
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return new NextResponse('Bad signature', { status: 401 })
    }
  }
  let body: { entry?: { changes?: { field?: string; value?: { leadgen_id?: string; form_id?: string; ad_id?: string } }[] }[] } = {}
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }

  const token = process.env.META_PAGE_TOKEN
  const leads = (body.entry || []).flatMap(e => e.changes || []).filter(c => c.field === 'leadgen' && c.value?.leadgen_id)
  for (const c of leads) {
    const id = c.value!.leadgen_id!
    let fields: Field[] = []
    let formName = ''
    if (token) {
      try {
        const r = await fetch(`${GRAPH}/${id}?fields=created_time,field_data,form_id,ad_name&access_token=${encodeURIComponent(token)}`)
        const j = await r.json()
        fields = (j.field_data || []) as Field[]
        formName = j.ad_name || ''
      } catch { /* συνεχίζουμε με ό,τι έχουμε */ }
    }
    const name = pick(fields, 'full_name', 'όνομα')
    const phone = pick(fields, 'phone_number', 'phone', 'τηλέφωνο')
    const email = pick(fields, 'email')
    const business = pick(fields, 'πλυντηρ', 'όνομα_και', 'περιοχή')
    const cars = pick(fields, 'αυτοκίνητα', 'πόσα')

    // Αν δεν μπορέσαμε να διαβάσουμε τα στοιχεία (λείπει token), κράτα τουλάχιστον το lead id.
    const { error } = await admin.from('applications').insert({
      business_name: business || `Meta lead ${id}`,
      owner_name: name || null,
      phone: phone || null,
      email: email || null,
      lanes: cars || null,
      wash_type: 'Meta lead',
      status: 'pending',
    })
    if (error) console.error('meta lead insert', error.message)

    const summary = [business || 'Πλυντήριο', name, phone, cars ? `${cars} αυτ./μέρα` : ''].filter(Boolean).join(' · ')

    // Push στους admins (όσοι έχουν ενεργές ειδοποιήσεις).
    try {
      const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const ids = (users?.users || []).filter(u => u.email && ADMIN_EMAILS.includes(u.email.toLowerCase())).map(u => u.id)
      await Promise.all(ids.map(uid => sendPush(uid, { title: '🧽 Νέο πλυντήριο ενδιαφέρεται', body: summary, url: '/admin?tab=applications' })))
    } catch { /* best-effort */ }

    // Email στους admins.
    try {
      await resend.emails.send({
        from: 'Washio <noreply@washio.gr>',
        to: ADMIN_EMAILS,
        subject: `🧽 Νέα αίτηση πλυντηρίου · ${business || name || 'Meta lead'}`,
        html: `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px;">
          <h2 style="margin:0 0 12px;color:#10182A;">Νέα αίτηση από διαφήμιση</h2>
          <table style="width:100%;font-size:14px;border-collapse:collapse;">
            <tr><td style="color:#6B7280;padding:6px 0;">Πλυντήριο / περιοχή</td><td style="text-align:right;font-weight:600;">${business || '—'}</td></tr>
            <tr><td style="color:#6B7280;padding:6px 0;">Όνομα</td><td style="text-align:right;font-weight:600;">${name || '—'}</td></tr>
            <tr><td style="color:#6B7280;padding:6px 0;">Κινητό</td><td style="text-align:right;font-weight:600;">${phone ? `<a href="tel:${phone}">${phone}</a>` : '—'}</td></tr>
            <tr><td style="color:#6B7280;padding:6px 0;">Email</td><td style="text-align:right;">${email || '—'}</td></tr>
            <tr><td style="color:#6B7280;padding:6px 0;">Αυτοκίνητα/μέρα</td><td style="text-align:right;">${cars || '—'}</td></tr>
          </table>
          <p style="margin:16px 0 0;color:#B45309;font-weight:600;">Πάρε τηλέφωνο σήμερα — μετά από 24 ώρες «κρυώνει».</p>
          <p style="margin:8px 0 0;font-size:12px;color:#9CA3AF;">Lead ${id}${formName ? ' · ' + formName : ''}</p>
        </div>`,
      })
    } catch { /* best-effort */ }
  }
  return NextResponse.json({ ok: true, leads: leads.length })
}
