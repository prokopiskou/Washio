import { Resend } from 'resend'

// Ειδοποίηση ADMIN για ΚΑΘΕ νέα κράτηση πλατφόρμας (κάρτα ή «πλήρωσε εκεί»):
// email στο withinsuccess@gmail.com + μήνυμα Telegram (ίδιο bot με τα alerts).
// Best-effort — ΠΟΤΕ δεν μπλοκάρει την κράτηση.
const resend = new Resend(process.env.RESEND_API_KEY)
const ADMIN_NOTIFY_EMAIL = 'withinsuccess@gmail.com'

export async function notifyAdminNewBooking(b: {
  bookingRef: string
  locationName: string
  serviceName: string
  slotDate: string      // YYYY-MM-DD
  slotTime: string      // HH:MM
  total: number         // τιμή υπηρεσίας
  coupon?: number
  method: 'card' | 'venue'
  customerEmail?: string | null
  customerPhone?: string | null
}): Promise<void> {
  const pay = b.method === 'card' ? '💳 Κάρτα (πληρωμένη)' : '💵 Στο πλυντήριο'
  const net = Math.max(0, b.total - (b.coupon || 0))
  const [y, m, d] = b.slotDate.split('-')
  const when = `${d}/${m} ${b.slotTime.slice(0, 5)}`
  const coupon = b.coupon ? ` (−€${b.coupon.toFixed(0)} κουπόνι, τιμή €${b.total.toFixed(2)})` : ''
  const lines = [
    `📅 ${when} · ${b.locationName}`,
    `${b.serviceName} · €${net.toFixed(2)}${coupon}`,
    `${pay} · ${b.bookingRef}`,
    `${b.customerEmail || '—'}${b.customerPhone ? ' · ' + b.customerPhone : ''}`,
  ]
  const tasks: Promise<unknown>[] = []
  tasks.push(resend.emails.send({
    from: 'Washio <noreply@washio.gr>',
    to: ADMIN_NOTIFY_EMAIL,
    subject: `🎉 Νέα κράτηση — ${b.locationName} · ${when}`,
    html: `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px;">
      <h2 style="margin:0 0 12px;color:#10182A;font-size:20px;">🎉 Νέα κράτηση στο Washio</h2>
      ${lines.map(l => `<p style="margin:0 0 6px;color:#374151;font-size:15px;">${l}</p>`).join('')}
      <a href="https://www.washio.gr/admin" style="display:inline-block;margin-top:14px;background:#10182A;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:600;font-size:14px;">Άνοιξε το admin →</a>
    </div>`,
  }).catch(() => null))
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (token) {
    tasks.push(fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_ALERT_CHAT_ID || '789041137', text: `🎉 Νέα κράτηση Washio\n${lines.join('\n')}` }),
    }).catch(() => null))
  }
  await Promise.all(tasks)
}
