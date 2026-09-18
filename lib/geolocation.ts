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
 * WKWebView / browser geolocation. Same path the map used before #9.
 */
function getWebPosition(opts: {
  interactive: boolean
  maximumAge: number
}): Promise<UserCoords | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)

  const run = async () => {
    try {
      const permissions = navigator.permissions
      if (permissions?.query) {
        const result = await permissions.query({ name: 'geolocation' })
        if (result.state === 'denied') return null
        if (result.state === 'prompt' && !opts.interactive) return null
      }
    } catch {
      // Safari / παλιοί browsers μπορεί να μην υποστηρίζουν permissions.query
    }

    return new Promise<UserCoords | null>(resolve => {
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: opts.maximumAge },
      )
    })
  }

  return run()
}

/**
 * Θέση συσκευής.
 *
 * Native + plugin διαθέσιμο: @capacitor/geolocation (CLLocationManager).
 * checkPermissions πρώτα. requestPermissions ΜΟΝΟ αν είναι prompt.
 * Αν granted, παίρνουμε θέση χωρίς dialog.
 *
 * Αν το native plugin λείπει (παλιό iOS binary χωρίς cap sync) ή αποτύχει
 * με UNIMPLEMENTED, πέφτουμε στο navigator.geolocation — αλλιώς ο χάρτης
 * μένει χωρίς θέση μέχρι native rebuild.
 *
 * Denied στο native: δεν κάνουμε web fallback (θα ξαναρωτούσε στο WKWebView).
 */
export async function getDevicePosition(opts?: {
  interactive?: boolean
  maximumAge?: number
}): Promise<UserCoords | null> {
  const interactive = opts?.interactive !== false
  const maximumAge = opts?.maximumAge ?? 300000

  if (isNativePlatform()) {
    try {
      const { Capacitor } = await import('@capacitor/core')
      if (Capacitor.isPluginAvailable('Geolocation')) {
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
      }
    } catch {
      // Παλιό binary / plugin unimplemented / GPS error → web path
    }
  }

  return getWebPosition({ interactive, maximumAge })
}
