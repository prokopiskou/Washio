// Ηλεκτρονικό Συμφωνητικό Συνεργασίας — αποστολή, OTP, υπογραφή, ενεργοποίηση.
// Νομικά: απλή ηλεκτρονική υπογραφή (eIDAS) με επιβεβαίωση ταυτότητας OTP στο email + audit trail + SHA-256.
import { createHash, randomBytes, randomInt } from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { ADMIN_EMAILS } from '@/lib/admins'
import { CONTRACT_VERSION, renderContract, commissionSummary, type ContractFields } from '@/lib/contract-text'
import { buildContractPdf } from '@/lib/contract-pdf'
import { activateOnboarding } from '@/lib/onboarding-activate'

export const contractsDb = (): SupabaseClient => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const resend = new Resend(process.env.RESEND_API_KEY)
const SITE = 'https://www.washio.gr'
const FROM = 'Washio <noreply@washio.gr>'
const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const sha = (b: string | Uint8Array) => createHash('sha256').update(b).digest('hex')
const pepper = () => process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'washio'

export const todayAthens = () => new Intl.DateTimeFormat('el-GR', { timeZone: 'Europe/Athens', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date())

export type ContractRow = {
  id: string; application_id: string | null; token: string; status: string; version: string; fields: ContractFields
  email: string; phone: string | null; iban: string | null; sent_at: string; washio_signed_at: string; signed_at: string | null
  otp_hash: string | null; otp_expires_at: string | null; otp_attempts: number; otp_sends: number; signer_name: string | null
  pdf_path: string | null; location_id: string | null
}

const shell = (title: string, body: string) => `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#10182A;">
  <p style="margin:0 0 18px;font-weight:800;font-size:18px;letter-spacing:-0.3px;">Washio</p>
  <h2 style="margin:0 0 12px;font-size:20px;">${title}</h2>${body}
  <p style="margin:28px 0 0;color:#9CA3AF;font-size:12px;">Washio · Προκόπιος Κούκης · ΑΦΜ 154067080 · Ηρακλείου 4, Γλυφάδα</p></div>`

/** Δημιουργεί συμβόλαιο (υπογεγραμμένο ήδη από Washio) και στέλνει το link υπογραφής στον συνεργάτη. */
export async function createAndSendContract(db: SupabaseClient, input: {
  applicationId: string; fields: Omit<ContractFields, 'date'>; email: string; phone?: string; iban?: string; sentBy: string
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const token = randomBytes(24).toString('base64url')
  const fields: ContractFields = { ...input.fields, date: todayAthens() }
  // παλιά ανυπόγραφα συμβόλαια της ίδιας αίτησης → άκυρα (μένει ενεργό μόνο το τελευταίο link)
  await db.from('partner_contracts').update({ status: 'void' }).eq('application_id', input.applicationId).eq('status', 'sent')
  const { data, error } = await db.from('partner_contracts').insert({
    application_id: input.applicationId, token, status: 'sent', version: CONTRACT_VERSION, fields,
    email: input.email.toLowerCase(), phone: input.phone || null, iban: input.iban || null, sent_by: input.sentBy,
  }).select('id').single()
  if (error || !data) return { ok: false, error: error?.message || 'Αποτυχία δημιουργίας συμβολαίου' }
  const sent = await sendContractLink({ token, email: input.email, fields })
  if (!sent.ok) return sent
  return { ok: true, id: data.id }
}

export async function sendContractLink(c: { token: string; email: string; fields: ContractFields }): Promise<{ ok: true } | { ok: false; error: string }> {
  const link = `${SITE}/contract/${c.token}`
  try {
    const r = await resend.emails.send({
      from: FROM, to: [c.email], bcc: ADMIN_EMAILS,
      subject: `Συμφωνητικό Συνεργασίας Washio — ${c.fields.businessName}`,
      html: shell('Το συμφωνητικό σας είναι έτοιμο για υπογραφή', `
        <p style="margin:0 0 14px;line-height:1.5;">Καλησπέρα ${esc(c.fields.contactName)},<br/>σας στέλνουμε το Συμφωνητικό Συνεργασίας για το <b>${esc(c.fields.businessName)}</b>, ήδη υπογεγραμμένο από τη Washio.</p>
        <p style="margin:0 0 20px;line-height:1.5;">Διαβάστε το και υπογράψτε ηλεκτρονικά από το κινητό σας. Χρειάζεται 1 λεπτό.</p>
        <p style="margin:0 0 20px;"><a href="${link}" style="display:inline-block;background:#10182A;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:12px;">Άνοιγμα & υπογραφή →</a></p>
        <p style="margin:0;color:#6B7280;font-size:13px;line-height:1.5;">Μόλις υπογράψετε, θα λάβετε αντίγραφο του υπογεγραμμένου συμφωνητικού σε αυτό το email.</p>`),
    })
    if (r.error) return { ok: false, error: r.error.message }
    return { ok: true }
  } catch (e) { return { ok: false, error: (e as Error).message } }
}

export async function contractByToken(db: SupabaseClient, token: string): Promise<ContractRow | null> {
  if (!token || token.length < 20) return null
  const { data } = await db.from('partner_contracts').select('*').eq('token', token).maybeSingle()
  return (data as ContractRow) || null
}

/** OTP 6 ψηφίων στο email του συνεργάτη (10'). Όριο 5 αποστολές. */
export async function sendOtp(db: SupabaseClient, c: ContractRow): Promise<{ ok: true } | { ok: false; error: string }> {
  if (c.status !== 'sent') return { ok: false, error: 'Το συμφωνητικό δεν είναι διαθέσιμο για υπογραφή' }
  if ((c.otp_sends || 0) >= 5) return { ok: false, error: 'Πολλές προσπάθειες. Επικοινωνήστε με τη Washio.' }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await db.from('partner_contracts').update({
    otp_hash: sha(`${c.id}:${code}:${pepper()}`), otp_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    otp_attempts: 0, otp_sends: (c.otp_sends || 0) + 1,
  }).eq('id', c.id)
  try {
    const r = await resend.emails.send({
      from: FROM, to: [c.email], subject: `${code} — κωδικός υπογραφής Washio`,
      html: shell('Κωδικός υπογραφής', `<p style="margin:0 0 16px;">Ο κωδικός για την υπογραφή του συμφωνητικού είναι:</p>
        <p style="margin:0 0 16px;font-size:32px;font-weight:800;letter-spacing:6px;">${code}</p>
        <p style="margin:0;color:#6B7280;font-size:13px;">Ισχύει για 10 λεπτά. Αν δεν τον ζητήσατε εσείς, αγνοήστε αυτό το email.</p>`),
    })
    if (r.error) return { ok: false, error: r.error.message }
  } catch (e) { return { ok: false, error: (e as Error).message } }
  return { ok: true }
}

const maskEmail = (e: string) => e.replace(/^(.{2})[^@]*(@.*)$/, (_, a, b) => a + '•••' + b)
export const publicContract = (c: ContractRow) => ({
  status: c.status, version: c.version, fields: c.fields, emailMasked: maskEmail(c.email),
  washioSignedAt: c.washio_signed_at, signedAt: c.signed_at, signerName: c.signer_name,
  blocks: renderContract(c.fields),
})

const promoUntil = (months: number) => {
  if (!months) return null
  const d = new Date(); d.setMonth(d.getMonth() + months)
  return d.toISOString().slice(0, 10)
}

/** Επαλήθευση OTP + υπογραφή → PDF → storage → email και στους δύο → πρατήριο (ανενεργό). */
export async function signContract(db: SupabaseClient, c: ContractRow, input: {
  otp: string; signerName: string; signaturePng: Uint8Array; ip?: string; userAgent?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (c.status === 'signed') return { ok: false, error: 'Το συμφωνητικό έχει ήδη υπογραφεί' }
  if (c.status !== 'sent') return { ok: false, error: 'Το συμφωνητικό δεν είναι διαθέσιμο για υπογραφή' }
  if (!c.otp_hash || !c.otp_expires_at || new Date(c.otp_expires_at).getTime() < Date.now()) return { ok: false, error: 'Ο κωδικός έληξε. Ζητήστε νέο.' }
  if ((c.otp_attempts || 0) >= 5) return { ok: false, error: 'Πολλές λάθος προσπάθειες. Ζητήστε νέο κωδικό.' }
  if (sha(`${c.id}:${String(input.otp).trim()}:${pepper()}`) !== c.otp_hash) {
    await db.from('partner_contracts').update({ otp_attempts: (c.otp_attempts || 0) + 1 }).eq('id', c.id)
    return { ok: false, error: 'Λάθος κωδικός' }
  }
  const signerName = input.signerName.trim()
  if (signerName.length < 3) return { ok: false, error: 'Γράψτε το ονοματεπώνυμό σας' }
  if (input.signaturePng.length < 500) return { ok: false, error: 'Βάλτε την υπογραφή σας' }

  // Κλείδωμα (μία υπογραφή μόνο, ακόμα και με διπλό κλικ)
  const signedAt = new Date().toISOString()
  const { data: claimed } = await db.from('partner_contracts').update({ status: 'signed', signed_at: signedAt, otp_hash: null })
    .eq('id', c.id).eq('status', 'sent').select('id')
  if (!claimed?.length) return { ok: false, error: 'Το συμφωνητικό έχει ήδη υπογραφεί' }

  const contentSha256 = sha(JSON.stringify({ version: c.version, fields: c.fields, blocks: renderContract(c.fields), signerName, signerEmail: c.email, washioSignedAt: c.washio_signed_at }))
  const audit = { contractId: c.id, washioSignedAt: c.washio_signed_at, signerName, signerEmail: c.email, signerPhone: c.phone || undefined, signedAt, ip: input.ip, userAgent: input.userAgent, otpChannel: 'email', contentSha256 }
  let pdf: Uint8Array
  try {
    pdf = await buildContractPdf(c.fields, { signaturePng: input.signaturePng, audit, washioSignedAt: c.washio_signed_at })
  } catch (e) {
    await db.from('partner_contracts').update({ status: 'sent', signed_at: null }).eq('id', c.id)
    return { ok: false, error: 'Αποτυχία δημιουργίας PDF: ' + (e as Error).message }
  }
  const pdfPath = `${c.id}/Symfonitiko_Washio_${c.fields.afm}.pdf`
  await db.storage.from('contracts').upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: true })
  await db.from('partner_contracts').update({
    signer_name: signerName, signer_ip: input.ip || null, signer_user_agent: (input.userAgent || '').slice(0, 400),
    content_sha256: contentSha256, pdf_path: pdfPath, pdf_sha256: sha(pdf),
  }).eq('id', c.id)

  // Ενεργοποίηση: onboarding + πρατήριο (ανενεργό, περιμένει ⏻) · αίτηση → Ολοκληρώθηκαν
  let locationId: string | null = null
  try {
    const f = c.fields
    const { data: ob } = await db.from('partner_onboarding').insert({
      business_name: f.businessName, afm: f.afm, doy: f.doy, address: f.address,
      iban_holder: f.ibanHolder || '', iban: c.iban || '', contact_name: f.contactName, phone: c.phone || '—', email: c.email,
      declaration_accepted: true, status: 'pending',
    }).select('*').single()
    if (ob) {
      const r = await activateOnboarding(db, ob, { commissionRate: f.promoMonths > 0 ? 5 : 10, promoUntil: promoUntil(f.promoMonths), storeName: f.storeName })
      if (r.ok) locationId = r.locationId
      if (c.application_id) await db.from('applications').update({
        stage: 'done', status: 'approved', contract_status: 'signed', onboarding_id: ob.id, location_id: locationId,
        afm: f.afm, doy: f.doy, address: f.address, business_name: f.storeName || f.businessName, owner_name: f.contactName, stage_updated_at: signedAt,
      }).eq('id', c.application_id)
    }
    if (locationId) await db.from('partner_contracts').update({ location_id: locationId }).eq('id', c.id)
  } catch { /* η υπογραφή ισχύει· η ενεργοποίηση γίνεται και χειροκίνητα */ }

  // Αντίγραφα: συνεργάτης + Washio
  const filename = `Symfonitiko_Synergasias_Washio_${c.fields.afm}.pdf`
  const att = [{ filename, content: Buffer.from(pdf).toString('base64') }]
  const when = new Intl.DateTimeFormat('el-GR', { timeZone: 'Europe/Athens', dateStyle: 'long', timeStyle: 'short' }).format(new Date(signedAt))
  try {
    await resend.emails.send({
      from: FROM, to: [c.email], subject: `Υπογεγραμμένο Συμφωνητικό Συνεργασίας — ${c.fields.businessName}`, attachments: att,
      html: shell('Καλώς ήρθατε στη Washio', `<p style="margin:0 0 14px;line-height:1.5;">Το Συμφωνητικό Συνεργασίας υπογράφηκε από αμφότερα τα μέρη (${esc(when)}).</p>
        <p style="margin:0 0 14px;line-height:1.5;">Επισυνάπτεται το υπογεγραμμένο αντίτυπό σας, μαζί με το πιστοποιητικό υπογραφής. Κρατήστε το στο αρχείο σας.</p>
        <p style="margin:0;line-height:1.5;">Σύντομα θα σας καλέσουμε για να ολοκληρώσουμε το προφίλ του καταστήματός σας (φωτογραφίες, υπηρεσίες, ωράριο).</p>`),
    })
  } catch { /* best-effort */ }
  try {
    await resend.emails.send({
      from: FROM, to: ADMIN_EMAILS, subject: `✍️ Υπογράφηκε: ${c.fields.businessName} (ΑΦΜ ${c.fields.afm})`, attachments: att,
      html: shell('Νέο υπογεγραμμένο συμφωνητικό', `<p style="margin:0 0 10px;"><b>${esc(c.fields.businessName)}</b> · ΑΦΜ ${esc(c.fields.afm)} · ${esc(c.fields.doy)}</p>
        <p style="margin:0 0 10px;">${esc(signerName)} · ${esc(c.email)} · ${esc(when)}</p>
        <p style="margin:0 0 10px;">Προμήθεια: ${commissionSummary(c.fields.promoMonths)}.</p>
        <p style="margin:0;">${locationId ? `Το πρατήριο δημιουργήθηκε (ανενεργό) — <a href="${SITE}/admin/locations/${locationId}/edit">άνοιγμα</a>` : 'Δημιούργησε το πρατήριο χειροκίνητα.'}</p>`),
    })
  } catch { /* best-effort */ }
  return { ok: true }
}

/** Μετά τους μήνες 5% → 10% (καλείται από το cron). */
export async function expireCommissionPromos(db: SupabaseClient): Promise<number> {
  const today = new Date().toISOString().slice(0, 10)
  const { data, error } = await db.from('locations').update({ commission_rate: 10, commission_promo_until: null })
    .lte('commission_promo_until', today).select('id')
  return error ? 0 : (data?.length || 0)
}
