import { NextResponse } from 'next/server'

// Health check για εξωτερικό monitor (UptimeRobot κ.λπ.).
// Ελέγχει ΠΡΑΓΜΑΤΙΚΑ ό,τι χρειάζεται η εφαρμογή για να ανοίξει:
//  - Supabase Auth (σύνδεση χρηστών)
//  - Supabase Database (ανάγνωση πλυντηρίων)
// 200 + "WASHIO_OK" = όλα καλά · 503 = κάτι είναι κάτω → ο monitor στέλνει ειδοποίηση.
export const dynamic = 'force-dynamic'
export const revalidate = 0

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const TIMEOUT_MS = 8000

async function probe(path: string): Promise<{ ok: boolean; ms: number; status?: number; error?: string }> {
  const t0 = Date.now()
  try {
    const r = await fetch(`${URL_}${path}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    return { ok: r.ok, ms: Date.now() - t0, status: r.status }
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.name : 'error' }
  }
}

export async function GET() {
  const [auth, db] = await Promise.all([
    probe('/auth/v1/health'),
    probe('/rest/v1/locations?select=id&limit=1'),
  ])
  const ok = auth.ok && db.ok
  return NextResponse.json(
    { status: ok ? 'WASHIO_OK' : 'WASHIO_DOWN', auth, db, at: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  )
}
