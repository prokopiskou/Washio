export type UserCoords = { lat: number; lng: number }

function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return !!cap?.isNativePlatform?.()
}

function isGranted(status: { location?: string; coarseLocation?: string }): boolean {
  return status.location === 'granted' || status.coarseLocation === 'granted'
}

function isDenied(status: { location?: string; coarseLocation?: string }): boolean {
  return status.location === 'denied' && status.coarseLocation !== 'granted'
}

/**
 * Θέση συσκευής. Στο native χρησιμοποιεί @capacitor/geolocation (CLLocationManager),
 * όχι navigator.geolocation του WKWebView (που ξαναρωτά σε κάθε cold start).
 *
 * checkPermissions πρώτα. requestPermissions ΜΟΝΟ αν είναι prompt.
 * Αν granted, παίρνουμε θέση χωρίς dialog.
 */
export async function getDevicePosition(opts?: {
  interactive?: boolean
  maximumAge?: number
}): Promise<UserCoords | null> {
  const interactive = opts?.interactive !== false
  const maximumAge = opts?.maximumAge ?? 300000

  if (isNativePlatform()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation')
      let status = await Geolocation.checkPermissions()
      if (!isGranted(status)) {
        if (!interactive || isDenied(status)) return null
        status = await Geolocation.requestPermissions()
        if (!isGranted(status)) return null
      }
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge,
      })
      return { lat: pos.coords.latitude, lng: pos.coords.longitude }
    } catch {
      return null
    }
  }

  if (typeof navigator === 'undefined' || !navigator.geolocation) return null

  try {
    const permissions = navigator.permissions
    if (permissions?.query) {
      const result = await permissions.query({ name: 'geolocation' })
      if (result.state === 'denied') return null
      if (result.state === 'prompt' && !interactive) return null
    }
  } catch {
    // Safari / παλιοί browsers μπορεί να μην υποστηρίζουν permissions.query
  }

  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge },
    )
  })
}
