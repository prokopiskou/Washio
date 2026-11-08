import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Γραμματοσειρές (ελληνικά) για τα PDF συμβολαίων — να μπαίνουν στις serverless functions.
  outputFileTracingIncludes: {
    '/api/contract/**': ['./lib/fonts/**'],
    '/api/admin/applications': ['./lib/fonts/**'],
  },
  // Client router cache: επιστροφή σε οθόνη που είδες πρόσφατα = άμεση
  // (χωρίς νέο fetch του route payload από το Vercel).
  experimental: {
    staleTimes: { dynamic: 30, static: 180 },
  },
  // Καθαρά vanity links για social bios — κρατούν UTM tracking πίσω.
  // Universal Links (iOS): το AASA πρέπει να σερβίρεται ως JSON, χωρίς redirect.
  async headers() {
    // Security headers σε ΟΛΕΣ τις διαδρομές. Δεν σπάνε Stripe/Maps/Supabase/Capacitor:
    // το X-Frame-Options αφορά το να ΜΗΝ μας κάνει iframe τρίτος (clickjacking) — το
    // Stripe μπαίνει ΜΕΣΑ μας σε δικό του iframe, που επιτρέπεται κανονικά.
    // Content-Security-Policy — allowlist κάθε εξωτερικού origin που ΟΝΤΩΣ χρησιμοποιεί ο browser.
    // Server-side κλήσεις (Resend/Telegram/Oxygen/BulkGate) ΔΕΝ περνούν από εδώ.
    const SUPA = 'https://cnifsqeyujwozxhcctrd.supabase.co'
    const csp = [
      "default-src 'self'",
      // Next (hydration) θέλει unsafe-inline· Maps/Firebase θέλουν unsafe-eval.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://maps.googleapis.com https://www.googletagmanager.com https://connect.facebook.net https://accounts.google.com https://*.gstatic.com https://*.googleapis.com https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: " + SUPA + " https://*.supabase.co https://*.googleapis.com https://maps.gstatic.com https://*.gstatic.com https://*.ggpht.com https://*.googleusercontent.com https://www.facebook.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      // fetch/XHR/WebSocket: Supabase (+realtime wss), Stripe, Maps/Places, geocoding, καιρός, FCM, Vercel.
      "connect-src 'self' " + SUPA + " wss://cnifsqeyujwozxhcctrd.supabase.co https://*.supabase.co https://api.stripe.com https://m.stripe.network https://maps.googleapis.com https://places.googleapis.com https://nominatim.openstreetmap.org https://api.open-meteo.com https://*.googleapis.com https://*.google.com https://graph.facebook.com https://www.google-analytics.com https://*.analytics.google.com https://stats.g.doubleclick.net https://va.vercel-scripts.com https://vitals.vercel-insights.com",
      // iframes: Stripe (PaymentElement + 3DS) και OAuth popups (Google/Facebook).
      "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://m.stripe.network https://*.stripe.com https://accounts.google.com https://www.facebook.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' " + SUPA + " https://*.supabase.co https://accounts.google.com https://www.facebook.com",
      "frame-ancestors 'none'",
    ].join('; ')
    const security = [
      // HTTPS για 2 χρόνια (+ preload). Ο browser δεν ξαναμιλά ποτέ http.
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      // Κανείς δεν μας βάζει σε iframe → φράγμα σε clickjacking.
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      // Ο browser δεν «μαντεύει» τύπο αρχείου (απόφυγε MIME-sniffing attacks).
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      // Μην στέλνεις ολόκληρο URL ως referrer σε άλλα domains.
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // Μόνο εμείς ζητάμε κάμερα (QR scan) + τοποθεσία (χάρτης). Όλα τα άλλα κλειστά.
      { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=(), payment=*' },
      // REPORT-ONLY: δεν μπλοκάρει τίποτα — μόνο γράφει παραβιάσεις στο console του browser.
      // Όταν δεις washio.gr καθαρό (checkout + login + χάρτης), άλλαξε ΜΟΝΟ το key παρακάτω
      // σε 'Content-Security-Policy' για να γίνει ενεργό.
      { key: 'Content-Security-Policy-Report-Only', value: csp },
    ]
    return [
      { source: '/:path*', headers: security },
      { source: '/.well-known/apple-app-site-association', headers: [{ key: 'Content-Type', value: 'application/json' }] },
      { source: '/.well-known/assetlinks.json', headers: [{ key: 'Content-Type', value: 'application/json' }] },
    ]
  },
  async redirects() {
    return [
      { source: '/insta', destination: '/?ref=WASHIO&utm_source=instagram&utm_medium=bio&utm_campaign=welcome3', permanent: false },
      { source: '/tiktok', destination: '/?ref=WASHIO&utm_source=tiktok&utm_medium=bio&utm_campaign=welcome3', permanent: false },
      { source: '/yt', destination: '/?utm_source=youtube&utm_medium=bio&utm_campaign=launch', permanent: false },
      { source: '/fb', destination: '/?ref=WASHIO&utm_source=facebook&utm_medium=page&utm_campaign=welcome3', permanent: false },
      // Flyers: το QR δείχνει ΕΔΩ (όχι απευθείας σε σελίδα) → αλλάζουμε προορισμό χωρίς ξανατύπωμα.
      // Προορισμός: ορίζεται από το FLYER_DEST στο app/page.tsx (τώρα: χάρτης). ref=FLYER (−3€). permanent:false → ποτέ cache στον browser.
      // /f/<περιοχή>: ο χάρτης ανοίγει πάνω στην περιοχή (vyronas, zografou, ilioupoli, argyroupoli, alimos, agios-dimitrios).
      // Άγνωστη περιοχή (π.χ. /f/fanari) → απλώς γενικός χάρτης, η μέτρηση FLYER_<ΟΝΟΜΑ> ισχύει κανονικά.
      { source: '/f', destination: '/?ref=FLYER&utm_source=flyer&utm_medium=print&utm_campaign=flyer1', permanent: false },
      { source: '/f/:area', destination: '/?ref=FLYER&utm_source=flyer&utm_medium=print&utm_campaign=:area&area=:area', permanent: false },
    ]
  },
}

export default nextConfig
