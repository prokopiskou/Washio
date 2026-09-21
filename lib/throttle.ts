// Ελαφρύ rate limit ανά IP, στη μνήμη της serverless instance.
// ΔΕΝ είναι μοιρασμένο μεταξύ instances (για αυτό θέλει Upstash/Redis) —
// αλλά κόβει τα απλά scripts/σπαμ που χτυπάνε τον ίδιο warm server.
const buckets = new Map<string, { n: number; resetAt: number }>()

export function ipFrom(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
}

/** true = ΠΑΝΩ από το όριο (μπλόκαρε). */
export function isThrottled(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.resetAt < now) { buckets.set(key, { n: 1, resetAt: now + windowMs }); return false }
  b.n += 1
  if (buckets.size > 5000) { for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k) }
  return b.n > max
}
