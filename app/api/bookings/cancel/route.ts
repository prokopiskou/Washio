import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
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
}) {
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
        <div style="background: #FFF5F5; border-radius: 10px; padding: 14px 16px; margin-bottom: 24px;">
          <p style="color: #E53E3E; font-size: 12px; margin: 0; line-height: 1.6;">
            💳 ${data.isPartial ? 'Μερική επιστροφή' : 'Πλήρης επιστροφή'} <strong>€${data.refundAmount}</strong> εντός <strong>5-7 εργάσιμων ημερών</strong>.
          </p>
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

    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select(`
        id, booking_ref, slot_date, slot_start_time, total_amount,
        stripe_payment_intent_id, user_id, location_id, service_id,
        locations(name),
        services(name)
      `)
      .eq('id', bookingId)
      .single()

    if (fetchError || !booking) {
      console.error('Booking fetch error:', fetchError)
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const finalRefundAmount = refundAmount
      ? Number(refundAmount)
      : Number(booking.total_amount)

    // Stripe refund
    if (booking.stripe_payment_intent_id) {
      try {
        await stripe.refunds.create({
          payment_intent: booking.stripe_payment_intent_id,
          amount: Math.round(finalRefundAmount * 100), // σε λεπτά
          reason: 'requested_by_customer',
        })
        console.log(`Stripe refund: €${finalRefundAmount} for ${booking.booking_ref}`)
      } catch (stripeErr: any) {
        console.error('Stripe refund error:', stripeErr.message)
        return NextResponse.json({ error: 'Refund failed: ' + stripeErr.message }, { status: 500 })
      }
    }

    // Update booking
    await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancellation_reason: reason || 'admin_refund',
        cancellation_details: details || (isPartial ? `Μερική επιστροφή €${finalRefundAmount}` : 'Πλήρης επιστροφή'),
        cancelled_at: new Date().toISOString(),
        refund_amount: finalRefundAmount,
      })
      .eq('id', bookingId)

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
            locationName: (booking.locations as any)?.name || 'Washio',
            service: (booking.services as any)?.name || 'Υπηρεσία',
            date: formattedDate,
            time: booking.slot_start_time?.slice(0, 5) || '',
            refundAmount: finalRefundAmount.toFixed(2),
            isPartial: !!isPartial,
          }),
        })
      } catch (emailErr: any) {
        console.error('Email send error:', emailErr.message)
      }
    }

    return NextResponse.json({ success: true, refunded: finalRefundAmount })
  } catch (error: any) {
    console.error('Cancel booking error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}