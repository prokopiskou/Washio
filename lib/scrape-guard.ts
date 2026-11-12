// Προστασία από αντιγραφή δεδομένων (scraping) στα δημόσια API.
// 1) Scripts/headless browsers (curl, python, puppeteer…) → 403 αμέσως.
// 2) Αιτήματα από ξένο site (Origin/Referer όχι washio.gr / app) → 403.
// 3) Πάνω από το αυστηρό όριο → μπλοκ IP για 1 ώρα.
// Κάθε μπλοκ γράφεται στο security_events (supabase/lockdown_public.sql) και στέλνει email
// στον admin (μία φορά ανά IP ανά μέρα). Best-effort: αν λείπει ο πίνακας, απλώς μπλοκάρει.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { ipFrom, isThrottled } from '@/lib/throttle'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const ALERT_TO = 'withinsuccess@gmail.com'

const BOT_UA = /curl|wget|python|httpie|httpclient|okhttp|go-http|java\/|libwww|node-fetch|axios|undici|got\b|scrapy|aiohttp|headless|phantom|selenium|puppeteer|playwright|crawler|spider|scraper/i
const ALLOWED_ORIGIN = /^(https?:\/\/([a-z0-9-]+\.)*washio\.gr|https:\/\/[a-z0-9-]+\.vercel\.app|capacitor:\/\/localhost|https?:\/\/localhost(:\d+)?|ionic:\/\/localhost)/i

// Μπλοκαρισμένες IP (cache ανά instance + DB για να ισχύει παντού).
const blockedCache = new Map<string, number>()

async function isBlocked(ip: string): Promise<boolean> {
  const until = blockedCache.get(ip)
  if (until && until > Date.now()) return true
  try {
    const { data } = await db.from('security_events').select('blocked_until').eq('ip', ip)
      .gt('blocked_until', new Date().toISOString()).limit(1).maybeSingle()
    if (data?.blocked_until) { blockedCache.set(ip, new Date(data.blocked_until).getTime()); return true }
  } catch { /* χωρίς πίνακα */ }
  return false
}

export async function record(ip: string, path: string, reason: string, ua: string, blockMs: number) {
  const until = new Date(Date.now() + blockMs)
  blockedCache.set(ip, until.getTime())
  try {
    // Ειδοποίηση μία φορά / IP / 24ώρο
    const { data: prev } = await db.from('security_events').select('id').eq('ip', ip)
      .gte('created_at', new Date(Date.now() - 864e5).toISOString()).limit(1)
    await db.from('security_events').insert({ ip, path, reason, user_agent: ua.slice(0, 300), blocked_until: until.toISOString() })
    if (!prev?.length && process.env.RESEND_API_KEY) {
      await new Resend(process.env.RESEND_API_KEY).emails.send({
        from: 'Washio <noreply@washio.gr>', to: ALERT_TO,
        subject: `🛡️ Washio: μπλοκαρίστηκε πιθανό scraping (${reason})`,
        html: `<div style="font-family:-apple-system,Arial,sans-serif;font-size:14px;color:#10182A">
          <p><b>Αιτία:</b> ${reason}<br><b>IP:</b> ${ip}<br><b>Σελίδα/API:</b> ${path}<br><b>User-Agent:</b> ${ua.replace(/</g, '&lt;').slice(0, 200) || '—'}</p>
          <p>Μπλοκαρισμένη μέχρι ${until.toLocaleString('el-GR', { timeZone: 'Europe/Athens' })}. Ιστορικό: πίνακας security_events.</p></div>`,
      })
    }
  } catch { /* best-effort */ }
}

/**
 * Κλήση στην αρχή κάθε δημόσιου API. Επιστρέφει Response (403/429) αν πρέπει να κοπεί, αλλιώς null.
 * max/windowMs = αυστηρό όριο ανά IP για ΑΥΤΟ το endpoint (πέρα από αυτό → μπλοκ 1 ώρας).
 */
export async function guardPublic(req: Request, name: string, max: number, windowMs: number): Promise<Response | null> {
  const ip = ipFrom(req)
  const ua = req.headers.get('user-agent') || ''
  const origin = req.headers.get('origin') || req.headers.get('referer') || ''
  if (await isBlocked(ip)) return NextResponse.json({ error: 'Blocked' }, { status: 403 })

  if (!ua || BOT_UA.test(ua)) {
    await record(ip, name, !ua ? 'χωρίς user-agent' : 'script/bot user-agent', ua, 3600_000)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (origin && !ALLOWED_ORIGIN.test(origin)) {
    await record(ip, name, `ξένο site: ${origin.slice(0, 80)}`, ua, 3600_000)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (await isThrottled(`guard:${name}:${ip}`, max, windowMs)) {
    await record(ip, name, `πάνω από ${max} αιτήματα / ${Math.round(windowMs / 60000)}'`, ua, 3600_000)
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  return null
}
