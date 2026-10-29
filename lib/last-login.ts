// «Τελευταία φορά συνδέθηκες με …» στη σελίδα σύνδεσης.
// Αποθηκεύεται τοπικά (localStorage) σε κάθε σύνδεση — όχι στον server.
export type LoginMethod = 'google' | 'apple' | 'facebook' | 'email'
const KEY = 'ws_last_login'

type Identity = { provider?: string; last_sign_in_at?: string | null }
type U = { email?: string | null; identities?: Identity[] | null; app_metadata?: { provider?: string } | null }

/** Με ποιον τρόπο έγινε η πιο πρόσφατη σύνδεση (identity με το νεότερο last_sign_in_at). */
export function methodOf(user: U | null | undefined): LoginMethod | null {
  if (!user) return null
  const ids = (user.identities || []).slice().sort((a, b) => String(b.last_sign_in_at || '').localeCompare(String(a.last_sign_in_at || '')))
  const p = String(ids[0]?.provider || user.app_metadata?.provider || '')
  return p === 'google' || p === 'apple' || p === 'facebook' || p === 'email' ? p : null
}

export function saveLastLogin(user: U | null | undefined) {
  const m = methodOf(user)
  if (!m) return
  try { localStorage.setItem(KEY, JSON.stringify({ m, e: m === 'email' ? (user?.email || '') : '' })) } catch { /* ignore */ }
}

export function readLastLogin(): { m: LoginMethod; e: string } | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null')
    return v && typeof v.m === 'string' ? { m: v.m as LoginMethod, e: String(v.e || '') } : null
  } catch { return null }
}
