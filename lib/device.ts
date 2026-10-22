// Σταθερό αναγνωριστικό ΣΥΣΚΕΥΗΣ (όχι χρήστη) για το «ένα −3€ ανά συσκευή».
// localStorage + cookie 1 έτους: αν σβηστεί το ένα, το ξαναγράφει το άλλο.
// Δεν περιέχει προσωπικά στοιχεία — μόνο ένα τυχαίο id.
const KEY = 'ws_dev'
const MAX_AGE = 60 * 60 * 24 * 365

function readCookie(): string | null {
  try {
    const c = document.cookie.split('; ').find(x => x.startsWith(KEY + '='))
    return c ? decodeURIComponent(c.slice(KEY.length + 1)) : null
  } catch { return null }
}

export function ensureDeviceId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    let id = localStorage.getItem(KEY) || readCookie()
    if (!id || !/^[a-z0-9-]{16,64}$/i.test(id)) {
      id = (crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`)
    }
    try { localStorage.setItem(KEY, id) } catch { /* ignore */ }
    if (readCookie() !== id) document.cookie = `${KEY}=${encodeURIComponent(id)}; path=/; max-age=${MAX_AGE}; SameSite=Lax`
    return id
  } catch { return null }
}
