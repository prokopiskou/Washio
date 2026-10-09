// Απόδοση εγγραφής (A/B τεστ landing): ποια παραλλαγή (lp) και ποιος κωδικός (ref)
// έφερε τον χρήστη. Πηγές, με σειρά: URL (?lp= / ?acq_lp=) → cookies ws_lp / ws_ref.
// Χρησιμοποιείται για να «ταξιδέψει» η παραλλαγή ΜΕΣΑ στην ίδια την εγγραφή
// (OTP user_metadata, OAuth redirect URL), ώστε να μη χάνεται αν ο χρήστης
// ολοκληρώσει σε άλλο browser (π.χ. Instagram in-app → Safari).

export type Acq = { acq_lp: 'map' | 'login'; acq_ref: string | null; acq_ad?: string }

/** Όνομα διαφήμισης από utm_content={{ad.name}} (Meta) — καθαρό, έως 60 χαρ. */
export function cleanAd(v: string | null | undefined): string | null {
  const s = String(v || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').trim().slice(0, 60)
  return s || null
}

function cookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const c = document.cookie.split('; ').find(x => x.startsWith(name + '='))
  return c ? decodeURIComponent(c.slice(name.length + 1)) : null
}

export function readAcq(): Acq | null {
  if (typeof window === 'undefined') return null
  let lp: string | null = null
  let ref: string | null = null
  let ad: string | null = null
  try {
    const sp = new URLSearchParams(window.location.search)
    lp = sp.get('acq_lp') || sp.get('lp')
    ref = sp.get('acq_ref') || sp.get('ref')
    ad = cleanAd(sp.get('acq_ad') || sp.get('utm_content'))
  } catch { /* ignore */ }
  if (lp !== 'map' && lp !== 'login') lp = cookie('ws_lp')
  if (!ref) ref = cookie('ws_ref')
  if (!ad) ad = cleanAd(cookie('ws_ad'))
  if (lp !== 'map' && lp !== 'login') return null
  return { acq_lp: lp, acq_ref: ref ? ref.trim().slice(0, 40) : null, ...(ad ? { acq_ad: ad } : {}) }
}

/** Προσθέτει acq_lp/acq_ref σε ένα εσωτερικό path (για OAuth redirect). */
export function withAcq(path: string): string {
  const a = readAcq()
  if (!a) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}acq_lp=${a.acq_lp}${a.acq_ref ? `&acq_ref=${encodeURIComponent(a.acq_ref)}` : ''}${a.acq_ad ? `&acq_ad=${encodeURIComponent(a.acq_ad)}` : ''}`
}

/**
 * Κωδικός για flyers: «FLYER» για τα τυπωμένα (QR ?ref=WASHIO&utm_source=flyer ή /f),
 * «FLYER_<ΚΑΝΑΛΙ>» για ξεχωριστά QR/αυτοκόλλητα (/f/fanari → FLYER_FANARI), ώστε να
 * μετράμε χωριστά φανάρια / παρμπρίζ / περιοχές. Όλα παίρνουν το ίδιο −3€.
 * null αν το link δεν είναι flyer.
 */
export function flyerRef(sp: URLSearchParams): string | null {
  if (sp.get('utm_source') !== 'flyer') return null
  const c = (sp.get('utm_campaign') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20)
  return c && c !== 'FLYER1' ? `FLYER_${c}` : 'FLYER'
}
