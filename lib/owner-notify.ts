import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

// Ειδοποίηση πρατηριούχου με EMAIL για ΚΑΘΕ νέα κράτηση (και μελλοντικές).
// Το push μένει μόνο για σημερινές/εντός ωραρίου — το email καλύπτει τα υπόλοιπα,
// ώστε ο πρατηριούχος να μη χάνει καμία κράτηση.
//
// ΣΗΜΑΝΤΙΚΟ: καλείται ΜΟΝΟ τη στιγμή δημιουργίας μιας νέας κράτησης
// (webhook κάρτας / create-cash). Δεν υπάρχει backfill — παλιές κρατήσεις
// δεν ξαναστέλνουν ποτέ email.

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const resend = new Resend(process.env.RESEND_API_KEY)

const BASE_URL = 'https://washio.gr'
const MONTHS_SHORT = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ']

// Βρίσκει το email του πρατηριούχου από το owner_id (profiles → auth fallback).
async function getOwnerEmail(ownerId: string | null | undefined): Promise<string | null> {
  if (!ownerId) return null
  try {
    const { data: profile } = await admin
      .from('profiles')
      .select('email')
      .eq('id', ownerId)
      .maybeSingle()
    if (profile?.email) return profile.email as string
    const { data: userData } = await admin.auth.admin.getUserById(ownerId)
    return userData?.user?.email || null
  } catch {
    return null
  }
}

function ownerEmailHtml(data: {
  bookingRef: string
  locationName: string
  service: string
  date: string
  time: string
  plate: string
  total: string
  isCash: boolean
}): string {
  const payBox = data.isCash
    ? `<div style="background:#FFF7ED;border-radius:10px;padding:14px 16px;margin-bottom:24px;">
         <p style="color:#B45309;font-size:13px;margin:0;line-height:1.6;">
           💵 <strong>Μετρητά στο κατάστημα.</strong> Εισπράττεις εσύ <strong>€${data.total}</strong> κατά την παράδοση.
         </p>
       </div>`
    : `<div style="background:#F0F7FF;border-radius:10px;padding:14px 16px;margin-bottom:24px;">
         <p style="color:#1A6FD4;font-size:13px;margin:0;line-height:1.6;">
           💳 <strong>Εξοφλημένη online.</strong> Μη ζητήσεις χρήματα — τα <strong>€${data.total}</strong> έχουν πληρωθεί με κάρτα.
         </p>
       </div>`
  return `
    <div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;background:#fff;">
      <div style="background:#0A0A0A;padding:32px;text-align:center;border-radius:16px 16px 0 0;">
        <h1 style="color:#fff;font-size:22px;font-weight:600;margin:0;letter-spacing:-0.5px;">washio</h1>
        <p style="color:#666;font-size:12px;margin:6px 0 0;">Νέα κράτηση στο πρατήριό σου</p>
      </div>
      <div style="padding:32px;border:1px solid #F0F0F0;border-top:none;border-radius:0 0 16px 16px;">
        <div style="text-align:center;margin-bottom:24px;">
          <h2 style="font-size:18px;font-weight:600;color:#0A0A0A;margin:0 0 6px;">📅 Νέα κράτηση</h2>
          <p style="color:#999;font-size:13px;margin:0;">${data.locationName}</p>
        </div>
        <div style="background:#F7F7F7;border-radius:12px;padding:20px;margin-bottom:20px;">
          <table style="width:100%;font-size:13px;border-collapse:collapse;">
            <tr><td style="color:#999;padding:6px 0;border-bottom:1px solid #EFEFEF;">Κωδικός</td><td style="color:#0A0A0A;font-weight:600;text-align:right;padding:6px 0;border-bottom:1px solid #EFEFEF;font-family:monospace;">${data.bookingRef}</td></tr>
            <tr><td style="color:#999;padding:6px 0;border-bottom:1px solid #EFEFEF;">Υπηρεσία</td><td style="color:#0A0A0A;font-weight:500;text-align:right;padding:6px 0;border-bottom:1px solid #EFEFEF;">${data.service}</td></tr>
            <tr><td style="color:#999;padding:6px 0;border-bottom:1px solid #EFEFEF;">Ημερομηνία</td><td style="color:#0A0A0A;font-weight:500;text-align:right;padding:6px 0;border-bottom:1px solid #EFEFEF;">${data.date}</td></tr>
            <tr><td style="color:#999;padding:6px 0;border-bottom:1px solid #EFEFEF;">Ώρα</td><td style="color:#0A0A0A;font-weight:500;text-align:right;padding:6px 0;border-bottom:1px solid #EFEFEF;">${data.time}</td></tr>
            <tr><td style="color:#999;padding:6px 0;">Πινακίδα</td><td style="color:#0A0A0A;font-weight:500;text-align:right;padding:6px 0;">${data.plate || '—'}</td></tr>
          </table>
        </div>
        ${payBox}
        <a href="${BASE_URL}/dashboard" style="display:block;background:#0A0A0A;color:#fff;text-align:center;padding:14px;border-radius:12px;text-decoration:none;font-size:14px;font-weight:500;">Άνοιξε το πρόγραμμα →</a>
      </div>
    </div>
  `
}

// Στέλνει ένα email στον πρατηριούχο για μια νέα κράτηση. Best-effort:
// ΠΟΤΕ δεν πετάει — δεν μπλοκάρει τη ροή κράτησης.
export async function sendOwnerBookingEmail(
  db: SupabaseClient,
  args: {
    ownerId?: string | null
    locationId: string
    locationName?: string | null
    bookingRef: string
    serviceName?: string | null
    slotDate: string
    slotStartTime?: string | null
    carPlate?: string | null
    total: number
    isCash: boolean
  }
): Promise<void> {
  try {
    let ownerId = args.ownerId || null
    let locationName = args.locationName || null
    if (!ownerId || !locationName) {
      const { data: loc } = await db
        .from('locations')
        .select('owner_id, name')
        .eq('id', args.locationId)
        .maybeSingle()
      ownerId = ownerId || (loc?.owner_id as string) || null
      locationName = locationName || (loc?.name as string) || null
    }

    const ownerEmail = await getOwnerEmail(ownerId)
    if (!ownerEmail) return

    const d = new Date(args.slotDate)
    const formattedDate = isNaN(d.getTime())
      ? args.slotDate
      : `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`

    await resend.emails.send({
      from: 'Washio <noreply@washio.gr>',
      to: ownerEmail,
      subject: `📅 Νέα κράτηση — ${args.bookingRef}`,
      html: ownerEmailHtml({
        bookingRef: args.bookingRef,
        locationName: locationName || 'Το πρατήριό σου',
        service: args.serviceName || 'Υπηρεσία',
        date: formattedDate,
        time: (args.slotStartTime || '').slice(0, 5),
        plate: args.carPlate || '',
        total: Number(args.total || 0).toFixed(2),
        isCash: args.isCash,
      }),
    })
  } catch (e) {
    console.error('Owner booking email error:', e instanceof Error ? e.message : 'unknown')
  }
}
