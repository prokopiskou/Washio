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
      { source: '/insta', destination: '/?utm_source=instagram&utm_medium=bio&utm_campaign=launch', permanent: false },
      { source: '/tiktok', destination: '/?utm_source=tiktok&utm_medium=bio&utm_campaign=launch', permanent: false },
      { source: '/yt', destination: '/?utm_source=youtube&utm_medium=bio&utm_campaign=launch', permanent: false },
      { source: '/fb', destination: '/?utm_source=facebook&utm_medium=bio&utm_campaign=launch', permanent: false },
    ]
  },
}

export default nextConfig
