import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'

// Διαχείριση ΚΕΝΤΡΙΚΟΥ καταλόγου βασικών υπηρεσιών — ΜΟΝΟ admin.
// POST  = προσθήκη νέας βασικής υπηρεσίας
// PATCH = ενημέρωση (is_active, duration_minutes, vehicles, sort_order, name)
//         name: μετονομάζει ΚΑΙ τις υπηρεσίες όλων των πλυντηρίων (συνδέονται με το όνομα).

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ALLOWED_DURATIONS = [30, 60, 90, 120]
const ALLOWED_VEHICLES = ['ΙΧ', 'SUV', 'Μοτοσικλέτα']

async function requireAdmin() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return null
  return user
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin()
    if (!user) return NextResponse.json({ error: 'Μόνο για διαχειριστές' }, { status: 403 })

    const { name, durationMinutes, vehicles } = await req.json()

    const cleanName = String(name || '').trim()
    if (!cleanName) return NextResponse.json({ error: 'Λείπει το όνομα' }, { status: 400 })

    const dur = Number(durationMinutes)
    if (!ALLOWED_DURATIONS.includes(dur)) {
      return NextResponse.json({ error: 'Μη έγκυρη διάρκεια (30/60/90/120)' }, { status: 400 })
    }

    const veh: string[] = Array.isArray(vehicles)
      ? vehicles.filter((v: string) => ALLOWED_VEHICLES.includes(v))
      : []
    if (veh.length === 0) {
      return NextResponse.json({ error: 'Διάλεξε τουλάχιστον έναν τύπο οχήματος' }, { status: 400 })
    }

    const { count } = await admin
      .from('service_catalog')
      .select('id', { count: 'exact', head: true })

    const { data, error } = await admin
      .from('service_catalog')
      .insert({
        name: cleanName,
        duration_minutes: dur,
        vehicles: veh,
        sort_order: (count || 0) + 1,
        is_active: true,
      })
      .select('*')
      .single()

    if (error) {
      const msg = error.message.includes('unique') || error.message.includes('duplicate')
        ? 'Υπάρχει ήδη υπηρεσία με αυτό το όνομα'
        : error.message
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    return NextResponse.json({ ok: true, item: data })
  } catch {
    return NextResponse.json({ error: 'Κάτι πήγε στραβά' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAdmin()
    if (!user) return NextResponse.json({ error: 'Μόνο για διαχειριστές' }, { status: 403 })

    const { id, ...patch } = await req.json()
    if (!id) return NextResponse.json({ error: 'Λείπει το id' }, { status: 400 })

    const allowed: Record<string, unknown> = {}
    if (typeof patch.is_active === 'boolean') allowed.is_active = patch.is_active
    if (patch.duration_minutes !== undefined) {
      const dur = Number(patch.duration_minutes)
      if (!ALLOWED_DURATIONS.includes(dur)) {
        return NextResponse.json({ error: 'Μη έγκυρη διάρκεια' }, { status: 400 })
      }
      allowed.duration_minutes = dur
    }
    if (Array.isArray(patch.vehicles)) {
      const veh = patch.vehicles.filter((v: string) => ALLOWED_VEHICLES.includes(v))
      if (veh.length === 0) return NextResponse.json({ error: 'Άκυροι τύποι οχήματος' }, { status: 400 })
      allowed.vehicles = veh
    }
    if (patch.sort_order !== undefined) allowed.sort_order = Number(patch.sort_order) || 0

    // Μετονομασία: οι υπηρεσίες των πλυντηρίων (services) δένονται με τον κατάλογο μέσω ΟΝΟΜΑΤΟΣ,
    // άρα αλλάζουν κι αυτές — αλλιώς το πλυντήριο θα «έχανε» την υπηρεσία του.
    let oldName: string | null = null
    if (patch.name !== undefined) {
      const newName = String(patch.name || '').trim().replace(/\s+/g, ' ')
      if (!newName) return NextResponse.json({ error: 'Το όνομα δεν μπορεί να είναι κενό' }, { status: 400 })
      if (newName.length > 60) return NextResponse.json({ error: 'Πολύ μεγάλο όνομα (έως 60)' }, { status: 400 })
      const { data: cur } = await admin.from('service_catalog').select('name, vehicles').eq('id', id).maybeSingle()
      if (!cur) return NextResponse.json({ error: 'Δεν βρέθηκε η υπηρεσία' }, { status: 404 })
      if (cur.name !== newName) {
        // Υπηρεσία μόνο για μοτοσικλέτα: η εφαρμογή την αναγνωρίζει από το «Μοτο» στο όνομα.
        const motoOnly = Array.isArray(cur.vehicles) && cur.vehicles.length === 1 && cur.vehicles[0] === 'Μοτοσικλέτα'
        if (motoOnly && !/μοτο|moto/i.test(newName)) {
          return NextResponse.json({ error: 'Υπηρεσία μοτοσικλέτας: το όνομα πρέπει να περιέχει «Μοτο».' }, { status: 400 })
        }
        // Σύγκρουση: πλυντήριο που έχει ήδη υπηρεσία με το νέο όνομα.
        const { data: clash } = await admin.from('services').select('location_id').eq('name', newName).limit(1)
        if (clash && clash.length) {
          return NextResponse.json({ error: 'Υπάρχει ήδη υπηρεσία με αυτό το όνομα σε πλυντήριο.' }, { status: 400 })
        }
        oldName = cur.name
        allowed.name = newName
      }
    }

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: 'Τίποτα προς ενημέρωση' }, { status: 400 })
    }

    const { data, error } = await admin
      .from('service_catalog')
      .update(allowed)
      .eq('id', id)
      .select('*')
      .single()

    if (error) {
      const msg = /unique|duplicate/i.test(error.message) ? 'Υπάρχει ήδη υπηρεσία με αυτό το όνομα' : error.message
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    let renamedServices = 0
    if (oldName && allowed.name) {
      const { data: upd, error: sErr } = await admin.from('services')
        .update({ name: allowed.name }).eq('name', oldName).select('id')
      if (sErr) {
        // Επαναφορά καταλόγου ώστε να μη μείνει ασυνέπεια.
        await admin.from('service_catalog').update({ name: oldName }).eq('id', id)
        return NextResponse.json({ error: 'Αποτυχία μετονομασίας στα πλυντήρια: ' + sErr.message }, { status: 500 })
      }
      renamedServices = upd?.length || 0
    }
    return NextResponse.json({ ok: true, item: data, renamedServices })
  } catch {
    return NextResponse.json({ error: 'Κάτι πήγε στραβά' }, { status: 500 })
  }
}
