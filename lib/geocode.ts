type Coords = { lat: number; lng: number }

// Μετατρέπει διεύθυνση → συντεταγμένες, ώστε κάθε νέο πλυντήριο να μπαίνει με σωστό
// lat/lng εξ αρχής (όχι placeholder). Δοκιμάζει Google Geocoding, μετά OpenStreetMap.
export async function geocodeAddress(address?: string, city?: string): Promise<Coords | null> {
  const query = [address, city, 'Ελλάδα'].filter(Boolean).join(', ').trim()
  if (!query) return null

  // 1) Google Geocoding (αν το key επιτρέπει server-side χρήση).
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
  if (key) {
    try {
      const r = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&region=gr&key=${key}`
      )
      const d = await r.json()
      const loc = d?.results?.[0]?.geometry?.location
      if (d?.status === 'OK' && loc && typeof loc.lat === 'number') {
        return { lat: loc.lat, lng: loc.lng }
      }
    } catch { /* fall through στο fallback */ }
  }

  // 2) Fallback: Nominatim (OpenStreetMap) — δωρεάν, χωρίς key.
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gr&q=${encodeURIComponent(query)}`,
      { headers: { 'User-Agent': 'Washio/1.0 (https://washio.gr)' } }
    )
    const d = await r.json()
    if (Array.isArray(d) && d[0]?.lat && d[0]?.lon) {
      return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon) }
    }
  } catch { /* ignore */ }

  return null
}
