// Οδηγίες προς πλυντήριο — ανοίγει ΚΑΤΕΥΘΕΙΑΝ την εφαρμογή χαρτών με το σημείο.
//
// Γιατί: μέσα στο native app (WebView) ένα link google.com/maps άνοιγε το Safari
// → σελίδα Google Maps web → «κατέβασε την εφαρμογή» → App Store, χωρίς πινέζα.
//
//   iOS app     → Google Maps app (comgooglemaps://) με πλοήγηση στο σημείο.
//                 Αν δεν είναι εγκατεστημένο → Apple Maps (υπάρχει πάντα), ίδιο σημείο.
//   Android app → https link Google Maps → το Android το ανοίγει στην εφαρμογή Maps.
//   Web         → Google Maps σε νέα καρτέλα (σε κινητό ανοίγει την εφαρμογή αν υπάρχει).

export type DirectionsTarget = {
  lat?: number | string | null
  lng?: number | string | null
  name?: string | null
  address?: string | null
  city?: string | null
}

function destination(t: DirectionsTarget): string {
  const lat = Number(t.lat), lng = Number(t.lng)
  if (Number.isFinite(lat) && Number.isFinite(lng) && lat !== 0 && lng !== 0) return `${lat},${lng}`
  return [t.address, t.city].filter(Boolean).join(', ') || String(t.name || '')
}

export function directionsWebUrl(t: DirectionsTarget): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination(t))}&travelmode=driving`
}

export function openDirections(t: DirectionsTarget) {
  const dest = encodeURIComponent(destination(t))
  const web = directionsWebUrl(t)
  const cap = typeof window !== 'undefined' ? (window as any).Capacitor : null
  const isNative = !!cap?.isNativePlatform?.()
  const platform = cap?.getPlatform?.()

  if (isNative && platform === 'ios') {
    // Αν ανοίξει το Google Maps, το app πάει στο background (document.hidden).
    // Αν μείνουμε ορατοί → δεν υπάρχει η εφαρμογή → Apple Maps.
    let left = false
    const onHide = () => { if (document.hidden) left = true }
    document.addEventListener('visibilitychange', onHide)
    window.location.href = `comgooglemaps://?daddr=${dest}&directionsmode=driving`
    setTimeout(() => {
      document.removeEventListener('visibilitychange', onHide)
      if (!left) window.location.href = `maps://?daddr=${dest}&dirflg=d`
    }, 1200)
    return
  }

  if (isNative) {
    // Android: το link Google Maps ανοίγει απευθείας στην εφαρμογή Maps.
    window.location.href = web
    return
  }

  window.open(web, '_blank', 'noopener,noreferrer')
}
