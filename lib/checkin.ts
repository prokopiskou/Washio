import { createHmac, timingSafeEqual } from 'crypto'

// Check-in με QR: κάθε κράτηση έχει προσωπικό, υπογεγραμμένο κωδικό.
//   κωδικός = <REF χωρίς WS->.<υπογραφή 10 χαρ.>   π.χ. 2C9AC085.k3J9xQ2aLm
//   QR      = https://www.washio.gr/c/<κωδικός>
// Η υπογραφή (HMAC) δεν αφήνει κανέναν να φτιάξει QR για ξένη κράτηση.
// Το URL σημαίνει ότι δουλεύει ΚΑΙ με την κάμερα του κινητού (ανοίγει τη σελίδα /c/).
// Server-only (crypto).

export const CHECKIN_BASE = 'https://www.washio.gr'

function secret(): string {
  return process.env.CHECKIN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'washio-checkin'
}

function normRef(ref: string): string {
  const r = String(ref || '').trim().toUpperCase().replace(/^WS-?/, '')
  return /^[A-Z0-9]{4,16}$/.test(r) ? r : ''
}

function sign(core: string): string {
  return createHmac('sha256', secret()).update('checkin:' + core).digest('base64url').slice(0, 10)
}

/** Κωδικός check-in για μια κράτηση (WS-XXXX). */
export function checkinCode(bookingRef: string): string {
  const core = normRef(bookingRef)
  return core ? `${core}.${sign(core)}` : ''
}

export function checkinUrl(bookingRef: string): string {
  const c = checkinCode(bookingRef)
  return c ? `${CHECKIN_BASE}/c/${c}` : ''
}

/** Εικόνα QR (PNG) για email — φιλοξενείται από εμάς (το Gmail μπλοκάρει data: εικόνες). */
export function checkinQrImageUrl(bookingRef: string): string {
  const c = checkinCode(bookingRef)
  return c ? `${CHECKIN_BASE}/api/qr/${c}` : ''
}

/** Από ό,τι σκανάρει/γράφει το πλυντήριο → booking_ref.
 *  Δέχεται: πλήρες URL, «XXXX.sig», ή σκέτο «WS-XXXX» (πληκτρολόγηση — ο έλεγχος ιδιοκτησίας
 *  γίνεται έτσι κι αλλιώς στον server, άρα ένα πλυντήριο βλέπει μόνο τις δικές του κρατήσεις). */
export function parseCheckin(input: string): { ref: string; signed: boolean } | null {
  let s = String(input || '').trim()
  const m = s.match(/\/c\/([A-Za-z0-9._-]+)/)
  if (m) s = m[1]
  s = s.replace(/[?#].*$/, '')
  const [rawCore, sig] = s.split('.')
  const core = normRef(rawCore || '')
  if (!core) return null
  if (sig) {
    const exp = sign(core)
    const a = Buffer.from(sig), b = Buffer.from(exp)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    return { ref: 'WS-' + core, signed: true }
  }
  return { ref: 'WS-' + core, signed: false }
}

/** Μπλοκ HTML για το email επιβεβαίωσης. */
export function checkinEmailBlock(bookingRef: string): string {
  const img = checkinQrImageUrl(bookingRef)
  if (!img) return ''
  return `
        <div style="text-align: center; border: 1px solid #EFEFEF; border-radius: 12px; padding: 20px 16px; margin-bottom: 24px;">
          <p style="color: #10182A; font-size: 14px; font-weight: 600; margin: 0 0 4px;">Ο κωδικός σου για το πλυντήριο</p>
          <p style="color: #999; font-size: 12px; margin: 0 0 14px;">Δείξ' τον όταν φτάσεις — σκανάρεται και είσαι έτοιμος.</p>
          <img src="${img}" width="180" height="180" alt="QR ${bookingRef}" style="display: block; margin: 0 auto; width: 180px; height: 180px;" />
          <p style="color: #10182A; font-size: 13px; font-weight: 600; font-family: monospace; margin: 10px 0 0;">${bookingRef}</p>
        </div>`
}
