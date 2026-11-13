// Κατηγορίες πλυντηρίων + κατανομή διαφημιστικού budget («κάθε ευρώ αποδοτικό»).
//
//  🏆 winner     ≥6 κρατήσεις / 14 μέρες (≈3 την εβδομάδα) · κρατάει τον τίτλο μέχρι να πέσει κάτω από 4
//  📈 candidate  δείχνει ζήτηση (≥2 / 30 μέρες ή ≥1 / 14 μέρες) αλλά όχι ακόμα winner
//  🌱 new        «ευκαιρία»: πρώτες 21 μέρες στην πλατφόρμα — σταθερό budget εκκίνησης
//  💤 dead       πέρασε τις 21 μέρες χωρίς ζήτηση (≤1 / 30 μέρες και 0 / 14 μέρες) → 0€
//  ⚠️ review     πρόβλημα ποιότητας (μέσο ≤3,5★ με ≥2 κριτικές ή ≥2 ακυρώσεις ΑΠΟ ΤΟ ΠΛΥΝΤΗΡΙΟ = ≥30%) → 0€ μέχρι τηλέφωνο
//
// Κατανομή ημερήσιου budget B:
//  • νέα: 1,5€/μέρα το καθένα, το πολύ 20% του B. Αν δεν φτάνει για όλα → προτεραιότητα σε όσα έχουν ήδη
//    κρατήσεις και στην 1η τους εβδομάδα (εγγυημένη ευκαιρία). Τα υπόλοιπα περιμένουν σειρά (push + λίστα).
//  • υποψήφιοι: 15% του B, ανάλογα με τις κρατήσεις 30 ημερών (+1 για να πάρει κάτι κι ο πιο αδύναμος)
//  • winners: ό,τι μένει (≈65%+), ανάλογα με τον ΤΖΙΡΟ 14 ημερών — εκεί που ήδη αποδίδει το ευρώ
//    όριο: κανένα πλυντήριο πάνω από 35% του B (ρίσκο εξάρτησης από ένα πλυντήριο)
//  • νεκρά / έλεγχος: 0€ — τα λεφτά τους πάνε στους winners
//  • περιοχή (ad set) με λιγότερα από 1,5€/μέρα → δεν αξίζει δικό της ad set, τα λεφτά πάνε στους winners
// Το Meta δουλεύει με ad sets ανά περιοχή → τα πλυντήρια ομαδοποιούνται σε περιοχές ~4 km (μία ακτίνα/pin η καθεμία).

import type { SupabaseClient } from '@supabase/supabase-js'
import { isInternalEmail } from '@/lib/internal'
import { CANARY_ID } from '@/lib/canary'

export type Tier = 'winner' | 'candidate' | 'new' | 'dead' | 'review'

export const TIER_META: Record<Tier, { label: string; emoji: string; action: string }> = {
  winner: { label: 'Winner', emoji: '🏆', action: 'Ads στην ακτίνα του · πρώτο στη λίστα · υπενθυμίσεις επαναληπτικής κράτησης' },
  candidate: { label: 'Υποψήφιος', emoji: '📈', action: 'Μικρό budget δοκιμής · προσφορά που την πληρώνει το ίδιο · φωτογραφίες/τιμές' },
  new: { label: 'Νέο (ευκαιρία)', emoji: '🌱', action: '21 μέρες budget εκκίνησης · push «Νέο πλυντήριο κοντά σου» · checklist προφίλ' },
  dead: { label: 'Νεκρό', emoji: '💤', action: '0€ ads · τηλέφωνο: τιμές, ωράριο, προσφορά · ξανά ευκαιρία όταν διορθώσει' },
  review: { label: 'Έλεγχος ποιότητας', emoji: '⚠️', action: '0€ ads μέχρι να μιλήσουμε (κριτικές/ακυρώσεις)' },
}

export const RULES = {
  probationDays: 21,
  winnerIn14: 6, winnerKeep14: 4,
  newPerDay: 1.5, newMaxShare: 0.20,
  candidateShare: 0.15,
  maxShareOne: 0.35,
  clusterKm: 4,
  minAdSet: 1.5, // € / μέρα — κάτω από αυτό ένα ad set δεν βγάζει αρκετά δεδομένα
}

export type LocInput = { id: string; name: string; city: string | null; lat: number | null; lng: number | null; created_at: string }
export type BookingInput = { location_id: string; user_id: string | null; created_at: string; status: string; total_amount: number | null; platform_fee: number | null; cancelled_by?: string | null }
export type ReviewInput = { location_id: string; rating: number }

export type LocStat = {
  id: string; name: string; city: string; lat: number | null; lng: number | null
  liveDays: number; n7: number; n14: number; n30: number; gmv14: number; gmv30: number; fee30: number
  cancel30: number; cancelRate: number; partnerCancel30: number; customers: number; repeaters: number
  rating: number | null; reviews: number; lastBooking: string | null
  tier: Tier; prevTier: Tier | null; reason: string; budget: number
}

const DAY = 864e5
const r2 = (x: number) => Math.round(x * 100) / 100

export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}

export function classify(
  locs: LocInput[], bookings: BookingInput[], reviews: ReviewInput[],
  prev: Record<string, Tier> = {}, now = Date.now(),
): LocStat[] {
  return locs.map(l => {
    const mine = bookings.filter(b => b.location_id === l.id)
    const age = (b: BookingInput) => (now - new Date(b.created_at).getTime()) / DAY
    const ok = mine.filter(b => !/^cancel|no_show/.test(b.status))
    const in7 = ok.filter(b => age(b) <= 7), in14 = ok.filter(b => age(b) <= 14), in30 = ok.filter(b => age(b) <= 30)
    const all30 = mine.filter(b => age(b) <= 30)
    const cancel30 = all30.length - in30.length
    // Ποιότητα: μετράνε ΜΟΝΟ οι ακυρώσεις από το πλυντήριο (όχι του πελάτη — βροχή, αλλαγή σχεδίων).
    const partnerCancel30 = all30.filter(b => /^cancel/.test(b.status) && b.cancelled_by === 'partner').length
    const per = new Map<string, number>()
    ok.forEach(b => { if (b.user_id) per.set(b.user_id, (per.get(b.user_id) || 0) + 1) })
    const rv = reviews.filter(x => x.location_id === l.id)
    const rating = rv.length ? rv.reduce((s, x) => s + Number(x.rating), 0) / rv.length : null
    const liveDays = Math.floor((now - new Date(l.created_at).getTime()) / DAY)
    const sum = (a: BookingInput[], k: 'total_amount' | 'platform_fee') => r2(a.reduce((s, b) => s + (Number(b[k]) || 0), 0))
    const st: LocStat = {
      id: l.id, name: l.name, city: (l.city || '').trim(), lat: l.lat, lng: l.lng, liveDays,
      n7: in7.length, n14: in14.length, n30: in30.length, gmv14: sum(in14, 'total_amount'), gmv30: sum(in30, 'total_amount'), fee30: sum(in30, 'platform_fee'),
      cancel30, cancelRate: all30.length ? cancel30 / all30.length : 0, partnerCancel30,
      customers: per.size, repeaters: [...per.values()].filter(n => n > 1).length,
      rating: rating == null ? null : Math.round(rating * 10) / 10, reviews: rv.length,
      lastBooking: ok.length ? ok.map(b => b.created_at).sort().at(-1)! : null,
      tier: 'dead', prevTier: prev[l.id] || null, reason: '', budget: 0,
    }
    const p = st.prevTier
    if (st.reviews >= 2 && (st.rating ?? 5) <= 3.5) { st.tier = 'review'; st.reason = `μέσος όρος ${st.rating}★ σε ${st.reviews} κριτικές` }
    else if (partnerCancel30 >= 2 && partnerCancel30 / Math.max(1, all30.length) >= 0.3) { st.tier = 'review'; st.reason = `${partnerCancel30} ακυρώσεις από το πλυντήριο (30 μέρες)` }
    else if (st.n14 >= RULES.winnerIn14) { st.tier = 'winner'; st.reason = `${st.n14} κρατήσεις / 14 μέρες` }
    else if (p === 'winner' && st.n14 >= RULES.winnerKeep14) { st.tier = 'winner'; st.reason = `κρατάει τον τίτλο (${st.n14} / 14 μέρες)` }
    else if (liveDays < RULES.probationDays) { st.tier = 'new'; st.reason = `μέρα ${liveDays + 1} από ${RULES.probationDays} · ${st.n14} κρατήσεις μέχρι τώρα` }
    else if (st.n30 >= 2 || st.n14 >= 1) { st.tier = 'candidate'; st.reason = `${st.n30} κρατήσεις / 30 μέρες` }
    else { st.tier = 'dead'; st.reason = st.n30 ? `μόνο ${st.n30} κράτηση σε 30 μέρες` : 'καμία κράτηση σε 30 μέρες' }
    return st
  })
}

/** Μοιράζει ποσό σε βάρη, με ανώτατο όριο ανά στοιχείο (το περίσσευμα ξαναμοιράζεται στους υπόλοιπους). */
function splitCapped(total: number, weights: number[], cap: number | number[]): number[] {
  const capOf = (i: number) => Math.max(0, Array.isArray(cap) ? cap[i] : cap)
  const out = weights.map(() => 0)
  let left = total, open = weights.map((w, i) => (w > 0 ? i : -1)).filter(i => i >= 0)
  for (let k = 0; k < 10 && left > 0.01 && open.length; k++) {
    const W = open.reduce((s, i) => s + weights[i], 0)
    const next: number[] = []
    let used = 0
    for (const i of open) {
      const add = left * weights[i] / W
      const room = capOf(i) - out[i]
      if (add >= room) { out[i] += room; used += room } else { out[i] += add; used += add; next.push(i) }
    }
    left -= used; open = next
  }
  return out
}

export type Plan = {
  daily: number
  byTier: Record<Tier, { count: number; budget: number; n14: number }>
  clusters: { name: string; lat: number; lng: number; budget: number; members: { id: string; name: string; tier: Tier; budget: number }[] }[]
  unallocated: number
}

/** Ομαδοποίηση σε περιοχές (ad sets ~4 km): ξεκινάμε από το πλυντήριο με το μεγαλύτερο budget. */
function buildClusters(stats: LocStat[]): Plan['clusters'] {
  const clusters: Plan['clusters'] = []
  for (const s of stats.filter(x => x.budget > 0.004 && x.lat != null && x.lng != null).sort((a, b) => b.budget - a.budget)) {
    const pt = { lat: s.lat!, lng: s.lng! }
    const c = clusters.find(c => km(c, pt) <= RULES.clusterKm)
    const m = { id: s.id, name: s.name, tier: s.tier, budget: r2(s.budget) }
    if (c) { c.members.push(m); c.budget = r2(c.budget + s.budget) }
    else clusters.push({ name: s.city || s.name, lat: pt.lat, lng: pt.lng, budget: r2(s.budget), members: [m] })
  }
  return clusters
}

export function allocate(stats: LocStat[], daily: number): Plan {
  const B = Math.max(0, daily)
  const winners = stats.filter(s => s.tier === 'winner')
  const cands = stats.filter(s => s.tier === 'candidate')
  const news = stats.filter(s => s.tier === 'new')
  stats.forEach(s => { s.budget = 0 })
  const cap = B * RULES.maxShareOne

  // Νέα: σειρά προτεραιότητας = έλξη (κρατήσεις 14 ημ.) + «πρώτη εβδομάδα» (εγγυημένη ευκαιρία).
  // Χρηματοδοτούνται όσα χωράνε με ≥ minAdSet το καθένα — όχι ψίχουλα σε όλα (0,40€ δεν κάνει τίποτα στο Meta).
  const newPool = Math.min(news.length * RULES.newPerDay, B * RULES.newMaxShare)
  const score = (s: LocStat) => s.n14 + (s.liveDays < 7 ? 2 : 0)
  const queue = [...news].sort((a, b) => score(b) - score(a) || a.liveDays - b.liveDays)
  const funded = queue.slice(0, Math.max(0, Math.floor(newPool / RULES.newPerDay)))
  splitCapped(newPool, funded.map(s => 1 + s.n14), RULES.newPerDay * 2).forEach((v, i) => { funded[i].budget = v })
  const candPool = cands.length ? B * RULES.candidateShare : 0
  splitCapped(candPool, cands.map(s => s.n30 + 1), cap).forEach((v, i) => { cands[i].budget = v })
  let winPool = B - stats.reduce((t, s) => t + s.budget, 0)
  const toWinners = (amount: number) => {
    if (!winners.length || amount <= 0.01) return amount
    splitCapped(amount, winners.map(s => Math.max(1, s.gmv14)), winners.map(s => cap - s.budget)).forEach((v, i) => { winners[i].budget += v })
    const left = B - stats.reduce((t, s) => t + s.budget, 0)
    return left > 0.01 ? left : 0
  }
  winPool = toWinners(winPool)
  // Χωρίς winners → τα λεφτά πάνε στους υποψήφιους.
  if (winPool > 0.01 && cands.length) splitCapped(winPool, cands.map(s => s.n30 + 1), cap).forEach((v, i) => { cands[i].budget += v })

  // Περιοχές (ad sets) χωρίς winner και κάτω από minAdSet δεν αξίζουν δικό τους ad set → τα λεφτά τους στους winners.
  for (let k = 0; k < 3; k++) {
    let freed = 0
    for (const c of buildClusters(stats)) {
      if (c.budget < RULES.minAdSet && !c.members.some(m => m.tier === 'winner')) {
        c.members.forEach(m => { const s = stats.find(x => x.id === m.id)!; freed += s.budget; s.budget = 0 })
      }
    }
    if (freed < 0.01) break
    toWinners(freed)
  }
  stats.forEach(s => { s.budget = r2(s.budget) })
  const spent = stats.reduce((t, s) => t + s.budget, 0)

  const byTier = {} as Plan['byTier']
  ;(['winner', 'candidate', 'new', 'dead', 'review'] as Tier[]).forEach(t => {
    const g = stats.filter(s => s.tier === t)
    byTier[t] = { count: g.length, budget: r2(g.reduce((a, s) => a + s.budget, 0)), n14: g.reduce((a, s) => a + s.n14, 0) }
  })

  const clusters = buildClusters(stats)
  return { daily: r2(B), byTier, clusters: clusters.sort((a, b) => b.budget - a.budget), unallocated: r2(B - spent) }
}

/* ---------------------------------- φόρτωση από τη βάση ---------------------------------- */

export async function loadTierData(db: SupabaseClient) {
  const since = new Date(Date.now() - 90 * DAY).toISOString()
  const [{ data: locs }, { data: rv }, { data: settings }, { data: spend }] = await Promise.all([
    db.from('locations').select('id, name, city, lat, lng, created_at').eq('is_active', true),
    db.from('reviews').select('location_id, rating'),
    db.from('app_settings').select('key, value').in('key', ['ad_plan', 'location_tiers']),
    db.from('ad_spend').select('day, amount').gte('day', new Date(Date.now() - 8 * DAY).toISOString().slice(0, 10)),
  ])
  const bookings: (BookingInput & { profiles: { email?: string | null } | null })[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from('bookings')
      .select('location_id, user_id, created_at, status, total_amount, platform_fee, cancelled_by, source, profiles(email)')
      .gte('created_at', since).or('source.is.null,source.neq.manual').order('created_at').range(from, from + 999)
    bookings.push(...((data || []) as unknown as typeof bookings))
    if (!data || data.length < 1000) break
  }
  const real = bookings.filter(b => !isInternalEmail(b.profiles?.email))
  const map = Object.fromEntries((settings || []).map(s => [s.key, s.value])) as { ad_plan?: { daily?: number }; location_tiers?: { tiers?: Record<string, Tier>; at?: string } }
  const days = (spend || []).filter(s => Number(s.amount) > 0)
  const avg7 = days.length ? days.reduce((a, s) => a + Number(s.amount), 0) / days.length : 0
  const daily = Number(map.ad_plan?.daily) > 0 ? Number(map.ad_plan!.daily) : Math.round(avg7)
  return {
    locs: ((locs || []) as LocInput[]).filter(l => l.id !== CANARY_ID),
    bookings: real as BookingInput[],
    reviews: (rv || []) as ReviewInput[],
    prev: map.location_tiers?.tiers || {},
    prevAt: map.location_tiers?.at || null,
    daily, dailySource: Number(map.ad_plan?.daily) > 0 ? 'ρύθμιση' : 'μέσος όρος 7 ημερών',
  }
}
