import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'gr.washio.app',
  appName: 'Washio',
  webDir: 'public',
  server: {
    url: 'https://washio.gr',
    cleartext: false,
  },
  ios: {
    contentInset: 'always',
  },
  android: {
    allowMixedContent: false,
  },
}

export default config