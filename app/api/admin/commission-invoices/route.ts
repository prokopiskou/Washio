import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'
import { isInternalEmail } from '@/lib/internal'
import { oxygen, ensureContact, vat24Id, OxygenError } from '@/lib/oxygen'

// Τιμολόγιο προμήθειας Washio → πλυντήριο, μέσω Oxygen. Ένα ανά πλυντήριο ανά μήνα.
// Τιμολογείται ΟΛΗ η προμήθεια του μήνα (κάρτα + μετρητά) — το «εξόφληση» είναι μόνο ο τρόπος
// που τακτοποιήθηκε (πληρωμή από το πλυντήριο ή συμψηφισμός με εισπράξεις καρτών).
//  GET  ?month=YYYY-MM  → πλυντήρια με προμήθεια, ΑΦΜ, κατάσταση τιμολογίου
//  GET  ?check=1        → έλεγχος σύνδεσης Oxygen + ΦΠΑ / τρόποι πληρωμής / σειρές (για ρύθμιση)
//  POST { action:'issue', locationId, month, settlement: 'paid'|'offset', afm? }
//        → τιμολόγιο ΑΝΕΞΟΦΛΗΤΟ («Επί πιστώσει») + email PDF στο πλυντήριο με το ποσό προς πληρωμή.
//          settlement='offset' (π.χ. Pit Stop — του χρωστάμε) → εξοφλείται αμέσως με συμψηφισμό.
//  POST { action:'pay', locationId, month } → Απόδειξη Είσπραξης έναντι του τιμολογίου (τράπεζα) + email επιβεβαίωσης.
// Ροή: κάθε αρχή μήνα «Έκδοση» για τον προηγούμενο μήνα (όλα τα πλυντήρια) · «Εξόφληση» όταν έρθουν τα χρήματα.
export const maxDuration = 60

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const resend = new Resend(process.env.RESEND_API_KEY)
const VAT = 0.24
const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος']
const MONTHS_GEN = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου']

async function requireAdmin() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  return user && isAdminEmail(user.email) ? user : null
}

const r2 = (n: number) => Math.round(n * 100) / 100
const eur = (n: number) => n.toFixed(2).replace('.', ',') + '€'
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const athensToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(new Date())

function monthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Λάθος μήνας')
  const [y, m] = month.split('-').map(Number)
  const end = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(end).padStart(2, '0')}`, label: `${MONTHS[m - 1]} ${y}`, gen: `${MONTHS_GEN[m - 1]} ${y}` }
}

/** Προμήθεια μήνα ανά πλυντήριο: άθροισμα platform_fee, χωρίς ακυρώσεις / no-show / κρατήσεις ομάδας. */
async function commissions(month: string, locationId?: string) {
  const { from, to } = monthRange(month)
  let q = admin.from('bookings')
    .select('location_id, platform_fee, profiles(email)')
    .gte('slot_date', from).lte('slot_date', to)
    .not('status', 'in', '(cancelled,no_show)')
  if (locationId) q = q.eq('location_id', locationId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  const out = new Map<string, { gross: number; count: number }>()
  for (const b of (data || []) as unknown as { location_id: string; platform_fee: number | null; profiles: { email?: string } | null }[]) {
    if (isInternalEmail(b.profiles?.email)) continue
    // Μόνο κρατήσεις με προμήθεια: οι χειροκίνητες του πλυντηρίου (δικοί του πελάτες) έχουν 0.
    if (!(Number(b.platform_fee) > 0)) continue
    const cur = out.get(b.location_id) || { gross: 0, count: 0 }
    cur.gross += Number(b.platform_fee) || 0
    cur.count += 1
    out.set(b.location_id, cur)
  }
  for (const [k, v] of out) { v.gross = r2(v.gross); if (v.gross <= 0) out.delete(k) }
  return out
}

async function ownerContact(ownerId: string | null) {
  if (!ownerId) return { email: null as string | null, phone: null as string | null }
  const { data } = await admin.auth.admin.getUserById(ownerId)
  const { data: p } = await admin.from('profiles').select('phone').eq('id', ownerId).maybeSingle()
  return { email: data?.user?.email || null, phone: (p?.phone as string) || null }
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const sp = req.nextUrl.searchParams

  if (sp.get('check')) {
    try {
      const [info, taxes, pms, seqs] = await Promise.all([oxygen.info(), oxygen.taxes(), oxygen.paymentMethods(), oxygen.sequences()])
      return NextResponse.json({
        ok: true, info,
        taxes: taxes.map(t => ({ id: t.id, title: t.title || t.name, rate: t.rate ?? t.value })),
        paymentMethods: pms.map(p => ({ id: p.id, title: p.title_gr || p.title || p.name, mydata: p.mydata_code })),
        sequences: seqs.map(s => ({ id: s.id, title: s.title || s.name, type: s.document_type || s.type, series: s.series })),
        configured: {
          paymentMethod: !!process.env.OXYGEN_PAYMENT_METHOD_ID,
          offsetPaymentMethod: !!process.env.OXYGEN_OFFSET_PAYMENT_METHOD_ID,
          tax: !!process.env.OXYGEN_TAX_ID, sequence: !!process.env.OXYGEN_NUMBERING_SEQUENCE_ID,
          url: process.env.OXYGEN_API_URL || 'https://api.oxygen.gr/v1 (production)',
        },
      })
    } catch (e) {
      return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Oxygen' }, { status: 200 })
    }
  }

  const month = sp.get('month') || ''
  try {
    const sums = await commissions(month)
    const ids = [...sums.keys()]
    const [{ data: locs }, { data: inv }] = await Promise.all([
      admin.from('locations').select('id, name, afm, owner_id').in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
      admin.from('commission_invoices').select('location_id, status, invoice_number, mydata_mark, settlement, emailed_to, error, gross, paid_at').eq('month', month),
    ])
    const rows = await Promise.all((locs || []).map(async l => {
      const s = sums.get(l.id)!
      const i = (inv || []).find(x => x.location_id === l.id)
      const { email } = await ownerContact(l.owner_id)
      return {
        locationId: l.id, name: String(l.name).trim(), afm: l.afm || '', email,
        bookings: s.count, gross: s.gross, net: r2(s.gross / (1 + VAT)), vat: r2(s.gross - s.gross / (1 + VAT)),
        invoice: i || null,
      }
    }))
    rows.sort((a, b) => a.name.localeCompare(b.name, 'el'))
    return NextResponse.json({ month, rows })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Σφάλμα' }, { status: 400 })
  }
}

const DUE_DAY = 15

function mailShell(inner: string) {
  return `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#10182A;">${inner}
    <p style="margin:18px 0 0;font-size:13px;color:#6B7280;">Για οποιαδήποτε απορία: 6986150513 · support@washio.gr</p></div>`
}
function amountsTable(count: number, net: number, vat: number, gross: number) {
  return `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;margin:0 0 16px;">
    <tr><td style="padding:6px 0;color:#6B7280;">Κρατήσεις</td><td style="text-align:right;">${count}</td></tr>
    <tr><td style="padding:6px 0;color:#6B7280;">Καθαρή αξία</td><td style="text-align:right;">${eur(net)}</td></tr>
    <tr><td style="padding:6px 0;color:#6B7280;">ΦΠΑ 24%</td><td style="text-align:right;">${eur(vat)}</td></tr>
    <tr><td style="padding:8px 0;font-weight:700;border-top:1px solid #E5E7EB;">Σύνολο</td><td style="text-align:right;font-weight:700;border-top:1px solid #E5E7EB;">${eur(gross)}</td></tr>
  </table>`
}
function nextMonthDue(month: string) {
  const [y, m] = month.split('-').map(Number)
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1
  return `${DUE_DAY}/${nm}/${ny}`
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { action?: string; locationId?: string; month?: string; settlement?: string; afm?: string }
  const { locationId, month = '' } = body
  const action = body.action === 'pay' ? 'pay' : 'issue'
  if (!locationId) return NextResponse.json({ error: 'Λείπει πλυντήριο' }, { status: 400 })

  let range: ReturnType<typeof monthRange>
  try { range = monthRange(month) } catch { return NextResponse.json({ error: 'Λάθος μήνας' }, { status: 400 }) }
  // Τιμολογούμε μόνο ΚΛΕΙΣΤΟ μήνα (η προμήθεια του τρέχοντος αλλάζει ακόμα).
  if (range.to >= athensToday()) return NextResponse.json({ error: 'Ο μήνας δεν έχει τελειώσει ακόμα' }, { status: 400 })

  const { data: loc } = await admin.from('locations').select('id, name, afm, owner_id').eq('id', locationId).maybeSingle()
  if (!loc) return NextResponse.json({ error: 'Δεν βρέθηκε πλυντήριο' }, { status: 404 })
  const name = String(loc.name).trim()
  const owner = await ownerContact(loc.owner_id)
  const { data: existing } = await admin.from('commission_invoices').select('*').eq('location_id', loc.id).eq('month', month).maybeSingle()

  // ── ΕΞΟΦΛΗΣΗ ─────────────────────────────────────────────
  if (action === 'pay') {
    if (!existing?.oxygen_invoice_id) return NextResponse.json({ error: 'Δεν έχει εκδοθεί τιμολόγιο για αυτόν τον μήνα' }, { status: 400 })
    if (existing.paid_at) return NextResponse.json({ error: 'Έχει ήδη εξοφληθεί' }, { status: 409 })
    const pm = process.env.OXYGEN_PAYMENT_METHOD_ID
    if (!pm) return NextResponse.json({ error: 'Λείπει το OXYGEN_PAYMENT_METHOD_ID' }, { status: 500 })
    try {
      const rc = await oxygen.payInvoice(existing.oxygen_invoice_id, { payment_method_id: pm, description: `Εξόφληση προμήθειας Washio ${range.label}` })
      await admin.from('commission_invoices').update({ status: 'paid', paid_at: new Date().toISOString(), oxygen_receipt_id: String(rc.id), error: null, updated_at: new Date().toISOString() }).eq('id', existing.id)
      if (owner.email) {
        await resend.emails.send({
          from: 'Washio <noreply@washio.gr>', to: [owner.email], bcc: ['support@washio.gr'], replyTo: 'support@washio.gr',
          subject: `Λάβαμε την πληρωμή σας · ${range.label} · ${name}`,
          html: mailShell(`<h2 style="margin:0 0 12px;font-size:20px;">Ευχαριστούμε! ✓</h2>
            <p style="margin:0;font-size:15px;line-height:1.5;">Λάβαμε την πληρωμή <b>${eur(Number(existing.gross))}</b> για την προμήθεια ${esc(range.gen)} (${esc(name)}, τιμολόγιο ${esc(existing.invoice_number || '')}). Το τιμολόγιο είναι πλέον εξοφλημένο.</p>`),
        }).catch(() => {})
      }
      return NextResponse.json({ ok: true, paid: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Σφάλμα'
      await admin.from('commission_invoices').update({ error: msg, updated_at: new Date().toISOString() }).eq('id', existing.id)
      return NextResponse.json({ error: msg }, { status: 502 })
    }
  }

  // ── ΕΚΔΟΣΗ ───────────────────────────────────────────────
  const settlement = body.settlement === 'offset' ? 'offset' : 'paid'
  const afm = String(body.afm || loc.afm || '').replace(/\D/g, '')
  if (afm.length !== 9) return NextResponse.json({ error: 'Λείπει ή είναι λάθος το ΑΦΜ του πλυντηρίου' }, { status: 422 })
  if (afm !== (loc.afm || '')) await admin.from('locations').update({ afm }).eq('id', loc.id)

  const s = (await commissions(month, loc.id)).get(loc.id)
  if (!s || s.gross <= 0) return NextResponse.json({ error: 'Δεν υπάρχει προμήθεια για αυτόν τον μήνα' }, { status: 400 })
  const gross = s.gross, net = r2(gross / (1 + VAT)), vat = r2(gross - net)

  if (existing?.status === 'emailed' || existing?.status === 'paid') {
    return NextResponse.json({ error: `Έχει ήδη εκδοθεί (${existing.invoice_number || existing.oxygen_invoice_id})` }, { status: 409 })
  }
  if (existing && !existing.oxygen_invoice_id && existing.status === 'pending' && Date.now() - new Date(existing.updated_at).getTime() < 120_000) {
    return NextResponse.json({ error: 'Εκδίδεται ήδη — περίμενε λίγο' }, { status: 409 })
  }
  let rowId = existing?.id as string | undefined
  if (!existing) {
    const { data: ins, error } = await admin.from('commission_invoices').insert({
      location_id: loc.id, month, bookings_count: s.count, gross, net, vat, settlement, status: 'pending', created_by: user.email,
    }).select('id').single()
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'Εκδίδεται ήδη' : error.message }, { status: 409 })
    rowId = ins.id
  } else {
    await admin.from('commission_invoices').update({ status: existing.oxygen_invoice_id ? existing.status : 'pending', settlement, error: null, updated_at: new Date().toISOString() }).eq('id', rowId!)
  }

  let invoiceId = existing?.oxygen_invoice_id as string | undefined
  let number = existing?.invoice_number as string | undefined
  let paidNow = !!existing?.paid_at
  try {
    if (!invoiceId) {
      const creditPm = process.env.OXYGEN_OFFSET_PAYMENT_METHOD_ID   // «Επί πιστώσει»
      if (!creditPm) throw new OxygenError('Λείπει το OXYGEN_OFFSET_PAYMENT_METHOD_ID (Επί πιστώσει)', 500)
      const contactId = await ensureContact({ vat: afm, email: owner.email, phone: owner.phone, fallbackName: name })
      const taxId = await vat24Id()
      const inv = await oxygen.createInvoice({
        ...(process.env.OXYGEN_NUMBERING_SEQUENCE_ID ? { numbering_sequence_id: process.env.OXYGEN_NUMBERING_SEQUENCE_ID } : {}),
        issue_date: athensToday(),
        document_type: 's',
        mydata_document_type: '2.1',
        language: 'el',
        payment_method_id: creditPm,
        contact_id: contactId,
        is_paid: false,
        description: `Προμήθεια Washio ${range.label}`,
        comments: settlement === 'offset'
          ? `Προμήθεια διαμεσολάβησης κρατήσεων μέσω Washio, ${range.gen}. Εξοφλείται με συμψηφισμό με εισπράξεις καρτών.`
          : `Προμήθεια διαμεσολάβησης κρατήσεων μέσω Washio, ${range.gen}. Πληρωμή έως ${nextMonthDue(month)}.`,
        items: [{
          description: `Προμήθεια διαμεσολάβησης κρατήσεων Washio — ${range.label}`,
          extra_description: `${name} · ${s.count} κρατήσεις`,
          quantity: 1, unit_net_value: net, net_amount: net, vat_amount: vat, tax_id: taxId,
          mydata_classification_category: process.env.OXYGEN_MYDATA_CATEGORY || 'category1_3',
          mydata_classification_type: process.env.OXYGEN_MYDATA_TYPE || 'E3_561_001',
        }],
      })
      invoiceId = String(inv.id)
      const full = await oxygen.invoice(invoiceId).catch(() => inv) as Record<string, unknown>
      number = [full.sequence ?? full.series ?? '', full.number ?? ''].filter(Boolean).join(' ') || String(full.number || '')
      const mark = String((full.mydata_mark ?? full.mark ?? '') || '') || null
      await admin.from('commission_invoices').update({
        status: 'issued', oxygen_invoice_id: invoiceId, invoice_number: number || null, mydata_mark: mark,
        bookings_count: s.count, gross, net, vat, updated_at: new Date().toISOString(),
      }).eq('id', rowId!)
    }

    // Συμψηφισμός → εξόφληση αμέσως (απόδειξη είσπραξης με τον τρόπο του τιμολογίου).
    if (settlement === 'offset' && !paidNow) {
      const rc = await oxygen.payInvoice(invoiceId, { description: `Συμψηφισμός προμήθειας Washio ${range.label} με εισπράξεις καρτών` })
      await admin.from('commission_invoices').update({ status: 'issued', paid_at: new Date().toISOString(), oxygen_receipt_id: String(rc.id), updated_at: new Date().toISOString() }).eq('id', rowId!)
      paidNow = true
    }

    if (!owner.email) throw new Error('Το τιμολόγιο εκδόθηκε, αλλά δεν βρέθηκε email ιδιοκτήτη')
    const pdf = await oxygen.invoicePdf(invoiceId)
    const status = paidNow
      ? `<p style="margin:0;font-size:14px;color:#047857;font-weight:600;">✓ Εξοφλείται με συμψηφισμό με τις εισπράξεις καρτών — δεν χρειάζεται να πληρώσετε κάτι.</p>`
      : `<p style="margin:0;font-size:14px;color:#B45309;font-weight:600;">Ποσό προς πληρωμή: ${eur(gross)} έως ${nextMonthDue(month)}.</p>
         <p style="margin:6px 0 0;font-size:13px;color:#6B7280;">Ο τρόπος πληρωμής είναι όπως στο email εκκαθάρισης.</p>`
    const { error: mailErr } = await resend.emails.send({
      from: 'Washio <noreply@washio.gr>', to: [owner.email], bcc: ['support@washio.gr'], replyTo: 'support@washio.gr',
      subject: `Τιμολόγιο προμήθειας Washio · ${range.label} · ${name}`,
      html: mailShell(`<h2 style="margin:0 0 12px;font-size:20px;">Τιμολόγιο προμήθειας · ${esc(range.label)}</h2>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">Καλησπέρα,<br>σας επισυνάπτουμε το τιμολόγιο παροχής υπηρεσιών για την προμήθεια των κρατήσεων μέσω Washio στο <b>${esc(name)}</b>.</p>
        ${amountsTable(s.count, net, vat, gross)}${status}`),
      attachments: [{ filename: `Washio_Τιμολόγιο_${month}_${name.replace(/[^\p{L}\p{N}]+/gu, '_')}.pdf`, content: pdf.toString('base64') }],
    })
    if (mailErr) throw new Error('Email: ' + mailErr.message)
    await admin.from('commission_invoices').update({ status: paidNow ? 'paid' : 'emailed', emailed_to: owner.email, error: null, updated_at: new Date().toISOString() }).eq('id', rowId!)
    return NextResponse.json({ ok: true, invoiceId, number, gross, net, vat, paid: paidNow, emailedTo: owner.email })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Σφάλμα'
    await admin.from('commission_invoices').update({ status: invoiceId ? 'issued' : 'failed', error: msg, updated_at: new Date().toISOString() }).eq('id', rowId!)
    return NextResponse.json({ error: msg, issued: !!invoiceId }, { status: e instanceof OxygenError ? (e.status >= 400 && e.status < 600 ? e.status : 502) : 500 })
  }
}
