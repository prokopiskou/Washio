import type { NextRequest } from 'next/server'
import { CONSENT_COOKIE, NATIVE_COOKIE, parseConsent } from '@/lib/consent'

/** Server: επιτρέπεται Meta CAPI για αυτόν τον χρήστη;
 *  Συγκατάθεση διαφήμισης + (web · Android · iPhone με «Ναι» στο ATT). */
export function adConsentFrom(req: NextRequest): boolean {
  const nat = req.cookies.get(NATIVE_COOKIE)?.value
  // 'android' · 'ios_att' (iPhone με «Ναι» στο ATT της Apple) → επιτρέπεται με συγκατάθεση. '1' (iPhone χωρίς ATT) → ποτέ.
  if (nat && nat !== 'android' && nat !== 'ios_att') return false
  return !!parseConsent(req.cookies.get(CONSENT_COOKIE)?.value)?.marketing
}
