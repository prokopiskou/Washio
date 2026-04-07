import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Washio',
    short_name: 'Washio',
    description: 'Κράτηση πλυσίματος αυτοκινήτου',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0A0A0A',
    orientation: 'portrait',
    icons: [
      {
        src: '/washio-logo.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/washio-logo.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}