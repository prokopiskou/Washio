import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'

// Διαχείριση ΚΕΝΤΡΙΚΟΥ καταλόγου βασικών υπηρεσιών — ΜΟΝΟ admin.
// POST  = προσθήκη νέας βασικής υπηρεσίας
// PATCH = ενημέρωση (is_active, duration_minutes, vehicles, sort_order)

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

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: 'Τίποτα προς ενημέρωση' }, { status: 400 })
    }

    const { data, error } = await admin
      .from('service_catalog')
      .update(allowed)
      .eq('id', id)
      .select('*')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, item: data })
  } catch {
    return NextResponse.json({ error: 'Κάτι πήγε στραβά' }, { status: 500 })
  }
}
