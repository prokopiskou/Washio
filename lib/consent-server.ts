import type { NextRequest } from 'next/server'
import { CONSENT_COOKIE, NATIVE_COOKIE, parseConsent } from '@/lib/consent'

/** Server: επιτρέπεται Meta CAPI για αυτόν τον χρήστη; (συγκατάθεση διαφήμισης + όχι native app) */
export function adConsentFrom(req: NextRequest): boolean {
  if (req.cookies.get(NATIVE_COOKIE)?.value === '1') return false
  return !!parseConsent(req.cookies.get(CONSENT_COOKIE)?.value)?.marketing
}
