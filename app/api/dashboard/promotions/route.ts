import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'

// Dashboard πλυντηρίου → «Προωθήσεις».
//  GET    ?location=<id>                 → λίστα προωθήσεων
//  POST   { locationId, serviceId, discountType, discountValue, startsOn, endsOn } → νέα
//  PATCH  { id, isActive }               → παύση / ενεργοποίηση
// Μόνο ο ιδιοκτήτης του πλυντηρίου (ή admin).
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const YMD = /^\d{4}-\d{2}-\d{2}$/
const athensToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(new Date())

async function canManage(locationId: string) {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  if (isAdminEmail(user.email)) return user
  const { data: loc } = await admin.from('locations').select('owner_id').eq('id', locationId).maybeSingle()
  return loc?.owner_id === user.id ? user : null
}

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get('location') || ''
  if (!locationId || !(await canManage(locationId))) return NextResponse.json({ error: 'Χωρίς πρόσβαση' }, { status: 403 })
  const { data, error } = await admin.from('promotions')
    .select('id, service_id, discount_type, discount_value, starts_on, ends_on, is_active, created_at')
    .eq('location_id', locationId).order('created_at', { ascending: false }).limit(50)
  if (error) return NextResponse.json({ error: error.message, promotions: [] }, { status: 200 })
  return NextResponse.json({ promotions: data || [] })
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { locationId?: string; serviceId?: string; discountType?: string; discountValue?: number; startsOn?: string; endsOn?: string }
  const locationId = String(b.locationId || '')
  const user = locationId ? await canManage(locationId) : null
  if (!user) return NextResponse.json({ error: 'Χωρίς πρόσβαση' }, { status: 403 })

  const type = b.discountType === 'amount' ? 'amount' : 'percent'
  const value = Math.round(Number(b.discountValue) * 100) / 100
  const startsOn = String(b.startsOn || ''), endsOn = String(b.endsOn || '')
  if (!YMD.test(startsOn) || !YMD.test(endsOn) || endsOn < startsOn) return NextResponse.json({ error: 'Λάθος ημερομηνίες' }, { status: 400 })
  if (endsOn < athensToday()) return NextResponse.json({ error: 'Η λήξη είναι στο παρελθόν' }, { status: 400 })
  if (!(value > 0) || (type === 'percent' && value > 90)) return NextResponse.json({ error: 'Λάθος έκπτωση (έως 90%)' }, { status: 400 })

  const { data: svc } = await admin.from('services').select('id, price, is_range').eq('id', b.serviceId || '').eq('location_id', locationId).maybeSingle()
  if (!svc) return NextResponse.json({ error: 'Η υπηρεσία δεν βρέθηκε' }, { status: 400 })
  if (svc.is_range) return NextResponse.json({ error: 'Δεν γίνεται προώθηση σε υπηρεσία με εύρος τιμής' }, { status: 400 })
  if (type === 'amount' && value >= Number(svc.price)) return NextResponse.json({ error: 'Η έκπτωση είναι μεγαλύτερη από την τιμή' }, { status: 400 })

  const { data, error } = await admin.from('promotions').insert({
    location_id: locationId, service_id: svc.id, discount_type: type, discount_value: value,
    starts_on: startsOn, ends_on: endsOn, is_active: true, created_by: user.id,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data.id })
}

export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => ({})) as { id?: string; isActive?: boolean }
  const { data: p } = await admin.from('promotions').select('id, location_id').eq('id', b.id || '').maybeSingle()
  if (!p || !(await canManage(p.location_id))) return NextResponse.json({ error: 'Χωρίς πρόσβαση' }, { status: 403 })
  const { error } = await admin.from('promotions').update({ is_active: !!b.isActive }).eq('id', p.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
