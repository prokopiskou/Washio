import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ipFrom, isThrottled } from '@/lib/throttle'
import { cleanAd } from '@/lib/acq'

// ============================================================
// Απόδοση διαφήμισης ΜΕΣΑ από το store (web → App Store/Play → εφαρμογή).
// Το cookie ws_ad του browser ΔΕΝ περνάει στην εφαρμογή (άλλο «πορτοφόλι» cookies),
// οπότε χανόταν από ποια διαφήμιση ήρθε όποιος κατέβαζε την εφαρμογή.
//   mark  (web, ήρθε από διαφήμιση με ?utm_content/acq_ad) → κρατάμε IP + πλατφόρμα + διαφήμιση
//   claim (εφαρμογή, 1η εκκίνηση, χωρίς ws_ad) → ίδια IP & πλατφόρμα τις τελευταίες 48 ώρες
//         → βάζουμε τα cookies ws_ad / ws_ref / ws_lp στην εφαρμογή → η εγγραφή τα γράφει κανονικά.
// Πιθανοτική αντιστοίχιση (ίδια IP) — όχι 100%, αλλά πιάνει τη συνηθισμένη ροή «κλικ → store → άνοιγμα».
// ============================================================

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const platformOf = (ua: string) => /android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) ? 'ios' : 'other'
const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n)

export async function POST(req: NextRequest) {
  const ip = ipFrom(req)
  if (!ip || ip === 'unknown') return NextResponse.json({ ok: false })
  if (await isThrottled('attrib:' + ip, 30, 60 * 60 * 1000)) return NextResponse.json({ ok: false })
  const b = await req.json().catch(() => ({})) as { action?: string; ad?: string; ref?: string; lp?: string; platform?: string }
  const ua = req.headers.get('user-agent') || ''

  if (b.action === 'mark') {
    const ad = cleanAd(b.ad)
    const ref = clip(b.ref, 40) || null
    if (!ad && !ref) return NextResponse.json({ ok: false })
    await db.from('attrib_clicks').insert({ ip, platform: platformOf(ua), ad, ref, lp: clip(b.lp, 10) || null })
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'claim') {
    const platform = b.platform === 'ios' || b.platform === 'android' ? b.platform : platformOf(ua)
    const { data } = await db.from('attrib_clicks').select('id, ad, ref, lp')
      .eq('ip', ip).in('platform', [platform, 'other']).is('claimed_at', null)
      .gte('created_at', new Date(Date.now() - 48 * 3600e3).toISOString())
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (!data) return NextResponse.json({ ok: true, matched: false })
    await db.from('attrib_clicks').update({ claimed_at: new Date().toISOString() }).eq('id', data.id)
    const res = NextResponse.json({ ok: true, matched: true, ad: data.ad, ref: data.ref })
    const opts = { path: '/', maxAge: 60 * 60 * 24 * 30, sameSite: 'lax' as const }
    if (data.ad) res.cookies.set('ws_ad', encodeURIComponent(data.ad), opts)
    if (data.ref) res.cookies.set('ws_ref', encodeURIComponent(data.ref), opts)
    res.cookies.set('ws_lp', data.lp === 'login' ? 'login' : 'map', opts)
    return res
  }
  return NextResponse.json({ ok: false }, { status: 400 })
}
