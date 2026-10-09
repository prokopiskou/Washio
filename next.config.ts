import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Client router cache: επιστροφή σε οθόνη που είδες πρόσφατα = άμεση
  // (χωρίς νέο fetch του route payload από το Vercel).
  experimental: {
    staleTimes: { dynamic: 30, static: 180 },
  },
  // Καθαρά vanity links για social bios — κρατούν UTM tracking πίσω.
  async redirects() {
    return [
      { source: '/insta', destination: '/?ref=WASHIO&utm_source=instagram&utm_medium=bio&utm_campaign=welcome3', permanent: false },
      { source: '/tiktok', destination: '/?ref=WASHIO&utm_source=tiktok&utm_medium=bio&utm_campaign=welcome3', permanent: false },
      { source: '/yt', destination: '/?utm_source=youtube&utm_medium=bio&utm_campaign=launch', permanent: false },
      { source: '/fb', destination: '/?ref=WASHIO&utm_source=facebook&utm_medium=page&utm_campaign=welcome3', permanent: false },
      // Flyers: το QR δείχνει ΕΔΩ (όχι απευθείας σε σελίδα) → αλλάζουμε προορισμό χωρίς ξανατύπωμα.
      // Προορισμός: ορίζεται από το FLYER_DEST στο app/page.tsx (τώρα: εγγραφή). ref=FLYER (−3€). permanent:false → ποτέ cache στον browser.
      { source: '/f', destination: '/?ref=FLYER&utm_source=flyer&utm_medium=print&utm_campaign=flyer1', permanent: false },
      { source: '/f/:area', destination: '/?ref=FLYER&utm_source=flyer&utm_medium=print&utm_campaign=:area', permanent: false },
    ]
  },
}

export default nextConfig
