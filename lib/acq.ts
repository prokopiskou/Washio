// Απόδοση εγγραφής (A/B τεστ landing): ποια παραλλαγή (lp) και ποιος κωδικός (ref)
// έφερε τον χρήστη. Πηγές, με σειρά: URL (?lp= / ?acq_lp=) → cookies ws_lp / ws_ref.
// Χρησιμοποιείται για να «ταξιδέψει» η παραλλαγή ΜΕΣΑ στην ίδια την εγγραφή
// (OTP user_metadata, OAuth redirect URL), ώστε να μη χάνεται αν ο χρήστης
// ολοκληρώσει σε άλλο browser (π.χ. Instagram in-app → Safari).

export type Acq = { acq_lp: 'map' | 'login'; acq_ref: string | null }

function cookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const c = document.cookie.split('; ').find(x => x.startsWith(name + '='))
  return c ? decodeURIComponent(c.slice(name.length + 1)) : null
}

export function readAcq(): Acq | null {
  if (typeof window === 'undefined') return null
  let lp: string | null = null
  let ref: string | null = null
  try {
    const sp = new URLSearchParams(window.location.search)
    lp = sp.get('acq_lp') || sp.get('lp')
    ref = sp.get('acq_ref') || sp.get('ref')
  } catch { /* ignore */ }
  if (lp !== 'map' && lp !== 'login') lp = cookie('ws_lp')
  if (!ref) ref = cookie('ws_ref')
  if (lp !== 'map' && lp !== 'login') return null
  return { acq_lp: lp, acq_ref: ref ? ref.trim().slice(0, 40) : null }
}

/** Προσθέτει acq_lp/acq_ref σε ένα εσωτερικό path (για OAuth redirect). */
export function withAcq(path: string): string {
  const a = readAcq()
  if (!a) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}acq_lp=${a.acq_lp}${a.acq_ref ? `&acq_ref=${encodeURIComponent(a.acq_ref)}` : ''}`
}
