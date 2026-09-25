import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'
import { alertCritical } from '@/lib/alert'
import { sendPush, getLocationOwnerId } from '@/lib/push'
import { shouldNotifyOwnerNow } from '@/lib/availability-server'
import { athensEpoch } from '@/lib/time'
import { Resend } from 'resend'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY)

const MONTHS_SHORT = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']

function cancellationEmailHtml(data: {
  bookingRef: string
  locationName: string
  service: string
  date: string
  time: string
  refundAmount: string
  isPartial: boolean
  isCash?: boolean
}) {
  const refundBox = data.isCash
    ? `<p style="color: #555; font-size: 12px; margin: 0; line-height: 1.6;">Η κράτηση ήταν με πληρωμή στο πλυντήριο — δεν υπάρχει καμία χρέωση.</p>`
    : `<p style="color: #E53E3E; font-size: 12px; margin: 0; line-height: 1.6;">
            💳 ${data.isPartial ? 'Μερική επιστροφή' : 'Πλήρης επιστροφή'} <strong>€${data.refundAmount}</strong> εντός <strong>5-7 εργάσιμων ημερών</strong>.
          </p>`
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; background: #fff;">
      <div style="background: #0A0A0A; padding: 32px; text-align: center; border-radius: 16px 16px 0 0;">
        <h1 style="color: white; font-size: 22px; font-weight: 600; margin: 0;">washio</h1>
      </div>
      <div style="padding: 32px; border: 1px solid #F0F0F0; border-top: none; border-radius: 0 0 16px 16px;">
        <div style="text-align: center; margin-bottom: 28px;">
          <div style="font-size: 36px; margin-bottom: 12px;">❌</div>
          <h2 style="font-size: 18px; font-weight: 600; color: #0A0A0A; margin: 0 0 6px;">Η κράτηση ακυρώθηκε</h2>
          <p style="color: #999; font-size: 13px; margin: 0;">Κωδικός: <strong>${data.bookingRef}</strong></p>
        </div>
        <div style="background: #F7F7F7; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Σταθμός</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">${data.locationName}</td></tr>
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Υπηρεσία</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">${data.service}</td></tr>
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Ημερομηνία</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">${data.date}</td></tr>
            <tr><td style="color: #999; padding: 6px 0;">Ώρα</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0;">${data.time}</td></tr>
          </table>
        </div>
        <div style="background: ${data.isCash ? '#F7F7F7' : '#FFF5F5'}; border-radius: 10px; padding: 14px 16px; margin-bottom: 24px;">
          ${refundBox}
        </div>
        <a href="https://washio.gr" style="display: block; background: #0A0A0A; color: white; text-align: center; padding: 14px; border-radius: 12px; text-decoration: none; font-size: 14px; font-weight: 500; margin-bottom: 24px;">Νέα κράτηση →</a>
        <p style="color: #CCC; font-size: 11px; text-align: center; margin: 0;">Washio · support@washio.gr</p>
      </div>
    </div>
  `
}

export async function POST(req: NextRequest) {
  try {
    const { bookingId, refundAmount, isPartial, reason, details } = await req.json()

    if (!bookingId) {
      return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 })
    }

    // Authorization: πρέπει να είναι συνδεδεμένος, ΚΑΙ admin Ή ιδιοκτήτης της κράτησης.
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Απαιτείται σύνδεση' }, { status: 401 })
    }
    const admin = isAdminEmail(user.email)

    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select(`
        id, booking_ref, slot_date, slot_start_time, total_amount,
        stripe_payment_intent_id, user_id, location_id, service_id,
        status, refund_amount, stripe_payment_status,
        locations(name, owner_id),
        services(name)
      `)
      .eq('id', bookingId)
      .single()

    if (fetchError || !booking) {
      console.error('Booking fetch error:', fetchError)
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    // Ποιος ακυρώνει: admin, ο πελάτης της κράτησης, ή ο ιδιοκτήτης του πλυντηρίου.
    const locOwnerId = (booking.locations as { owner_id?: string | null } | null)?.owner_id || null
    const isCustomer = booking.user_id === user.id
    const isOwner = !!locOwnerId && locOwnerId === user.id
    if (!admin && !isCustomer && !isOwner) {
      return NextResponse.json({ error: 'Δεν επιτρέπεται' }, { status: 403 })
    }

    // Μόνο ενεργές κρατήσεις ακυρώνονται — όχι ολοκληρωμένες / no-show / ήδη ακυρωμένες.
    if (!['confirmed', 'pending'].includes(String(booking.status))) {
      return NextResponse.json({ error: 'Η κράτηση δεν μπορεί να ακυρωθεί (έχει ολοκληρωθεί ή ακυρωθεί ήδη).' }, { status: 409 })
    }

    // Όριο πελάτη: όχι ακύρωση < 2 ώρες πριν (server-side — το UI μόνο δεν φτάνει).
    if (isCustomer && !admin && !isOwner) {
      const slotMs = athensEpoch(String(booking.slot_date), String(booking.slot_start_time || '00:00'))
      if (slotMs - Date.now() < 2 * 60 * 60 * 1000) {
        return NextResponse.json({ error: 'Δεν γίνεται ακύρωση λιγότερο από 2 ώρες πριν το ραντεβού.' }, { status: 409 })
      }
    }

    // Πληρωμή με κάρτα μέσω Stripe; ROBUST: αρκεί να ΥΠΑΡΧΕΙ payment_intent και
    // να ΜΗΝ είναι μετρητά/εξωτερική/ήδη-επιστραμμένη. (Το προηγούμενο `=== 'paid'`
    // ήταν πολύ αυστηρό — αν το status δεν ήταν ακριβώς «paid», μια card κράτηση
    // θεωρούνταν μετρητά και ΔΕΝ γινόταν refund.)
    const ps = booking.stripe_payment_status
    const nonCard = ['pay_at_venue', 'external', 'refunded', 'partially_refunded']
    const isCardPaid = !!booking.stripe_payment_intent_id && !nonCard.includes(String(ps))

    // Ποσό επιστροφής: μόνο admin ορίζει custom/partial. Πελάτης/ιδιοκτήτης = πλήρης.
    const totalAmount = Number(booking.total_amount)
    let finalRefundAmount = isCardPaid ? totalAmount : 0
    if (admin && isCardPaid && refundAmount != null) {
      finalRefundAmount = Number(refundAmount)
    }
    if (!(finalRefundAmount >= 0) || finalRefundAmount > totalAmount) {
      return NextResponse.json({ error: 'Μη έγκυρο ποσό επιστροφής' }, { status: 400 })
    }

    // ΑΤΟΜΙΚΗ δέσμευση: μεταβαίνει σε cancelled ΜΟΝΟ αν είναι ακόμα ενεργή.
    // Αν δύο αιτήματα τρέξουν ταυτόχρονα, μόνο το ένα «παίρνει» τη γραμμή →
    // αδύνατο διπλό refund. Γίνεται ΠΡΙΝ το Stripe.
    const { data: claimed } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancellation_reason: reason || (admin ? 'admin_refund' : isOwner ? 'owner_cancelled' : 'customer_cancelled'),
        cancellation_details: details || (isPartial ? `Μερική επιστροφή €${finalRefundAmount}` : isCardPaid ? 'Πλήρης επιστροφή' : 'Ακύρωση (χωρίς χρέωση)'),
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .in('status', ['confirmed', 'pending'])
      .select('id')
    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ error: 'Booking already cancelled' }, { status: 409 })
    }

    // Stripe refund (μόνο για κάρτα). Αν αποτύχει, ΕΠΑΝΑΦΕΡΟΥΜΕ την κράτηση.
    if (isCardPaid && finalRefundAmount > 0) {
      try {
        await stripe.refunds.create({
          payment_intent: booking.stripe_payment_intent_id as string,
          amount: Math.round(finalRefundAmount * 100), // σε λεπτά
          reason: 'requested_by_customer',
        })
        console.log(`Stripe refund: €${finalRefundAmount} for ${booking.booking_ref}`)
      } catch (stripeErr: unknown) {
        const isAlreadyRefundedStripe =
          stripeErr instanceof Stripe.errors.StripeError &&
          stripeErr.code === 'charge_already_refunded'
        if (!isAlreadyRefundedStripe) {
          // Rollback: η κράτηση παραμένει ενεργή, ο πελάτης ΔΕΝ έχασε τα λεφτά του.
          await supabase.from('bookings')
            .update({ status: booking.status, cancellation_reason: null, cancellation_details: null, cancelled_at: null })
            .eq('id', bookingId)
          const msg = stripeErr instanceof Error ? stripeErr.message : 'unknown'
          console.error('Stripe refund error:', msg)
          await alertCritical(
            'Αποτυχία refund',
            `booking: ${booking.booking_ref}\nΠοσό: €${finalRefundAmount}\nΣφάλμα: ${msg}`
          )
          return NextResponse.json({ error: 'Refund failed: ' + msg }, { status: 500 })
        }
      }
    }

    // Καταγραφή ποσού/κατάστασης πληρωμής (μετρητά: μένει όπως ήταν, refund 0).
    if (isCardPaid) {
      await supabase
        .from('bookings')
        .update({
          refund_amount: finalRefundAmount,
          stripe_payment_status: finalRefundAmount >= totalAmount ? 'refunded' : 'partially_refunded',
        })
        .eq('id', bookingId)
    }

    // Push στον πρατηριούχο: ακύρωση → το slot άνοιξε.
    // Ίδιος κανόνας με τις νέες κρατήσεις: μόνο σημερινές, εντός ωραρίου.
    try {
      if (await shouldNotifyOwnerNow(supabase, booking.location_id, booking.slot_date)) {
        const ownerId = await getLocationOwnerId(booking.location_id)
        const cd = new Date(booking.slot_date)
        await sendPush(ownerId, {
          title: 'Ακύρωση κράτησης ❌',
          body: `${booking.booking_ref} • ${cd.getDate()} ${MONTHS_SHORT[cd.getMonth()]} ${booking.slot_start_time?.slice(0, 5) || ''} — το slot άνοιξε.`,
          url: '/dashboard',
        })
      }
    } catch { /* best-effort */ }

    // «Άνοιξε ώρα κοντά σου» — ειδοποίησε no_availability waitlist εντός 12km
    // (best-effort, μία φορά ανά άτομο· first-come-first-served για το slot).
    try {
      const { data: loc } = await supabase.from('locations').select('lat, lng').eq('id', booking.location_id).single()
      if (loc?.lat != null && loc?.lng != null) {
        const toRad = (d: number) => (d * Math.PI) / 180
        const km = (aLat: number, aLng: number, bLat: number, bLng: number) => {
          const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng)
          const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
          return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
        }
        const { data: waiters } = await supabase
          .from('waitlist').select('id, email, lat, lng')
          .eq('source', 'no_availability').eq('notified', false)
        for (const w of waiters || []) {
          if (w.lat == null || w.lng == null || km(loc.lat as number, loc.lng as number, w.lat as number, w.lng as number) > 12) continue
          if (w.email) {
            await resend.emails.send({
              from: 'Washio <noreply@washio.gr>',
              to: w.email,
              subject: 'Άνοιξε ώρα κοντά σου!',
              html: `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;"><div style="background:#0A0A0A;padding:32px;text-align:center;border-radius:16px 16px 0 0;"><h1 style="color:#fff;font-size:22px;font-weight:600;margin:0;">washio</h1></div><div style="padding:32px;border:1px solid #F0F0F0;border-top:none;border-radius:0 0 16px 16px;"><h2 style="font-size:20px;font-weight:700;color:#0A0A0A;margin:0 0 14px;">Άνοιξε ώρα κοντά σου.</h2><p style="color:#444;font-size:14px;line-height:1.6;margin:0 0 24px;">Ελευθερώθηκε ώρα σε πλυντήριο κοντά σου. Κλείσ' την τώρα πριν την πάρει άλλος.</p><a href="https://washio.gr/map" style="display:block;background:#0A0A0A;color:#fff;text-align:center;padding:15px;border-radius:12px;text-decoration:none;font-size:15px;font-weight:600;margin-bottom:24px;">Κλείσε πλύσιμο</a><p style="color:#999;font-size:12px;margin:0;">— Η ομάδα του Washio</p></div></div>`,
            })
          }
          await supabase.from('waitlist').update({ notified: true }).eq('id', w.id)
        }
      }
    } catch { /* best-effort */ }

    // Get user email
    let userEmail: string | null = null
    if (booking.user_id) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', booking.user_id)
        .single()
      userEmail = profileData?.email || null

      if (!userEmail) {
        const { data: userData } = await supabase.auth.admin.getUserById(booking.user_id)
        userEmail = userData?.user?.email || null
      }
    }

    // Send email
    if (userEmail) {
      const date = new Date(booking.slot_date)
      const formattedDate = `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`

      try {
        await resend.emails.send({
          from: 'Washio <noreply@washio.gr>',
          to: userEmail,
          subject: `Ακύρωση κράτησης — ${booking.booking_ref}`,
          html: cancellationEmailHtml({
            bookingRef: booking.booking_ref,
            locationName: (booking.locations as { name?: string } | null)?.name || 'Washio',
            service: (booking.services as { name?: string } | null)?.name || 'Υπηρεσία',
            date: formattedDate,
            time: booking.slot_start_time?.slice(0, 5) || '',
            refundAmount: finalRefundAmount.toFixed(2),
            isPartial: !!isPartial,
            isCash: !isCardPaid,
          }),
        })
      } catch (emailErr: unknown) {
        console.error('Email send error:', emailErr instanceof Error ? emailErr.message : 'unknown')
      }
    }

    return NextResponse.json({ success: true, refunded: finalRefundAmount })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Σφάλμα'
    console.error('Cancel booking error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}