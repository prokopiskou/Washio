import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
