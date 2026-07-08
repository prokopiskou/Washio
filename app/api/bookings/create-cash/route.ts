import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { Resend } from 'resend'
import { alertCritical } from '@/lib/alert'
import { sendPush, getLocationOwnerId } from '@/lib/push'

// Κράτηση με ΜΕΤΡΗΤΑ στο κατάστημα — δεν περνάει από Stripe.
// Το ραντεβού δημιουργείται κατευθείαν (pay_at_venue). Το platform_fee
// καταγράφεται για ξεχωριστή είσπραξη/τιμολόγηση από το πλυντήριο.

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY)

const BASE_URL = 'https://washio.gr'
const MONTHS_SHORT = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']

function cashEmailHtml(data: {
  bookingRef: string; locationName: string; service: string
  date: string; time: string; plate: string; total: string
}) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; background: #fff;">
      <div style="background: #0A0A0A; padding: 32px; text-align: center; border-radius: 16px 16px 0 0;">
        <h1 style="color: white; font-size: 22px; font-weight: 600; margin: 0; letter-spacing: -0.5px;">washio</h1>
        <p style="color: #666; font-size: 12px; margin: 6px 0 0;">Πλύσιμο αυτοκινήτου με ένα tap</p>
      </div>
      <div style="padding: 32px; border: 1px solid #F0F0F0; border-top: none; border-radius: 0 0 16px 16px;">
        <div style="text-align: center; margin-bottom: 28px;">
          <h2 style="font-size: 18px; font-weight: 600; color: #0A0A0A; margin: 0 0 6px;">Η κράτησή σου επιβεβαιώθηκε!</h2>
          <p style="color: #999; font-size: 13px; margin: 0;">Πληρωμή με μετρητά στο κατάστημα.</p>
        </div>
        <div style="background: #F7F7F7; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Κωδικός κράτησης</td><td style="color: #0A0A0A; font-weight: 600; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF; font-family: monospace;">${data.bookingRef}</td></tr>
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Σταθμός</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">${data.locationName}</td></tr>
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Υπηρεσία</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">${data.service}</td></tr>
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Ημερομηνία</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">${data.date}</td></tr>
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Ώρα</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">${data.time}</td></tr>
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Πινακίδα</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">${data.plate}</td></tr>
            <tr><td style="color: #0A0A0A; font-weight: 600; padding: 8px 0 0;">Πληρωτέο (μετρητά)</td><td style="color: #0A0A0A; font-weight: 700; text-align: right; padding: 8px 0 0; font-size: 15px;">€${data.total}</td></tr>
          </table>
        </div>
        <div style="background: #FFF7ED; border-radius: 10px; padding: 14px 16px; margin-bottom: 24px;">
          <p style="color: #B45309; font-size: 12px; margin: 0; line-height: 1.6;">
            💵 Η πληρωμή γίνεται με <strong>μετρητά στο κατάστημα</strong>.<br/>
            Κράτα τον κωδικό <strong>${data.bookingRef}</strong> για οποιαδήποτε αλλαγή.
          </p>
        </div>
        <a href="${BASE_URL}" style="display: block; background: #0A0A0A; color: white; text-align: center; padding: 14px; border-radius: 12px; text-decoration: none; font-size: 14px; font-weight: 500;">Δες τις κρατήσεις σου →</a>
      </div>
    </div>
  `
}

export async function POST(req: NextRequest) {
  try {
    const {
      serviceId, locationId, slotId, slotDate,
      slotStartTime, carPlate, serviceName, vehicleType, addonIds,
    } = await req.json()

    // 1) Auth — η ταυτότητα ΔΕΝ έρχεται από τον client.
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })
    }

    if (!serviceId || !locationId || !slotDate || !slotStartTime) {
      return NextResponse.json({ error: 'Λείπουν στοιχεία κράτησης' }, { status: 400 })
    }

    // 2) Τιμή server-side από τη DB — ποτέ από τον client.
    const { data: service, error: serviceErr } = await admin
      .from('services')
      .select('id, name, price, price_moto')
      .eq('id', serviceId)
      .single()

    if (serviceErr || !service) {
      return NextResponse.json({ error: 'Άκυρη υπηρεσία' }, { status: 400 })
    }

    const isMoto = vehicleType === 'Μοτοσικλέτα'
    let amount = isMoto && service.price_moto != null ? Number(service.price_moto) : Number(service.price)

    const requestedAddonIds: string[] = Array.isArray(addonIds) ? addonIds : []
    if (requestedAddonIds.length > 0) {
      const { data: locAddons } = await admin
        .from('location_addons')
        .select('addon_id, price_override, addons(price)')
        .eq('location_id', locationId)
        .in('addon_id', requestedAddonIds)

      for (const a of locAddons || []) {
        const priceOverride = (a as { price_override: number | null }).price_override
        const basePrice = (a as { addons?: { price?: number } }).addons?.price
        amount += Number(priceOverride ?? basePrice ?? 0)
      }
    }

    if (!(amount > 0)) {
      return NextResponse.json({ error: 'Μη έγκυρο ποσό' }, { status: 400 })
    }

    // 3) Re-check διαθεσιμότητας slot.
    const { data: existingBookings } = await admin
      .from('bookings')
      .select('id')
      .eq('location_id', locationId)
      .eq('slot_date', slotDate)
      .eq('slot_start_time', slotStartTime)
      .not('status', 'in', '("cancelled")')

    if (existingBookings && existingBookings.length > 0) {
      return NextResponse.json({ error: 'Το slot μόλις κλείστηκε. Διάλεξε άλλη ώρα.' }, { status: 409 })
    }

    // 4) Δημιουργία κράτησης — ΜΕΤΡΗΤΑ (χωρίς Stripe).
    const bookingRef = 'WS-' + Math.random().toString(16).slice(2, 10).toUpperCase()

    const { error: insertError } = await admin.from('bookings').insert({
      booking_ref: bookingRef,
      user_id: user.id,
      location_id: locationId,
      service_id: serviceId,
      slot_id: slotId || null,
      slot_date: slotDate,
      slot_start_time: slotStartTime,
      car_plate: carPlate || null,
      total_amount: amount,
      platform_fee: amount * 0.10,
      stripe_payment_intent_id: null,
      stripe_payment_status: 'pay_at_venue',
      paid_at: null,
      status: 'confirmed',
    })

    if (insertError) {
      console.error('Cash booking insert error:', insertError)
      await alertCritical(
        'Cash booking ΑΠΕΤΥΧΕ',
        `user: ${user.id}\nΠοσό: €${amount}\nΣφάλμα: ${insertError.message}`
      )
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    // Push στον πρατηριούχο: νέα κράτηση (μετρητά).
    try {
      const ownerId = await getLocationOwnerId(locationId)
      const dPush = new Date(slotDate)
      await sendPush(ownerId, {
        title: 'Νέα κράτηση 💵',
        body: `${serviceName || service.name || 'Πλύσιμο'} • ${dPush.getDate()} ${MONTHS_SHORT[dPush.getMonth()]} ${(slotStartTime as string)?.slice(0, 5) || ''}${carPlate ? ' • ' + carPlate : ''} • Μετρητά`,
        url: '/dashboard',
      })
    } catch { /* best-effort */ }

    // 5) Επιβεβαιωτικό email (best-effort).
    try {
      const { data: locationData } = await admin
        .from('locations').select('name').eq('id', locationId).single()

      let userEmail = user.email || null
      if (!userEmail) {
        const { data: profileData } = await admin
          .from('profiles').select('email').eq('id', user.id).single()
        userEmail = profileData?.email || null
      }

      if (userEmail) {
        const d = new Date(slotDate)
        const formattedDate = `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
        await resend.emails.send({
          from: 'Washio <noreply@washio.gr>',
          to: userEmail,
          subject: `✓ Η κράτησή σου επιβεβαιώθηκε — ${bookingRef}`,
          html: cashEmailHtml({
            bookingRef,
            locationName: locationData?.name || 'Washio',
            service: serviceName || service.name || 'Υπηρεσία',
            date: formattedDate,
            time: (slotStartTime as string)?.slice(0, 5) || '',
            plate: carPlate || '',
            total: amount.toFixed(0),
          }),
        })
      }
    } catch (emailErr: unknown) {
      console.error('Cash email error:', emailErr instanceof Error ? emailErr.message : 'unknown')
    }

    return NextResponse.json({ bookingRef })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Σφάλμα'
    await alertCritical('Αποτυχία create-cash', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
