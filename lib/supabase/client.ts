import { createBrowserClient, parseCookieHeader, serializeCookieHeader, DEFAULT_COOKIE_OPTIONS } from '@supabase/ssr'

// Η σύνδεση κρατιέται σε cookies που γράφει η JavaScript (document.cookie).
// Στο iPhone (Safari ΚΑΙ η εφαρμογή — WKWebView) το ITP κόβει τέτοια cookies στις 7 μέρες:
// όποιος δεν άνοιξε την εφαρμογή για μια εβδομάδα βρισκόταν αποσυνδεδεμένος.
// Λύση: αντίγραφο των cookies σύνδεσης στο localStorage (μένει όσο χρησιμοποιείται η εφαρμογή).
// Αν τα cookies χαθούν, ξαναγράφονται από το αντίγραφο ΠΡΙΝ τα διαβάσει το Supabase.
// Το αντίγραφο ακολουθεί ΠΑΝΤΑ τα τρέχοντα cookies (ανανέωση token, αποσύνδεση → σβήνει).
const BAK = 'ws_auth_bak'
const isAuthCookie = (n: string) => n.startsWith('sb-') && n.includes('-auth-token') && !n.includes('code-verifier')

type Jar = { name: string; value: string }[]

function readJar(): Jar {
  return parseCookieHeader(document.cookie).map(c => ({ name: c.name, value: c.value ?? '' }))
}

function syncBackup(jar: Jar) {
  try {
    const auth = jar.filter(c => isAuthCookie(c.name) && c.value)
    const next = auth.length ? JSON.stringify(Object.fromEntries(auth.map(c => [c.name, c.value]))) : null
    const cur = localStorage.getItem(BAK)
    if (next === cur) return
    if (next) localStorage.setItem(BAK, next)
    else localStorage.removeItem(BAK)
  } catch { /* localStorage μη διαθέσιμο */ }
}

function restoreIfMissing(jar: Jar): Jar {
  if (jar.some(c => isAuthCookie(c.name) && c.value)) { syncBackup(jar); return jar }
  try {
    const raw = localStorage.getItem(BAK)
    if (!raw) return jar
    const saved = JSON.parse(raw) as Record<string, string>
    for (const [name, value] of Object.entries(saved)) {
      if (!isAuthCookie(name) || !value) continue
      document.cookie = serializeCookieHeader(name, value, DEFAULT_COOKIE_OPTIONS)
    }
    return readJar()
  } catch { return jar }
}

// getAll/setAll ίδια με τα default του @supabase/ssr (document.cookie) + αντίγραφο στο localStorage.
export const authCookieStore = {
  getAll() {
    return restoreIfMissing(readJar())
  },
  setAll(list: { name: string; value: string; options: Parameters<typeof serializeCookieHeader>[2] }[]) {
    list.forEach(({ name, value, options }) => {
      document.cookie = serializeCookieHeader(name, value, options)
    })
    syncBackup(readJar())
  },
}

// Το createBrowserClient κρατάει ήδη ΕΝΑ client στον browser (singleton) — ίδιο με πριν.
export function createClient() {
  if (typeof document === 'undefined') {
    return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: authCookieStore,
    },
  )
}
