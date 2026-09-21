// ============================================================
// Rate limiting.
//
// Με UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN στο env → κατανεμημένο
// sliding-window (ισχύει σε ΟΛΕΣ τις serverless instances). Χωρίς αυτά →
// fallback στη μνήμη της instance (κόβει απλά scripts, όχι κατανεμημένη επίθεση).
// ============================================================

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

export function ipFrom(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

const hasUpstash = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
const redis = hasUpstash ? Redis.fromEnv() : null
const limiters = new Map<string, Ratelimit>()

function limiterFor(max: number, windowMs: number): Ratelimit {
  const key = `${max}:${windowMs}`
  let l = limiters.get(key)
  if (!l) {
    l = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(max, `${Math.max(1, Math.round(windowMs / 1000))} s`),
      prefix: 'washio:rl',
    })
    limiters.set(key, l)
  }
  return l
}

// Fallback στη μνήμη (per instance).
const buckets = new Map<string, { n: number; resetAt: number }>()
function memoryThrottled(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.resetAt < now) { buckets.set(key, { n: 1, resetAt: now + windowMs }); return false }
  b.n += 1
  if (buckets.size > 5000) { for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k) }
  return b.n > max
}

/** true = ΠΑΝΩ από το όριο (μπλόκαρε). Ποτέ δεν ρίχνει — σε σφάλμα Redis, αφήνει να περάσει. */
export async function isThrottled(key: string, max: number, windowMs: number): Promise<boolean> {
  if (!redis) return memoryThrottled(key, max, windowMs)
  try {
    const { success } = await limiterFor(max, windowMs).limit(key)
    return !success
  } catch (e) {
    console.error('ratelimit error (fail-open):', e instanceof Error ? e.message : e)
    return memoryThrottled(key, max, windowMs)
  }
}
