// Καιρός στο date picker: εικονίδιο ανά μέρα + «Ιδανική μέρα» για πλύσιμο.
export type WxDay = { date: string; kind: 'sun' | 'cloud' | 'rain' | 'storm'; prob: number; mm: number }

// «Βρεγμένη» μέρα = πραγματική βροχή (≥1mm με πιθανότητα ≥50%) ή καταιγίδα. Ψιχάλα / 23% / 0.4mm ΔΕΝ μετράει.
export const isWet = (d?: WxDay) => !!d && (d.kind === 'storm' || (d.mm >= 1 && d.prob >= 50) || d.mm >= 3)

// Η πρόγνωση βροχής είναι αξιόπιστη ~3 μέρες, καλή έως 5. Πιο πέρα δεν προτείνουμε.
const SUGGEST_HORIZON = 5

/**
 * Ιδανική μέρα: η πρώτη στεγνή μέρα (μέσα σε 5 μέρες) που ΚΑΙ η επόμενη είναι στεγνή
 * — το πλύσιμο «κρατάει». Πάντα προτείνει (αν υπάρχει στεγνή μέρα με ώρες).
 * skip(date) → true για μέρες που το πλυντήριο είναι κλειστό / χωρίς ώρες.
 */
export function bestWashDay(days: WxDay[], skip: (ymd: string) => boolean = () => false): string | null {
  // Προτείνουμε ΠΑΝΤΑ (και χωρίς βροχή στον ορίζοντα) — λειτουργεί και ως ώθηση «κλείσε τώρα».
  const win = days.slice(0, SUGGEST_HORIZON + 1)
  for (let i = 0; i < Math.min(win.length, SUGGEST_HORIZON); i++) {
    const d = win[i]
    if (skip(d.date) || isWet(d)) continue
    // Σήμερα: αυστηρότερα (η πρόγνωση της μέρας συχνά υποεκτιμά) — καμία ένδειξη βροχής.
    if (i === 0 && (d.mm > 0 || d.prob >= 20)) continue
    const next = days[i + 1]
    if (next && isWet(next)) continue
    return d.date
  }
  return null
}

export function wxEmoji(k: WxDay['kind']): string {
  return k === 'sun' ? '☀️' : k === 'cloud' ? '⛅' : k === 'storm' ? '⛈️' : '🌧️'
}

/** Για analytics (funnel): ήταν η ιδανική μέρα; βρεγμένη; πόσες μέρες μπροστά; */
export function dayMeta(ymd: string, today: string, bestYmd: string | null, w?: WxDay) {
  const lead = Math.round((Date.parse(ymd + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 864e5)
  return { day_best: !!bestYmd && ymd === bestYmd, has_best: !!bestYmd, day_wet: isWet(w), lead }
}
