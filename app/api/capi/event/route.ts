import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { sendCapiEvent } from '@/lib/meta-capi'
import { ipFrom, isThrottled } from '@/lib/throttle'

// Server-side mirror (Meta CAPI) των funnel events του browser Pixel:
// ViewContent → AddToCart → InitiateCheckout. Ίδιο event_id με το Pixel → dedup.
// Χωρίς αυτό, iOS / Instagram in-app browser / ad-blockers χάνουν τα events και
// το Meta δεν μπορεί να βελτιστοποιήσει για InitiateCheckout.
// (Purchase & CompleteRegistration στέλνονται ήδη server-side από αλλού.)

const ALLOWED = new Set(['ViewContent', 'AddToCart', 'InitiateCheckout', 'Search'])

function cleanCustomData(c: unknown): Record<string, unknown> | undefined {
  if (!c || typeof c !== 'object') return undefined
  const src = c as Record<string, unknown>
  const out: Record<string, unknown> = {}
  const v = Number(src.value)
  if (Number.isFinite(v) && v >= 0 && v < 1000) { out.value = Math.round(v * 100) / 100; out.currency = 'EUR' }
  if (typeof src.content_type === 'string') out.content_type = src.content_type.slice(0, 40)
  if (Array.isArray(src.content_ids)) out.content_ids = src.content_ids.filter(x => typeof x === 'string').slice(0, 5).map(x => String(x).slice(0, 64))
  return Object.keys(out).length ? out : undefined
}

export async function POST(req: NextRequest) {
  try {
    const ip = ipFrom(req) || 'unknown'
    if (await isThrottled(`capi:${ip}`, 60, 60_000)) return NextResponse.json({ ok: false }, { status: 200 })

    const b = await req.json().catch(() => null) as { event?: string; eventId?: string; customData?: unknown; url?: string } | null
    if (!b || typeof b.event !== 'string' || !ALLOWED.has(b.event)) return NextResponse.json({ ok: false }, { status: 400 })
    const eventId = typeof b.eventId === 'string' ? b.eventId.slice(0, 100) : ''
    if (!eventId) return NextResponse.json({ ok: false }, { status: 400 })

    // Ο χρήστης (αν είναι συνδεδεμένος) από το session — ΠΟΤΕ από τον client.
    let user: { id: string; email?: string | null; phone?: string | null } | null = null
    try {
      const supabase = await createServerClient()
      const { data } = await supabase.auth.getUser()
      if (data.user) user = { id: data.user.id, email: data.user.email, phone: (data.user.phone as string | undefined) || null }
    } catch { /* ανώνυμος */ }

    await sendCapiEvent(b.event, {
      eventId,
      email: user?.email || null,
      externalId: user?.id || null,
      phone: user?.phone || null,
      fbp: req.cookies.get('_fbp')?.value || null,
      fbc: req.cookies.get('_fbc')?.value || null,
      clientIp: ip === 'unknown' ? null : ip,
      clientUserAgent: (req.headers.get('user-agent') || '').slice(0, 350) || null,
      eventSourceUrl: typeof b.url === 'string' ? b.url.slice(0, 500) : null,
      customData: cleanCustomData(b.customData),
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
