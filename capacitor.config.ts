import { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'gr.washio.app',
  appName: 'Washio',
  webDir: 'public',
  server: {
    // Φόρτωσε ΑΠΕΥΘΕΙΑΣ το www (το apex washio.gr κάνει 307 → www.washio.gr).
    // Αλλιώς το Capacitor βλέπει το redirect ως εξωτερικό host και ανοίγει in-app Safari.
    url: 'https://www.washio.gr',
    // Όλα αυτά τα hosts μένουν ΜΕΣΑ στο webview (όχι in-app browser).
    allowNavigation: [
      'washio.gr',
      'www.washio.gr',
      '*.washio.gr',
      'js.stripe.com',
      '*.stripe.com',
      'hooks.stripe.com',
    ],
    cleartext: false,
    iosScheme: 'https',
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'never',
    scrollEnabled: true,
    allowsLinkPreview: false,
    preferredContentMode: 'mobile',
    backgroundColor: '#0A0A0A',
    limitsNavigationsToAppBoundDomains: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: true,
    backgroundColor: '#0A0A0A',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 3000,
      launchAutoHide: false,
      launchFadeOutDuration: 500,
      backgroundColor: '#0A0A0A',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#0A0A0A',
      overlaysWebView: false,
    },
    Keyboard: {
      resize: 'native',
      style: 'DARK',
      resizeOnFullScreen: true,
    },
  },
}

export default config
