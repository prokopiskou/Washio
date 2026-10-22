// Έλεγχος κινητού (client + server).
// Δεκτά: ελληνικό κινητό 69xxxxxxxx (με ή χωρίς +30 / 0030 / κενά / παύλες)
//        ή ξένο νούμερο με + ή 00 μπροστά (τουρίστες) — το ξένο ΔΕΝ παίρνει κουπόνι.
// Απορρίπτονται: 1234567890, σταθερά, 6900000000 (ίδιο ψηφίο), 6912345678.

const digitsOf = (raw: string | null | undefined) => String(raw || '').replace(/\D/g, '')

/** Ελληνικό κινητό → «69xxxxxxxx», αλλιώς null. */
export function greekMobile(raw: string | null | undefined): string | null {
  let d = digitsOf(raw)
  if (d.startsWith('0030')) d = d.slice(4)
  else if (d.startsWith('30') && d.length === 12) d = d.slice(2)
  if (!/^69\d{8}$/.test(d)) return null
  if (/^69(\d)\1{7}$/.test(d)) return null // 6900000000, 6911111111…
  if (d === '6912345678' || d === '6987654321') return null
  return d
}

/** Ξένο νούμερο (+44…, 0049…) — όχι +30. */
export function foreignPhone(raw: string | null | undefined): boolean {
  const t = String(raw || '').trim()
  if (!t.startsWith('+') && !t.startsWith('00')) return false
  let d = digitsOf(t)
  if (t.startsWith('00')) d = d.slice(2)
  return !d.startsWith('30') && d.length >= 8 && d.length <= 15
}

/** Δεκτό για κράτηση (ελληνικό κινητό ή ξένο). */
export function phoneOk(raw: string | null | undefined): boolean {
  return !!greekMobile(raw) || foreignPhone(raw)
}
