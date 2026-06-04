'use client'

export async function lightTap() {
  if (typeof window === 'undefined') return
  const cap = (window as any).Capacitor
  if (!cap || !cap.isNativePlatform()) return

  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    await Haptics.impact({ style: ImpactStyle.Light })
  } catch (e) {}
}

export async function mediumTap() {
  if (typeof window === 'undefined') return
  const cap = (window as any).Capacitor
  if (!cap || !cap.isNativePlatform()) return

  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    await Haptics.impact({ style: ImpactStyle.Medium })
  } catch (e) {}
}

export async function heavyTap() {
  if (typeof window === 'undefined') return
  const cap = (window as any).Capacitor
  if (!cap || !cap.isNativePlatform()) return

  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    await Haptics.impact({ style: ImpactStyle.Heavy })
  } catch (e) {}
}

export async function successHaptic() {
  if (typeof window === 'undefined') return
  const cap = (window as any).Capacitor
  if (!cap || !cap.isNativePlatform()) return

  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics')
    await Haptics.notification({ type: NotificationType.Success })
  } catch (e) {}
}

export async function errorHaptic() {
  if (typeof window === 'undefined') return
  const cap = (window as any).Capacitor
  if (!cap || !cap.isNativePlatform()) return

  try {
    const { Haptics, NotificationType } = await import('@capacitor/haptics')
    await Haptics.notification({ type: NotificationType.Error })
  } catch (e) {}
}

export async function selectionHaptic() {
  if (typeof window === 'undefined') return
  const cap = (window as any).Capacitor
  if (!cap || !cap.isNativePlatform()) return

  try {
    const { Haptics } = await import('@capacitor/haptics')
    await Haptics.selectionStart()
    await Haptics.selectionChanged()
    await Haptics.selectionEnd()
  } catch (e) {}
}
