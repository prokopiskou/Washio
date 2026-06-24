import { Resend } from 'resend'
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isAdminEmail } from '@/lib/admins'

const resend = new Resend(process.env.RESEND_API_KEY)

const BASE_URL = 'https://washio.gr'
// Inbox όπου καταλήγουν τα μηνύματα της φόρμας επικοινωνίας.
const CONTACT_INBOX = 'withinsuccess@gmail.com'

function confirmationEmail(data: {
  bookingRef: string
  locationName: string
  service: string
  date: string
  time: string
  plate: string
  total: string
}) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; background: #fff;">
      <div style="background: #0A0A0A; padding: 32px; text-align: center; border-radius: 16px 16px 0 0;">
        <h1 style="color: white; font-size: 22px; font-weight: 600; margin: 0; letter-spacing: -0.5px;">washio</h1>
        <p style="color: #666; font-size: 12px; margin: 6px 0 0;">Πλύσιμο αυτοκινήτου με ένα tap</p>
      </div>
      <div style="padding: 32px; border: 1px solid #F0F0F0; border-top: none; border-radius: 0 0 16px 16px;">
        <div style="text-align: center; margin-bottom: 28px;">
          <div style="width: 48px; height: 48px; background: #0A0A0A; border-radius: 50%; margin: 0 auto 12px auto; text-align: center; line-height: 48px;">
            <span style="color: white; font-size: 20px;">✓</span>
          </div>
          <h2 style="font-size: 18px; font-weight: 600; color: #0A0A0A; margin: 0 0 6px;">Η κράτησή σου επιβεβαιώθηκε!</h2>
          <p style="color: #999; font-size: 13px; margin: 0;">Τα στοιχεία της κράτησής σου παρακάτω.</p>
        </div>
        <div style="background: #F7F7F7; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Κωδικός κράτησης</td><td style="color: #0A0A0A; font-weight: 600; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF; font-family: monospace;">${data.bookingRef}</td></tr>
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Σταθμός</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">${data.locationName}</td></tr>
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Υπηρεσία</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">${data.service}</td></tr>
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Ημερομηνία</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">${data.date}</td></tr>
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Ώρα</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">${data.time}</td></tr>
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Πινακίδα</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">${data.plate}</td></tr>
            <tr><td style="color: #0A0A0A; font-weight: 600; padding: 8px 0 0;">Σύνολο</td><td style="color: #0A0A0A; font-weight: 700; text-align: right; padding: 8px 0 0; font-size: 15px;">€${data.total}</td></tr>
          </table>
        </div>
        <div style="background: #F0F7FF; border-radius: 10px; padding: 14px 16px; margin-bottom: 24px;">
          <p style="color: #1A6FD4; font-size: 12px; margin: 0; line-height: 1.6;">
            📍 Θα λάβεις υπενθύμιση <strong>1 ώρα πριν</strong> την κράτησή σου.<br/>
            Κράτα τον κωδικό <strong>${data.bookingRef}</strong> για οποιαδήποτε αλλαγή.
          </p>
        </div>
        <a href="${BASE_URL}" style="display: block; background: #0A0A0A; color: white; text-align: center; padding: 14px; border-radius: 12px; text-decoration: none; font-size: 14px; font-weight: 500; margin-bottom: 24px;">Δες τις κρατήσεις σου →</a>
        <p style="color: #CCC; font-size: 11px; text-align: center; margin: 0;">Washio · Γλυφάδα, Αθήνα · <a href="${BASE_URL}" style="color: #CCC;">washio.gr</a></p>
      </div>
    </div>
  `
}

function reminderEmail(data: {
  bookingRef: string
  locationName: string
  locationAddress: string
  service: string
  date: string
  time: string
  plate: string
}) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; background: #fff;">
      <div style="background: #0A0A0A; padding: 32px; text-align: center; border-radius: 16px 16px 0 0;">
        <h1 style="color: white; font-size: 22px; font-weight: 600; margin: 0;">washio</h1>
        <p style="color: #666; font-size: 12px; margin: 6px 0 0;">Υπενθύμιση κράτησης</p>
      </div>
      <div style="padding: 32px; border: 1px solid #F0F0F0; border-top: none; border-radius: 0 0 16px 16px;">
        <div style="text-align: center; margin-bottom: 28px;">
          <div style="font-size: 36px; margin-bottom: 12px;">⏰</div>
          <h2 style="font-size: 18px; font-weight: 600; color: #0A0A0A; margin: 0 0 6px;">Σε 1 ώρα η κράτησή σου!</h2>
          <p style="color: #999; font-size: 13px; margin: 0;">Μην ξεχαστείς — σε περιμένουμε.</p>
        </div>
        <div style="background: #F7F7F7; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Σταθμός</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">${data.locationName}</td></tr>
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Διεύθυνση</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">${data.locationAddress}</td></tr>
            <tr><td style="color: #999; padding: 6px 0; border-bottom: 1px solid #EFEFEF;">Ώρα</td><td style="color: #0A0A0A; font-weight: 600; text-align: right; padding: 6px 0; border-bottom: 1px solid #EFEFEF; font-size: 15px;">${data.time}</td></tr>
            <tr><td style="color: #999; padding: 6px 0;">Πινακίδα</td><td style="color: #0A0A0A; font-weight: 500; text-align: right; padding: 6px 0;">${data.plate}</td></tr>
          </table>
        </div>
        <a href="https://maps.google.com/?q=${encodeURIComponent(data.locationAddress)}" style="display: block; background: #0A0A0A; color: white; text-align: center; padding: 14px; border-radius: 12px; text-decoration: none; font-size: 14px; font-weight: 500; margin-bottom: 12px;">📍 Οδηγίες στο χάρτη →</a>
        <p style="color: #CCC; font-size: 11px; text-align: center; margin: 16px 0 0;">Washio · ${data.bookingRef}</p>
      </div>
    </div>
  `
}

function followUpEmail(data: {
  bookingRef: string
  locationName: string
  service: string
  firstName: string
}) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; background: #fff;">
      <div style="background: #0A0A0A; padding: 32px; text-align: center; border-radius: 16px 16px 0 0;">
        <h1 style="color: white; font-size: 22px; font-weight: 600; margin: 0;">washio</h1>
      </div>
      <div style="padding: 32px; border: 1px solid #F0F0F0; border-top: none; border-radius: 0 0 16px 16px;">
        <div style="text-align: center; margin-bottom: 28px;">
          <div style="font-size: 36px; margin-bottom: 12px;">✨</div>
          <h2 style="font-size: 18px; font-weight: 600; color: #0A0A0A; margin: 0 0 6px;">Πώς πήγε το πλύσιμο${data.firstName ? ', ' + data.firstName : ''}?</h2>
          <p style="color: #999; font-size: 13px; margin: 0;">Η εμπειρία σου μας βοηθάει να γίνουμε καλύτεροι.</p>
        </div>
        <div style="background: #F7F7F7; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;">
          <p style="color: #666; font-size: 13px; margin: 0 0 16px;">Πώς βαθμολογείς την εμπειρία σου;</p>
          <div style="display: flex; justify-content: center; gap: 8px;">
            ${[1,2,3,4,5].map(n => `<a href="${BASE_URL}/review?ref=${data.bookingRef}&rating=${n}" style="display: inline-block; width: 44px; height: 44px; background: white; border: 1px solid #E5E5E5; border-radius: 10px; text-align: center; line-height: 44px; text-decoration: none; font-size: 20px;">${n}⭐</a>`).join('')}
          </div>
        </div>
        <a href="${BASE_URL}" style="display: block; background: #0A0A0A; color: white; text-align: center; padding: 14px; border-radius: 12px; text-decoration: none; font-size: 14px; font-weight: 500; margin-bottom: 24px;">Νέα κράτηση →</a>
        <p style="color: #CCC; font-size: 11px; text-align: center; margin: 0;">Washio · ${data.bookingRef}</p>
      </div>
    </div>
  `
}

function cancellationEmail(data: {
  bookingRef: string
  locationName: string
  service: string
  date: string
  time: string
  total: string
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
          <p style="color: #E53E3E; font-size: 12px; margin: 0; line-height: 1.6;">Αν η χρέωση έχει ήδη πραγματοποιηθεί, η επιστροφή θα γίνει εντός <strong>5-7 εργάσιμων ημερών</strong>.</p>
        </div>
        <a href="${BASE_URL}" style="display: block; background: #0A0A0A; color: white; text-align: center; padding: 14px; border-radius: 12px; text-decoration: none; font-size: 14px; font-weight: 500; margin-bottom: 24px;">Νέα κράτηση →</a>
        <p style="color: #CCC; font-size: 11px; text-align: center; margin: 0;">Washio · support@washio.gr</p>
      </div>
    </div>
  `
}

function partnerPreApprovalEmail(data: {
  businessName: string
}) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; background: #fff;">
      <div style="background: #0A0A0A; padding: 32px; text-align: center; border-radius: 16px 16px 0 0;">
        <h1 style="color: white; font-size: 22px; font-weight: 600; margin: 0; letter-spacing: -0.5px;">washio</h1>
        <p style="color: #666; font-size: 12px; margin: 6px 0 0;">Πλατφόρμα Συνεργαζόμενων Σημείων</p>
      </div>
      <div style="padding: 32px; border: 1px solid #F0F0F0; border-top: none; border-radius: 0 0 16px 16px;">
        <div style="text-align: center; margin-bottom: 28px;">
          <div style="font-size: 36px; margin-bottom: 12px;">🎉</div>
          <h2 style="font-size: 18px; font-weight: 600; color: #0A0A0A; margin: 0 0 8px;">Η αίτησή σας έγινε αποδεκτή!</h2>
          <p style="color: #666; font-size: 13px; margin: 0; line-height: 1.6;">
            Καλησπέρα από την ομάδα του Washio.<br/>
            Χαρούμαστε που το <strong>${data.businessName}</strong> θα είναι μέρος του δικτύου μας.
          </p>
        </div>

        <div style="background: #F7F7F7; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <p style="color: #0A0A0A; font-size: 13px; font-weight: 600; margin: 0 0 12px;">Για να ολοκληρωθεί η εγγραφή σας, παρακαλούμε στείλτε μας τα παρακάτω έγγραφα:</p>
          <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #EFEFEF; color: #444;">
                <span style="color: #0A0A0A; font-weight: 600;">1.</span> ΑΦΜ επιχείρησης
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #EFEFEF; color: #444;">
                <span style="color: #0A0A0A; font-weight: 600;">2.</span> IBAN τραπεζικού λογαριασμού & όνομα τράπεζας
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #EFEFEF; color: #444;">
                <span style="color: #0A0A0A; font-weight: 600;">3.</span> Υπεύθυνη δήλωση συνεργασίας (PDF)
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #444;">
                <span style="color: #0A0A0A; font-weight: 600;">4.</span> Υπογεγραμμένο συμφωνητικό (PDF)
              </td>
            </tr>
          </table>
        </div>

        <div style="background: #F0F7FF; border-radius: 10px; padding: 14px 16px; margin-bottom: 24px;">
          <p style="color: #1A6FD4; font-size: 13px; margin: 0; line-height: 1.6;">
            📧 Στείλτε τα έγγραφα στο:<br/>
            <strong>withinsuccess@gmail.com</strong><br/>
            <span style="font-size: 12px; color: #666;">με θέμα: Έγγραφα Συνεργασίας — ${data.businessName}</span>
          </p>
        </div>

        <div style="border: 1px solid #F0F0F0; border-radius: 10px; padding: 14px 16px; margin-bottom: 24px;">
          <p style="color: #666; font-size: 12px; margin: 0; line-height: 1.8;">
            Μόλις παραλάβουμε και επαληθεύσουμε τα έγγραφά σας θα:
            <br/>✓ Ενεργοποιήσουμε το σημείο σας στην πλατφόρμα
            <br/>✓ Σας στείλουμε πρόσβαση στο dashboard διαχείρισης
            <br/>✓ Ξεκινήσουν οι κρατήσεις αυτόματα
          </p>
        </div>

        <p style="color: #999; font-size: 12px; text-align: center; margin: 0 0 8px;">Για οποιαδήποτε απορία είμαστε στη διάθεσή σας.</p>
        <p style="color: #CCC; font-size: 11px; text-align: center; margin: 0;">Η ομάδα Washio · withinsuccess@gmail.com</p>
      </div>
    </div>
  `
}

function partnerWelcomeEmail(data: {
  businessName: string
}) {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; background: #fff;">
      <div style="background: #0A0A0A; padding: 32px; text-align: center; border-radius: 16px 16px 0 0;">
        <h1 style="color: white; font-size: 22px; font-weight: 600; margin: 0; letter-spacing: -0.5px;">washio</h1>
        <p style="color: #666; font-size: 12px; margin: 6px 0 0;">Καλωσορίσατε στο δίκτυο</p>
      </div>
      <div style="padding: 32px; border: 1px solid #F0F0F0; border-top: none; border-radius: 0 0 16px 16px;">
        <div style="text-align: center; margin-bottom: 28px;">
          <div style="width: 48px; height: 48px; background: #0A0A0A; border-radius: 50%; margin: 0 auto 12px auto; text-align: center; line-height: 48px;">
            <span style="color: white; font-size: 20px;">✓</span>
          </div>
          <h2 style="font-size: 18px; font-weight: 600; color: #0A0A0A; margin: 0 0 8px;">Είστε πλέον ενεργό σημείο!</h2>
          <p style="color: #666; font-size: 13px; margin: 0; line-height: 1.6;">
            Το <strong>${data.businessName}</strong> είναι ενεργό στο Washio.<br/>
            Οι κρατήσεις ξεκινούν τώρα.
          </p>
        </div>

        <div style="background: #F7F7F7; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <p style="color: #0A0A0A; font-size: 13px; font-weight: 600; margin: 0 0 12px;">Πώς να ξεκινήσετε:</p>
          <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #EFEFEF; color: #444; vertical-align: top;">
                <span style="color: #0A0A0A; font-weight: 600;">Βήμα 1</span><br/>
                <span style="color: #666; font-size: 12px;">Ορίστε τον κωδικό σας μέσω του email που θα λάβετε</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #EFEFEF; color: #444; vertical-align: top;">
                <span style="color: #0A0A0A; font-weight: 600;">Βήμα 2</span><br/>
                <span style="color: #666; font-size: 12px;">Συνδεθείτε στο dashboard και ρυθμίστε το ωράριό σας</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #EFEFEF; color: #444; vertical-align: top;">
                <span style="color: #0A0A0A; font-weight: 600;">Βήμα 3</span><br/>
                <span style="color: #666; font-size: 12px;">Ενεργοποιήστε τις υπηρεσίες που προσφέρετε και ορίστε τις τιμές σας</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #444; vertical-align: top;">
                <span style="color: #0A0A0A; font-weight: 600;">Κάθε μέρα</span><br/>
                <span style="color: #666; font-size: 12px;">Βλέπετε τις κρατήσεις real-time. Κάθε 15 του μήνα η εκκαθάριση στον λογαριασμό σας.</span>
              </td>
            </tr>
          </table>
        </div>

        <a href="${BASE_URL}/dashboard" style="display: block; background: #0A0A0A; color: white; text-align: center; padding: 14px; border-radius: 12px; text-decoration: none; font-size: 14px; font-weight: 500; margin-bottom: 24px;">Μπες στο Dashboard →</a>

        <p style="color: #999; font-size: 12px; text-align: center; margin: 0 0 8px;">Για οποιαδήποτε απορία είμαστε στη διάθεσή σας.</p>
        <p style="color: #CCC; font-size: 11px; text-align: center; margin: 0;">Η ομάδα Washio · withinsuccess@gmail.com</p>
      </div>
    </div>
  `
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type = 'confirmation' } = body

    // Authorization ανά τύπο:
    //  - 'contact' (δημόσια φόρμα): επιτρέπεται, αλλά ο παραλήπτης ΚΛΕΙΔΩΝΕΤΑΙ server-side.
    //  - όλοι οι άλλοι (transactional): απαιτείται admin session Ή internal secret (cron).
    const isInternal = req.headers.get('x-internal-secret') === process.env.INTERNAL_API_SECRET
    let isAdmin = false
    if (!isInternal) {
      const supabase = await createServerClient()
      const { data: { user } } = await supabase.auth.getUser()
      isAdmin = isAdminEmail(user?.email)
    }

    if (type !== 'contact' && !isInternal && !isAdmin) {
      return NextResponse.json({ error: 'Δεν επιτρέπεται' }, { status: 403 })
    }

    // Ο παραλήπτης: για contact πάντα το εσωτερικό inbox (αποτρέπει open-relay/spam).
    const recipient = type === 'contact' ? CONTACT_INBOX : body.to
    if (!recipient) {
      return NextResponse.json({ error: 'Λείπει παραλήπτης' }, { status: 400 })
    }

    let subject = ''
    let html = ''

    switch (type) {
      case 'confirmation':
        subject = `✓ Η κράτησή σου επιβεβαιώθηκε — ${body.bookingRef}`
        html = confirmationEmail(body)
        break
      case 'reminder':
        subject = `⏰ Υπενθύμιση — Σε 1 ώρα η κράτησή σου`
        html = reminderEmail(body)
        break
      case 'followup':
        subject = `Πώς πήγε το πλύσιμο; — ${body.bookingRef}`
        html = followUpEmail(body)
        break
      case 'cancellation':
        subject = `Ακύρωση κράτησης — ${body.bookingRef}`
        html = cancellationEmail(body)
        break
      case 'partner_preapproval':
        subject = `✓ Η αίτησή σας έγινε αποδεκτή — Washio`
        html = partnerPreApprovalEmail(body)
        break
      case 'partner_welcome':
        subject = `🎉 Καλωσορίσατε στο Washio — ${body.businessName}`
        html = partnerWelcomeEmail(body)
        break
      case 'contact':
        subject = `Νέο μήνυμα από ${body.name} — Washio`
        html = `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
    <h2 style="color: #0A0A0A;">Νέο μήνυμα επικοινωνίας</h2>
    <p><strong>Όνομα:</strong> ${body.name}</p>
    <p><strong>Email:</strong> ${body.email}</p>
    <p><strong>Μήνυμα:</strong> ${body.message}</p>
  </div>`
        break
      default:
        return NextResponse.json({ error: 'Unknown email type' }, { status: 400 })
    }

    await resend.emails.send({
      from: 'Washio <noreply@washio.gr>',
      to: recipient,
      subject,
      html,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Email error:', error)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}