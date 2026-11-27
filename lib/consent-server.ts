import type { NextRequest } from 'next/server'
import { CONSENT_COOKIE, NATIVE_COOKIE, parseConsent } from '@/lib/consent'

/** Server: επιτρέπεται Meta CAPI για αυτόν τον χρήστη;
 *  Συγκατάθεση διαφήμισης + (web ή εφαρμογή Android). iPhone εφαρμογή ('1'): ποτέ (Apple ATT). */
export function adConsentFrom(req: NextRequest): boolean {
  const nat = req.cookies.get(NATIVE_COOKIE)?.value
  if (nat && nat !== 'android') return false
  return !!parseConsent(req.cookies.get(CONSENT_COOKIE)?.value)?.marketing
}
