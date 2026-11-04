import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'

// Αποστολή μηνιαίων εκκαθαρίσεων (PDF) στα πλυντήρια.
//  GET  → λίστα πλυντηρίων { id, name, owner } για αντιστοίχιση αρχείων
//  POST multipart: mode=test|send, month, items=[{locationId, amount}], files[] (ίδια σειρά)
//   Μία κλήση = ΕΝΑΣ ιδιοκτήτης (π.χ. Nitro+Nikolaou+Toxic μαζί σε ένα email).
//   amount > 0 → χρωστάει στο Washio (Revolut link) · amount < 0 → του χρωστάμε εμείς.
export const maxDuration = 60

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const resend = new Resend(process.env.RESEND_API_KEY)
const REVOLUT = 'prokopis0'
const DUE = '15/11'

async function requireAdmin() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  return user && isAdminEmail(user.email) ? user : null
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const { data } = await admin.from('locations').select('id, name, owner_id').eq('is_active', true).order('name')
  return NextResponse.json({ locations: (data || []).map(l => ({ id: l.id, name: String(l.name).trim(), owner: l.owner_id })) })
}

const eur = (n: number) => n.toFixed(2).replace('.', ',') + '€'
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

function html(month: string, rows: { name: string; amount: number }[]) {
  const total = Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100
  const owe = total > 0
  const link = `https://revolut.me/${REVOLUT}?currency=EUR&amount=${Math.round(total * 100)}`
  const names = rows.map(r => esc(r.name)).join(', ')
  const list = rows.length > 1
    ? `<table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:14px;">${rows.map(r =>
      `<tr><td style="padding:7px 0;border-bottom:1px solid #EEF1F4;color:#374151;">${esc(r.name)}</td><td style="padding:7px 0;border-bottom:1px solid #EEF1F4;text-align:right;color:#10182A;font-weight:600;">${eur(r.amount)}</td></tr>`).join('')}
      <tr><td style="padding:9px 0;color:#10182A;font-weight:800;">Σύνολο</td><td style="padding:9px 0;text-align:right;color:#078EAD;font-weight:800;">${eur(total)}</td></tr></table>`
    : ''
  const box = owe
    ? `<div style="background:#EAF8FB;border:1px solid #CFECF3;border-radius:14px;padding:16px;margin:0 0 18px;">
         <p style="margin:0;color:#6F7785;font-size:12px;font-weight:600;">Προμήθεια Washio · ${esc(month)}</p>
         <p style="margin:4px 0 0;color:#10182A;font-size:26px;font-weight:800;">${eur(total)}</p>
         <p style="margin:4px 0 0;color:#6F7785;font-size:12px;">Πληρωμή έως ${DUE}</p>
       </div>
       <p style="margin:0 0 10px;color:#374151;font-size:14px;line-height:1.5;text-align:center;">Μπορείς να πληρώσεις την προμήθεια με την <b>χρεωστική ή πιστωτική κάρτα</b> σου, με ένα πάτημα:</p>
       <a href="${link}" style="display:block;background:#19A8C7;color:#fff;text-align:center;padding:15px;border-radius:14px;text-decoration:none;font-size:16px;font-weight:700;">Πληρωμή με Revolut · ${eur(total)} →</a>
       <p style="margin:10px 0 0;color:#9AA3AF;font-size:12px;text-align:center;">Ή σκάναρε το QR μέσα στο PDF. Το ποσό είναι ήδη συμπληρωμένο.</p>`
    : `<div style="background:#E7F6EF;border:1px solid #C9EBDB;border-radius:14px;padding:16px;margin:0 0 18px;">
         <p style="margin:0;color:#0F7A5C;font-size:12px;font-weight:600;">Σου οφείλουμε · ${esc(month)}</p>
         <p style="margin:4px 0 0;color:#10182A;font-size:26px;font-weight:800;">${eur(-total)}</p>
         <p style="margin:6px 0 0;color:#374151;font-size:13px;line-height:1.5;">Από πληρωμές με κάρτα μέσω Washio, μετά την προμήθεια. Θα τα μεταφέρουμε στον λογαριασμό σου έως ${DUE}. Αν δεν μας έχεις δώσει IBAN, απάντησε σε αυτό το email.</p>
       </div>`
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#F7FAFC;">
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px 16px;">
    <div style="background:#10182A;border-radius:18px 18px 0 0;padding:26px 28px 20px;text-align:center;">
      <img src="https://washio.gr/logo.png" alt="Washio" width="110" style="display:block;margin:0 auto 6px;" />
      <p style="margin:0;color:#19A8C7;font-size:12px;font-weight:700;letter-spacing:1.6px;">ΕΚΚΑΘΑΡΙΣΗ ${esc(month.toUpperCase())}</p>
    </div>
    <div style="background:#fff;border:1px solid #E8EEF2;border-top:none;border-radius:0 0 18px 18px;padding:26px 28px;">
      <p style="margin:0 0 12px;color:#10182A;font-size:16px;font-weight:700;">Γεια σου,</p>
      <p style="margin:0 0 18px;color:#4B5563;font-size:15px;line-height:1.6;">Σου στέλνουμε την εκκαθάριση ${esc(month)} για ${names}. Στο συνημμένο PDF θα βρεις κάθε κράτηση που σου έφερε το Washio, την προμήθεια ανά κράτηση και το σύνολο.</p>
      ${list}
      ${box}
      <p style="margin:16px 0 0;color:#374151;font-size:13px;line-height:1.6;">Για οποιαδήποτε ασυμφωνία, επικοινώνησε τηλεφωνικά στο <a href="tel:6986150513" style="color:#078EAD;font-weight:700;text-decoration:none;">698 615 0513</a>.</p>
      <div style="margin:22px 0 0;padding:18px;border-radius:14px;background:#F7FAFC;border:1px solid #E8EEF2;">
        <p style="margin:0 0 6px;color:#10182A;font-size:15px;font-weight:800;">Νέο: check-in με QR</p>
        <p style="margin:0 0 12px;color:#4B5563;font-size:13px;line-height:1.6;">Κάθε πελάτης λαμβάνει πλέον ένα <b>QR με την κράτησή του</b> και το δείχνει όταν φτάνει στο πλυντήριο. Εσείς το σκανάρετε και η κράτηση περνάει αυτόματα «Ήρθε».</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:13px;color:#374151;line-height:1.55;">
          <tr><td style="padding:4px 10px 4px 0;vertical-align:top;font-weight:800;color:#078EAD;">1</td><td style="padding:4px 0;"><b>Κάντε ενημέρωση την εφαρμογή Washio</b> από το App Store (iPhone) ή το Play Store (Android).</td></tr>
          <tr><td style="padding:4px 10px 4px 0;vertical-align:top;font-weight:800;color:#078EAD;">2</td><td style="padding:4px 0;">Ανοίξτε το dashboard του πλυντηρίου. <b>Πάνω δεξιά</b> θα δείτε ένα <b>εικονίδιο κάμερας 📷</b>.</td></tr>
          <tr><td style="padding:4px 10px 4px 0;vertical-align:top;font-weight:800;color:#078EAD;">3</td><td style="padding:4px 0;">Όταν έρθει ο πελάτης, πατήστε την κάμερα και σκανάρετε το QR από το κινητό του. Η κράτηση περνάει «Ήρθε», δεν χρειάζεται να πατήσετε τίποτε άλλο.</td></tr>
        </table>
        <p style="margin:14px 0 6px;color:#10182A;font-size:13px;font-weight:800;">Δεν είστε εσείς στο πλυντήριο;</p>
        <p style="margin:0;color:#4B5563;font-size:13px;line-height:1.6;">Στείλτε έναν σύνδεσμο στους υπαλλήλους σας: <b>Dashboard → Ρυθμίσεις → Σκάνερ καταστήματος → «Στείλε το link»</b> (Viber, WhatsApp ή SMS). Μόλις τον ανοίξουν, εμφανίζεται η ίδια κάμερα στο <b>δικό τους κινητό</b> και σκανάρουν τις κρατήσεις, <b>χωρίς πρόσβαση στο dashboard σας</b> (δεν βλέπουν έσοδα ούτε ρυθμίσεις). Αν φύγει κάποιος υπάλληλος, πατήστε «Νέο link» και ο παλιός σταματά αμέσως.</p>
      </div>
      <p style="margin:20px 0 0;color:#6B7280;font-size:13px;line-height:1.6;">Ευχαριστούμε για τη συνεργασία.</p>
      <p style="margin:6px 0 0;color:#10182A;font-size:13px;font-weight:600;">Η ομάδα του Washio</p>
    </div>
  </div></body></html>`
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const fd = await req.formData()
  const mode = fd.get('mode') === 'send' ? 'send' : 'test'
  const month = String(fd.get('month') || 'Οκτωβρίου 2026')
  const items = JSON.parse(String(fd.get('items') || '[]')) as { locationId: string; amount: number }[]
  const files = fd.getAll('files').filter((f): f is File => typeof f !== 'string')
  if (!items.length || items.length !== files.length) return NextResponse.json({ error: 'Λάθος αρχεία' }, { status: 400 })

  const { data: locs } = await admin.from('locations').select('id, name, owner_id').in('id', items.map(i => i.locationId))
  const owners = new Set((locs || []).map(l => l.owner_id))
  if (!locs?.length || owners.size !== 1) return NextResponse.json({ error: 'Τα αρχεία πρέπει να είναι του ίδιου ιδιοκτήτη' }, { status: 400 })
  const ownerId = [...owners][0] as string
  const { data: ou } = await admin.auth.admin.getUserById(ownerId)
  const to = ou?.user?.email
  if (!to) return NextResponse.json({ error: 'Ο ιδιοκτήτης δεν έχει email' }, { status: 400 })

  const byId = new Map(locs.map(l => [l.id as string, String(l.name).trim()]))
  const rows = items.map(i => ({ name: byId.get(i.locationId) || '', amount: Number(i.amount) || 0 }))
  const attachments = await Promise.all(files.map(async f => ({ filename: f.name, content: Buffer.from(await f.arrayBuffer()).toString('base64') })))
  const subject = `Washio · Εκκαθάριση ${month} · ${rows.map(r => r.name).join(', ')}`

  const { error } = await resend.emails.send({
    from: 'Washio <noreply@washio.gr>',
    to: mode === 'send' ? to : user.email!,
    replyTo: 'support@washio.gr',
    subject: (mode === 'test' ? '[ΔΟΚΙΜΗ] ' : '') + subject,
    html: html(month, rows),
    attachments,
    tags: [{ name: 'campaign', value: 'statement_' + month.replace(/\W+/g, '_').slice(0, 40) }],
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, sentTo: mode === 'send' ? to.replace(/^(.{2}).*(@.*)$/, '$1***$2') : 'εσένα', subject })
}
