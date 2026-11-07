import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { readFile } from 'fs/promises'
import path from 'path'
import { renderContract, commissionSummary, WASHIO_PARTY, CONTRACT_VERSION, type ContractFields } from '@/lib/contract-text'

// PDF Συμφωνητικού Συνεργασίας: κείμενο + υπογραφές (Washio: ψηφιακή σφραγίδα · Συνεργάτης: υπογραφή με το δάχτυλο)
// + σελίδα «Πιστοποιητικό υπογραφής» (audit trail). Ελληνικά → DejaVu Sans (lib/fonts).

export type SignatureAudit = {
  contractId: string
  washioSignedAt: string      // ISO
  signerName: string
  signerEmail: string
  signerPhone?: string
  signedAt: string            // ISO
  ip?: string
  userAgent?: string
  otpChannel: string          // π.χ. 'email'
  contentSha256: string       // hash του κειμένου + στοιχείων (πριν το PDF)
}

const A4 = { w: 595.28, h: 841.89 }
const M = 56
const INK = rgb(0.06, 0.09, 0.16)
const GREY = rgb(0.42, 0.45, 0.5)
const BLUE = rgb(0.1, 0.43, 0.83)

const fmtAthens = (iso: string) => new Intl.DateTimeFormat('el-GR', {
  timeZone: 'Europe/Athens', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
}).format(new Date(iso))

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/)) {
      const tryLine = line ? line + ' ' + word : word
      if (font.widthOfTextAtSize(tryLine, size) <= maxW) { line = tryLine; continue }
      if (line) out.push(line)
      line = word
    }
    out.push(line)
  }
  return out
}

async function fonts(pdf: PDFDocument) {
  pdf.registerFontkit(fontkit)
  const dir = path.join(process.cwd(), 'lib', 'fonts')
  const [r, b, i] = await Promise.all(['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf', 'DejaVuSans-Oblique.ttf'].map(f => readFile(path.join(dir, f))))
  return { reg: await pdf.embedFont(r, { subset: true }), bold: await pdf.embedFont(b, { subset: true }), ital: await pdf.embedFont(i, { subset: true }) }
}

/** Δημιουργεί το PDF. Αν δεν δοθεί υπογραφή συνεργάτη → «προς υπογραφή» (preview). */
export async function buildContractPdf(f: ContractFields, opts: { signaturePng?: Uint8Array; audit?: SignatureAudit; washioSignedAt: string }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Συμφωνητικό Συνεργασίας Washio — ${f.businessName}`)
  pdf.setAuthor('Washio'); pdf.setCreator('Washio'); pdf.setProducer('Washio')
  const { reg, bold, ital } = await fonts(pdf)

  let page: PDFPage = pdf.addPage([A4.w, A4.h])
  let y = A4.h - M
  const maxW = A4.w - 2 * M
  const newPage = () => { page = pdf.addPage([A4.w, A4.h]); y = A4.h - M }
  const need = (h: number) => { if (y - h < M + 20) newPage() }
  const text = (t: string, o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; indent?: number; gap?: number; center?: boolean } = {}) => {
    const font = o.font || reg, size = o.size || 10, lh = size * 1.45, ind = o.indent || 0
    for (const ln of wrap(t, font, size, maxW - ind)) {
      need(lh)
      const x = o.center ? (A4.w - font.widthOfTextAtSize(ln, size)) / 2 : M + ind
      page.drawText(ln, { x, y: y - size, size, font, color: o.color || INK })
      y -= lh
    }
    y -= o.gap ?? 4
  }

  for (const b of renderContract(f)) {
    if (b.kind === 'title') text(b.text, { font: bold, size: 16, center: true, gap: 2 })
    else if (b.kind === 'subtitle') text(b.text, { size: 11, color: GREY, center: true, gap: 14 })
    else if (b.kind === 'heading') { y -= 6; text(b.text, { font: bold, size: 11, gap: 3 }) }
    else if (b.kind === 'li') text('•  ' + b.text, { indent: 14, gap: 3 })
    else text(b.text, { gap: 5 })
  }

  // ── Υπογραφές ──
  need(190); y -= 14
  text('ΟΙ ΣΥΜΒΑΛΛΟΜΕΝΟΙ', { font: bold, size: 11, center: true, gap: 12 })
  const colW = (maxW - 30) / 2, xL = M, xR = M + colW + 30, top = y
  page.drawText(WASHIO_PARTY.label, { x: xL, y: top - 10, size: 10, font: bold, color: INK })
  page.drawText('Για τον Συνεργάτη', { x: xR, y: top - 10, size: 10, font: bold, color: INK })

  // Washio: ψηφιακή σφραγίδα
  const boxY = top - 108
  page.drawRectangle({ x: xL, y: boxY, width: colW, height: 84, borderColor: BLUE, borderWidth: 1, color: rgb(0.95, 0.97, 1) })
  page.drawText(WASHIO_PARTY.name, { x: xL + 12, y: boxY + 52, size: 17, font: ital, color: BLUE })
  page.drawText('Ψηφιακά υπογεγραμμένο από Washio', { x: xL + 12, y: boxY + 30, size: 8, font: bold, color: BLUE })
  page.drawText(fmtAthens(opts.washioSignedAt), { x: xL + 12, y: boxY + 18, size: 8, font: reg, color: BLUE })
  page.drawText(`Έκδοση κειμένου ${CONTRACT_VERSION}`, { x: xL + 12, y: boxY + 6, size: 7, font: reg, color: GREY })

  // Συνεργάτης
  page.drawRectangle({ x: xR, y: boxY, width: colW, height: 84, borderColor: rgb(0.8, 0.82, 0.86), borderWidth: 1 })
  if (opts.signaturePng) {
    const img = await pdf.embedPng(opts.signaturePng)
    const s = Math.min((colW - 20) / img.width, 64 / img.height)
    page.drawImage(img, { x: xR + (colW - img.width * s) / 2, y: boxY + 14 + (64 - img.height * s) / 2, width: img.width * s, height: img.height * s })
    if (opts.audit) page.drawText(`Υπογράφηκε ηλεκτρονικά · ${fmtAthens(opts.audit.signedAt)}`, { x: xR + 8, y: boxY + 5, size: 7, font: reg, color: GREY })
  } else {
    page.drawText('Προς υπογραφή', { x: xR + 12, y: boxY + 38, size: 10, font: ital, color: GREY })
  }
  page.drawText(`${WASHIO_PARTY.name} (ΑΦΜ ${WASHIO_PARTY.afm})`, { x: xL, y: boxY - 14, size: 9, font: reg, color: INK })
  page.drawText(`${opts.audit?.signerName || f.contactName} — ${f.businessName}`.slice(0, 70), { x: xR, y: boxY - 14, size: 9, font: reg, color: INK })
  page.drawText(`ΑΦΜ ${f.afm}`, { x: xR, y: boxY - 26, size: 9, font: reg, color: GREY })
  y = boxY - 40

  // ── Πιστοποιητικό υπογραφής ──
  if (opts.audit) {
    const a = opts.audit
    newPage()
    text('ΠΙΣΤΟΠΟΙΗΤΙΚΟ ΗΛΕΚΤΡΟΝΙΚΗΣ ΥΠΟΓΡΑΦΗΣ', { font: bold, size: 14, center: true, gap: 4 })
    text('Απλή ηλεκτρονική υπογραφή — Κανονισμός (ΕΕ) 910/2014 (eIDAS)', { size: 9, color: GREY, center: true, gap: 18 })
    const rows: [string, string][] = [
      ['Έγγραφο', `Συμφωνητικό Συνεργασίας Washio (${CONTRACT_VERSION})`],
      ['Αριθμός συμβολαίου', a.contractId],
      ['Συνεργάτης', `${f.businessName} · ΑΦΜ ${f.afm} · Δ.Ο.Υ. ${f.doy}`],
      ['Έδρα', f.address],
      ['Προμήθεια (Άρθρο 4)', commissionSummary(f.promoMonths)],
      ['Υπογραφή Washio', `${WASHIO_PARTY.name} — ${fmtAthens(a.washioSignedAt)}`],
      ['Υπογράφων', a.signerName],
      ['Email', a.signerEmail],
      ...(a.signerPhone ? [['Κινητό', a.signerPhone] as [string, string]] : []),
      ['Επιβεβαίωση ταυτότητας', `Κωδικός μίας χρήσης (OTP) μέσω ${a.otpChannel} — επιτυχής`],
      ['Αποδοχή όρων', 'Ρητή αποδοχή (checkbox) πριν την υπογραφή'],
      ['Ημερομηνία & ώρα υπογραφής', `${fmtAthens(a.signedAt)} (ώρα Ελλάδας)`],
      ['Διεύθυνση IP', a.ip || '—'],
      ['Συσκευή / browser', (a.userAgent || '—').slice(0, 160)],
      ['Αποτύπωμα περιεχομένου (SHA-256)', a.contentSha256],
    ]
    for (const [k, v] of rows) {
      need(30)
      page.drawText(k, { x: M, y: y - 9, size: 8, font: bold, color: GREY })
      y -= 12
      text(v, { size: 9.5, gap: 8 })
    }
    y -= 6
    text('Το αποτύπωμα SHA-256 υπολογίστηκε επί του πλήρους κειμένου του συμφωνητικού και των στοιχείων των μερών τη στιγμή της υπογραφής. Οποιαδήποτε μεταβολή του περιεχομένου μεταβάλλει το αποτύπωμα. Αντίγραφο του παρόντος εστάλη ηλεκτρονικά και στα δύο μέρη.', { size: 8, color: GREY })
  }

  return pdf.save()
}
