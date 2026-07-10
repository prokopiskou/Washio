// Native (Capacitor) OAuth via in-app Safari View Controller + deep-link callback.
// On web, falls back to the normal Supabase OAuth redirect (unchanged).

type Provider = 'google' | 'apple' | 'facebook'

// Custom URL scheme registered in iOS Info.plist (CFBundleURLTypes).
const NATIVE_REDIRECT = 'gr.washio.app://auth-callback'

export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false
  const cap = (window as any).Capacitor
  return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform())
}

// Start an OAuth sign-in. In the native app it opens an in-app browser
// (SFSafariViewController) and returns via the custom scheme; on web it
// redirects normally.
export async function signInWithProvider(
  supabase: any,
  provider: Provider,
  webRedirectTo: string,
): Promise<void> {
  if (isNativeApp()) {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true },
      })
      if (error || !data?.url) throw error || new Error('no url')
      // Opens SFSafariViewController (in-app). Requires @capacitor/browser in the build.
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url: data.url })
      return
    } catch {
      // Older build without the Browser plugin → fall back to normal redirect
      // so social login still works (won't break existing installs).
      await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: webRedirectTo },
      })
      return
    }
  }

  await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: webRedirectTo },
  })
}

// Handle the deep link that comes back from the in-app browser after OAuth.
// Exchanges the PKCE code (verifier is stored in this WebView) for a session,
// closes the in-app browser, and navigates home.
export async function handleAuthDeepLink(url: string): Promise<boolean> {
  if (!url || !url.includes('auth-callback')) return false
  try {
    const parsed = new URL(url)
    const code = parsed.searchParams.get('code')

    // Close the in-app browser (ignore if already closed).
    try {
      const { Browser } = await import('@capacitor/browser')
      await Browser.close()
    } catch {}

    if (!code) return false

    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return false

    window.location.href = '/'
    return true
  } catch {
    return false
  }
}
