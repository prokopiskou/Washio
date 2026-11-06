// Oxygen Pelatologio API (https://docs.oxygen.gr) — έκδοση τιμολογίων προμήθειας Washio.
// Env (Vercel):
//   OXYGEN_API_KEY                 (υποχρεωτικό — Oxygen → Ρυθμίσεις → API)
//   OXYGEN_API_URL                 (προαιρετικό · default production https://api.oxygen.gr/v1 ·
//                                   για δοκιμές https://sandbox-api.oxygen.gr/v1)
//   OXYGEN_PAYMENT_METHOD_ID       τρόπος πληρωμής όταν το πλυντήριο μάς πλήρωσε (τράπεζα/Revolut)
//   OXYGEN_OFFSET_PAYMENT_METHOD_ID τρόπος πληρωμής «συμψηφισμός» (αν λείπει → ο παραπάνω)
//   OXYGEN_TAX_ID                  (προαιρετικό) id ΦΠΑ 24% — αλλιώς βρίσκεται αυτόματα από GET /taxes
//   OXYGEN_NUMBERING_SEQUENCE_ID   (προαιρετικό) σειρά αρίθμησης τιμολογίων παροχής
//   OXYGEN_MYDATA_CATEGORY / OXYGEN_MYDATA_TYPE  χαρακτηρισμός εσόδου (default category1_3 / E3_561_001
//                                   — να επιβεβαιωθεί από τον λογιστή)

const BASE = (process.env.OXYGEN_API_URL || 'https://api.oxygen.gr/v1').replace(/\/+$/, '')

export class OxygenError extends Error {
  constructor(message: string, public status: number, public details?: unknown) { super(message) }
}

async function call<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.OXYGEN_API_KEY
  if (!key) throw new OxygenError('Λείπει το OXYGEN_API_KEY στη Vercel', 500)
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string; errors?: Record<string, string[]> }
    const first = body.errors ? Object.entries(body.errors).map(([k, v]) => `${k}: ${v.join(', ')}`).join(' · ') : ''
    throw new OxygenError(`Oxygen ${res.status}: ${body.message || res.statusText}${first ? ' — ' + first : ''}`, res.status, body)
  }
  return res.json() as Promise<T>
}

type List<T> = { data: T[] }

export type OxTax = { id: string; title?: string; name?: string; rate?: number | string; value?: number | string; mydata_vat_code?: number | string }
export type OxPaymentMethod = { id: string; title?: string; title_gr?: string; name?: string; mydata_code?: number | string }
export type OxSequence = { id: string; title?: string; name?: string; document_type?: string; type?: string; series?: string }

export const oxygen = {
  info: () => call<Record<string, unknown>>('/'),
  taxes: () => call<List<OxTax>>('/taxes?per_page=200').then(r => r.data || []),
  paymentMethods: () => call<List<OxPaymentMethod>>('/payment-methods?per_page=200').then(r => r.data || []),
  sequences: () => call<List<OxSequence>>('/numbering-sequences?per_page=200').then(r => r.data || []),
  contactByVat: (vat: string) => call<List<{ id: string }>>(`/contacts?vat=${encodeURIComponent(vat)}`).then(r => r.data?.[0] || null),
  vatCheck: (vat: string) => call<{
    vatNumber?: string; legalName?: string; commerceTitle?: string; taxAuthorityName?: string
    street?: string; streetNumber?: string; postcode?: string; city?: string; valid?: boolean; firms?: { description?: string }[] | unknown
  }>(`/vat-check?vat=${encodeURIComponent(vat)}`),
  createContact: (body: Record<string, unknown>) => call<{ id: string }>('/contacts', { method: 'POST', body: JSON.stringify(body) }),
  createInvoice: (body: Record<string, unknown>) => call<Record<string, unknown> & { id: string }>('/invoices', { method: 'POST', body: JSON.stringify(body) }),
  invoice: (id: string) => call<Record<string, unknown>>(`/invoices/${id}`),
  /** Απόδειξη Είσπραξης έναντι τιμολογίου (εξόφληση). Χωρίς amount → όλο το υπόλοιπο. */
  payInvoice: (id: string, body: { payment_method_id?: string; description?: string; comments?: string; issue_date?: string } = {}) =>
    call<Record<string, unknown> & { id: string }>(`/invoices/${id}/payments`, { method: 'POST', body: JSON.stringify(body) }),
  async invoicePdf(id: string): Promise<Buffer> {
    const key = process.env.OXYGEN_API_KEY
    const res = await fetch(`${BASE}/invoices/${id}/pdf?template=a4`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/pdf' }, cache: 'no-store',
    })
    if (!res.ok) throw new OxygenError(`Oxygen PDF ${res.status}`, res.status)
    return Buffer.from(await res.arrayBuffer())
  },
}

const num = (v: unknown) => Number(String(v ?? '').replace(',', '.'))

/** Id του ΦΠΑ 24% (env ή αυτόματα από τη λίστα φόρων του λογαριασμού). */
export async function vat24Id(): Promise<string> {
  if (process.env.OXYGEN_TAX_ID) return process.env.OXYGEN_TAX_ID
  const taxes = await oxygen.taxes()
  const t = taxes.find(x => num(x.rate ?? x.value) === 24)
    || taxes.find(x => /24/.test(String(x.title || x.name || '')))
  if (!t) throw new OxygenError('Δεν βρέθηκε ΦΠΑ 24% στο Oxygen — όρισε OXYGEN_TAX_ID', 500)
  return t.id
}

/** Βρίσκει (ή δημιουργεί από το μητρώο ΑΑΔΕ) τον πελάτη-πλυντήριο με βάση το ΑΦΜ. */
export async function ensureContact(o: { vat: string; email?: string | null; phone?: string | null; fallbackName: string }): Promise<string> {
  const vat = o.vat.replace(/\D/g, '')
  if (vat.length !== 9) throw new OxygenError(`Μη έγκυρο ΑΦΜ (${o.vat})`, 422)
  const found = await oxygen.contactByVat(vat)
  if (found?.id) return found.id
  const g = await oxygen.vatCheck(vat).catch(() => null)
  const firms = Array.isArray(g?.firms) ? (g!.firms as { description?: string }[]) : []
  const created = await oxygen.createContact({
    type: 2,
    is_client: true,
    is_supplier: false,
    company_name: (g?.legalName || g?.commerceTitle || o.fallbackName).trim(),
    nickname: o.fallbackName.slice(0, 100),
    profession: (firms[0]?.description || 'ΠΛΥΝΤΗΡΙΟ ΑΥΤΟΚΙΝΗΤΩΝ').slice(0, 190),
    vat_number: vat,
    tax_office: g?.taxAuthorityName || '',
    street: g?.street || '-',
    number: g?.streetNumber || '0',
    city: g?.city || 'ΑΘΗΝΑ',
    zip_code: g?.postcode || '00000',
    country: 'GR',
    email: o.email || null,
    mobile: o.phone || null,
  })
  return created.id
}
