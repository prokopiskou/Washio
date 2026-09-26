// Stale-while-revalidate για τις οθόνες της εφαρμογής.
// Δείχνουμε ΑΜΕΣΑ τα τελευταία δεδομένα (από localStorage, ανά χρήστη) και
// ανανεώνουμε στο παρασκήνιο. Έτσι Αρχική/Προφίλ ανοίγουν χωρίς loader.
// Μόνο μη-ευαίσθητα δεδομένα οθόνης. Καθαρίζει στο logout (clearPageCache).

const PREFIX = 'wcache:'
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7 // 7 μέρες — μετά αγνοείται

export function readPageCache<T>(key: string, userId: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key + ':' + userId)
    if (!raw) return null
    const { t, v } = JSON.parse(raw) as { t: number; v: T }
    if (Date.now() - t > MAX_AGE_MS) return null
    return v
  } catch {
    return null
  }
}

export function writePageCache<T>(key: string, userId: string, value: T) {
  try {
    localStorage.setItem(PREFIX + key + ':' + userId, JSON.stringify({ t: Date.now(), v: value }))
  } catch { /* quota / private mode — αγνόησε */ }
}

export function clearPageCache() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIX)) localStorage.removeItem(k)
    }
  } catch { /* ignore */ }
}
