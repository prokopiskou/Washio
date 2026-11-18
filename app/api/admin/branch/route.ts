import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'
import { assignManager, billingOwnerIds, readPendingManagers, writePendingManagers } from '@/lib/location-access'

// «Νέο υποκατάστημα»: ίδιο πλυντήριο σε άλλη διεύθυνση (αλυσίδα). ΔΕΝ χρειάζεται νέο συμφωνητικό.
// Αντιγράφει από το υπάρχον: υπηρεσίες + τιμές, ωράριο, πρόσθετα, προμήθεια/δωρεάν περίοδο, ΑΦΜ/ΔΟΥ, θέσεις.
// Ζητάει ΜΟΝΟ ό,τι διαφέρει: όνομα, διεύθυνση, τηλέφωνο + ο ΥΠΕΥΘΥΝΟΣ του (όνομα, email, κινητό).
//  • Ο ιδιοκτήτης της αλυσίδας το βλέπει αμέσως στο dashboard του (και μένει μέλος όταν μπει ο υπεύθυνος).
//  • Ο υπεύθυνος δένεται μόνος του στην πρώτη του σύνδεση με αυτό το email (pending_managers).
//  • Τα στοιχεία κάθε υπευθύνου κρατιούνται στο app_settings 'manager_contacts' { locationId: { name, email, phone } }.
//
//  GET            → πλυντήρια (για την επιλογή «από ποιο») + στοιχεία υπευθύνων
//  POST { sourceId, name, address, city, postal_code, lat, lng, phone?, capacity?, active?, manager: { name, email, phone } }
//  PUT  { locationId, manager: { name, email, phone } } → αλλάζει/ορίζει υπεύθυνο σε υπάρχον πλυντήριο
export const maxDuration = 60
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function isAdmin() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  return !!user && isAdminEmail(user.email)
}
type Mgr = { name?: string; email?: string; phone?: string }
const clean = (m: Mgr | undefined): Mgr => ({
  name: String(m?.name || '').replace(/[<>]/g, '').trim().slice(0, 80),
  email: String(m?.email || '').trim().toLowerCase().slice(0, 120),
  phone: String(m?.phone || '').replace(/[^\d+ ]/g, '').trim().slice(0, 20),
})
const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e)

async function readContacts(): Promise<Record<string, Mgr>> {
  const { data } = await db.from('app_settings').select('value').eq('key', 'manager_contacts').maybeSingle()
  return ((data?.value as Record<string, Mgr> | null) || {})
}
async function saveContact(locationId: string, m: Mgr) {
  const all = await readContacts()
  all[locationId] = { ...m }
  await db.from('app_settings').upsert({ key: 'manager_contacts', value: all, updated_at: new Date().toISOString() }, { onConflict: 'key' })
}
async function userIdByEmail(email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) return null
    const u = data.users.find(x => (x.email || '').toLowerCase() === email)
    if (u) return u.id
    if (data.users.length < 1000) break
  }
  return null
}
/** Ορίζει υπεύθυνο: αν έχει λογαριασμό → αμέσως· αλλιώς σε αναμονή μέχρι την πρώτη του σύνδεση. */
async function setManager(locationId: string, m: Mgr): Promise<'assigned' | 'pending' | 'none'> {
  await saveContact(locationId, m)
  if (!m.email) return 'none'
  const uid = await userIdByEmail(m.email)
  const rest = (await readPendingManagers(db)).filter(i => i.locationId !== locationId)
  if (uid) {
    const r = await assignManager(db, { locationId, managerUserId: uid, name: m.name, phone: m.phone })
    if (!r.ok) throw new Error(r.error || 'Αποτυχία ανάθεσης υπευθύνου')
    await writePendingManagers(db, rest)
    return 'assigned'
  }
  rest.push({ locationId, email: m.email, name: m.name, phone: m.phone })
  await writePendingManagers(db, rest)
  return 'pending'
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const [{ data: locs }, contacts, pending] = await Promise.all([
    db.from('locations').select('id, name, address, city, capacity, is_active, owner_id').order('name'),
    readContacts(), readPendingManagers(db),
  ])
  return NextResponse.json({
    locations: (locs || []).map(l => ({
      id: l.id, name: String(l.name || '').trim(), address: l.address || '', city: l.city || '', capacity: l.capacity || 1, active: !!l.is_active,
      manager: contacts[l.id as string] || null,
      managerPending: pending.some(p => p.locationId === l.id),
    })),
  })
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as {
    sourceId?: string; name?: string; address?: string; city?: string; postal_code?: string; lat?: number | string; lng?: number | string
    phone?: string; capacity?: number | string; active?: boolean; manager?: Mgr
  }
  const name = String(b.name || '').replace(/[<>]/g, '').trim().slice(0, 80)
  const address = String(b.address || '').replace(/[<>]/g, '').trim().slice(0, 160)
  const city = String(b.city || '').replace(/[<>]/g, '').trim().slice(0, 80)
  const lat = Number(b.lat), lng = Number(b.lng)
  const m = clean(b.manager)
  if (!b.sourceId || !name || !address || !city) return NextResponse.json({ error: 'Συμπλήρωσε όνομα, διεύθυνση και περιοχή' }, { status: 400 })
  if (!(lat > 34 && lat < 42 && lng > 19 && lng < 30)) return NextResponse.json({ error: 'Διάλεξε τη διεύθυνση από τη λίστα (χρειάζονται συντεταγμένες)' }, { status: 400 })
  if (m.email && !emailOk(m.email)) return NextResponse.json({ error: 'Λάθος email υπευθύνου' }, { status: 400 })

  const { data: src, error: sErr } = await db.from('locations').select('*').eq('id', b.sourceId).maybeSingle()
  if (sErr || !src) return NextResponse.json({ error: 'Δεν βρέθηκε το αρχικό πλυντήριο' }, { status: 404 })
  // Ίδιο όνομα + ίδια διεύθυνση = διπλό πάτημα → μην το ξαναφτιάξεις.
  const { data: dup } = await db.from('locations').select('id').eq('name', name).eq('address', address).limit(1)
  if (dup?.length) return NextResponse.json({ error: 'Υπάρχει ήδη πλυντήριο με αυτό το όνομα και διεύθυνση' }, { status: 409 })

  // Ιδιοκτήτης αλυσίδας = σε ποιον πάνε τα οικονομικά του αρχικού (μέλος «group» αν υπάρχει, αλλιώς ο κύριος λογαριασμός).
  const chainOwner = (await billingOwnerIds(db, [{ id: src.id as string, owner_id: (src.owner_id as string | null) || null }])).get(src.id as string) || null

  // Νέα γραμμή: ό,τι έχει το αρχικό, ΕΚΤΟΣ από όσα είναι μοναδικά για κάθε κατάστημα.
  const row: Record<string, unknown> = { ...(src as Record<string, unknown>) }
  // scan_token: ΜΟΝΑΔΙΚΟ ανά κατάστημα (το δικό του QR σκαναρίσματος — φτιάχνεται μόνο του στο dashboard).
  // photos: είναι του άλλου καταστήματος. Το cover (λογότυπο) μένει — ίδια επωνυμία.
  for (const k of ['id', 'created_at', 'updated_at', 'slug', 'scan_token', 'google_maps_url', 'morning_push_date', 'waitlist_notified_at', 'photos']) delete row[k]
  const slugBase = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/--+/g, '-').replace(/^-|-$/g, '') || 'washio'
  Object.assign(row, {
    name, address, city, postal_code: String(b.postal_code || '').replace(/[^\d ]/g, '').slice(0, 8) || null, lat, lng,
    phone: String(b.phone || '').replace(/[^\d+ ]/g, '').trim().slice(0, 20) || m.phone || (src.phone as string | null) || null,
    slug: `${slugBase}-${Date.now()}`,
    capacity: Math.max(1, Math.min(20, Number(b.capacity) || Number(src.capacity) || 1)),
    is_active: b.active !== false,
    owner_id: chainOwner,
  })
  const { data: ins, error: iErr } = await db.from('locations').insert(row).select('id, slug').single()
  if (iErr || !ins) return NextResponse.json({ error: 'Δεν δημιουργήθηκε: ' + (iErr?.message || '') }, { status: 500 })
  const newId = ins.id as string

  // Αντιγραφή υπηρεσιών / ωραρίου / προσθέτων. Αν κάτι αποτύχει, το πλυντήριο μένει ΑΝΕΝΕΡΓΟ για να μη φανεί μισό.
  const warn: string[] = []
  const copy = async (table: string, strip: string[]) => {
    const { data, error } = await db.from(table).select('*').eq('location_id', src.id)
    if (error) { warn.push(`${table}: ${error.message}`); return 0 }
    const rows = ((data || []) as Record<string, unknown>[]).map(r => { const c = { ...r }; for (const k of strip) delete c[k]; c.location_id = newId; return c })
    if (!rows.length) return 0
    const { error: e2 } = await db.from(table).insert(rows)
    if (e2) { warn.push(`${table}: ${e2.message}`); return 0 }
    return rows.length
  }
  const services = await copy('services', ['id', 'created_at', 'updated_at'])
  const hours = await copy('location_hours', ['id', 'created_at', 'updated_at'])
  const addons = await copy('location_addons', ['id', 'created_at', 'updated_at'])
  if (warn.length || !services) await db.from('locations').update({ is_active: false }).eq('id', newId)

  // Ο ιδιοκτήτης της αλυσίδας = μέλος «group» → το βλέπει στο dashboard και μένει όταν μπει ο υπεύθυνος.
  if (chainOwner) await db.from('location_members').upsert({ location_id: newId, user_id: chainOwner, role: 'group' }, { onConflict: 'location_id,user_id' }).then(() => null, () => null)

  let manager: 'assigned' | 'pending' | 'none' = 'none'
  try { manager = await setManager(newId, m) } catch (e) { warn.push(e instanceof Error ? e.message : 'υπεύθυνος') }

  return NextResponse.json({ ok: true, locationId: newId, slug: ins.slug, copied: { services, hours, addons }, manager, active: !(warn.length || !services) && b.active !== false, warnings: warn })
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Μόνο για admin' }, { status: 403 })
  const b = await req.json().catch(() => ({})) as { locationId?: string; manager?: Mgr }
  const m = clean(b.manager)
  if (!b.locationId || !/^[0-9a-f-]{36}$/i.test(b.locationId)) return NextResponse.json({ error: 'Ποιο πλυντήριο;' }, { status: 400 })
  if (m.email && !emailOk(m.email)) return NextResponse.json({ error: 'Λάθος email υπευθύνου' }, { status: 400 })
  try { return NextResponse.json({ ok: true, manager: await setManager(b.locationId, m) }) }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Σφάλμα' }, { status: 500 }) }
}
