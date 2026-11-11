import { NextRequest, NextResponse } from 'next/server'

// Πρόγνωση 7 ημερών (Open-Meteo, δωρεάν, χωρίς κλειδί · μοντέλα ECMWF/ICON/GFS).
// GET /api/weather?lat=37.9&lng=23.7 → { days: [{ date, kind, prob, mm }] }
// kind: sun | cloud | rain | storm. Cache 1 ώρα ανά ~10km κελί.
export const revalidate = 3600

type Day = { date: string; kind: 'sun' | 'cloud' | 'rain' | 'storm'; prob: number; mm: number }

function kindOf(code: number, prob: number, mm: number): Day['kind'] {
  if (code >= 95) return 'storm'
  // Εικονίδιο 🌧️ μόνο για ουσιαστική βροχή: ≥5mm, ή 2–5mm με πιθανότητα ≥60% (βλ. lib/weather.ts).
  if (mm >= 5 || (mm >= 2 && prob >= 60)) return 'rain'
  if (code <= 1) return 'sun'
  return 'cloud'
}

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get('lat') || 37.98)
  const lng = Number(req.nextUrl.searchParams.get('lng') || 23.73)
  if (!isFinite(lat) || !isFinite(lng)) return NextResponse.json({ days: [] })
  const la = lat.toFixed(1), lo = lng.toFixed(1)
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${lo}&daily=weather_code,precipitation_probability_max,precipitation_sum&timezone=Europe%2FAthens&forecast_days=7`,
      { next: { revalidate: 3600 } },
    )
    if (!r.ok) return NextResponse.json({ days: [] })
    const j = await r.json()
    const d = j?.daily || {}
    const days: Day[] = (d.time || []).map((date: string, i: number) => {
      const code = Number(d.weather_code?.[i]) || 0
      const prob = Number(d.precipitation_probability_max?.[i]) || 0
      const mm = Number(d.precipitation_sum?.[i]) || 0
      return { date, kind: kindOf(code, prob, mm), prob, mm: Math.round(mm * 10) / 10 }
    })
    return NextResponse.json({ days }, { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } })
  } catch {
    return NextResponse.json({ days: [] })
  }
}
