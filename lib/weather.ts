// Καιρός στο date picker: εικονίδιο ανά μέρα + «Ιδανική μέρα» για πλύσιμο.
export type WxDay = { date: string; kind: 'sun' | 'cloud' | 'rain' | 'storm'; prob: number; mm: number }

export const isWet = (d?: WxDay) => !!d && (d.kind === 'rain' || d.kind === 'storm' || d.prob >= 50)

// Η πρόγνωση βροχής είναι αξιόπιστη ~3 μέρες, καλή έως 5. Πιο πέρα δεν προτείνουμε.
const SUGGEST_HORIZON = 5

/**
 * Ιδανική μέρα: η πρώτη στεγνή μέρα (μέσα σε 5 μέρες) που ΚΑΙ η επόμενη είναι στεγνή
 * — το πλύσιμο «κρατάει». Μόνο αν υπάρχει βροχή κάπου στο διάστημα (αλλιώς όλες είναι καλές).
 * skip(date) → true για μέρες που το πλυντήριο είναι κλειστό / χωρίς ώρες.
 */
export function bestWashDay(days: WxDay[], skip: (ymd: string) => boolean = () => false): string | null {
  const win = days.slice(0, SUGGEST_HORIZON + 1)
  if (!win.some(isWet)) return null
  for (let i = 0; i < Math.min(win.length, SUGGEST_HORIZON); i++) {
    const d = win[i]
    if (skip(d.date) || isWet(d)) continue
    const next = days[i + 1]
    if (next && isWet(next)) continue
    return d.date
  }
  return null
}

export function wxEmoji(k: WxDay['kind']): string {
  return k === 'sun' ? '☀️' : k === 'cloud' ? '⛅' : k === 'storm' ? '⛈️' : '🌧️'
}
