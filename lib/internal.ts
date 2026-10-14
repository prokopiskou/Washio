// Εσωτερικοί λογαριασμοί (ομάδα Washio / δοκιμές). Εξαιρούνται από:
//  • Meta Pixel / GA4 / CAPI — να μη «μαθαίνει» το Meta από τις δοκιμές μας
//  • αναφορές / μετρήσεις (map_opens κ.λπ.)
// Πηγές: η λίστα εδώ + app_metadata.internal = true (μπαίνει με SQL) + email με «+test».

export const INTERNAL_EMAILS = new Set<string>([
  'withinsuccess@gmail.com',
  'prokopis71@gmail.com',
  'giwrgos2070@gmail.com',
  'alexandr.sph@gmail.com',              // Σοφία
  'sk5vhy6dhz@privaterelay.appleid.com', // Προκόπης (Apple)
  'g7cbwtydrr@privaterelay.appleid.com', // Dimitris Stamatis (Apple)
])

export function isInternalEmail(email?: string | null): boolean {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return false
  return INTERNAL_EMAILS.has(e) || e.includes('+test')
}

export function isInternalUser(u?: { email?: string | null; app_metadata?: Record<string, unknown> | null } | null): boolean {
  if (!u) return false
  if ((u.app_metadata as { internal?: unknown } | null | undefined)?.internal === true) return true
  return isInternalEmail(u.email)
}

/** Client: η συσκευή έχει σημειωθεί εσωτερική (μένει και μετά το logout). */
export function isInternalDevice(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return (window as unknown as { __wsInternal?: number }).__wsInternal === 1 || localStorage.getItem('ws_internal') === '1'
  } catch { return false }
}

export function markInternalDevice(): void {
  if (typeof window === 'undefined') return
  ;(window as unknown as { __wsInternal?: number }).__wsInternal = 1
  try { localStorage.setItem('ws_internal', '1') } catch { /* ignore */ }
  // Σταμάτα το Pixel από εδώ και πέρα σε αυτή τη σελίδα.
  try {
    const fbq = (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq
    if (fbq) fbq('consent', 'revoke')
  } catch { /* ignore */ }
}
