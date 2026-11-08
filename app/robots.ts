import type { MetadataRoute } from 'next'

// Μηχανές αναζήτησης (Google, Bing): ανοιχτά τα δημόσια (χάρτης, σελίδες πλυντηρίων) για SEO.
// Crawlers ΕΚΠΑΙΔΕΥΣΗΣ AI (αντιγραφή περιεχομένου/δεδομένων): μπλόκο παντού.
// Οι «βοηθοί» που ανοίγουν σελίδα όταν τη ζητά ένας χρήστης (ChatGPT-User, OAI-SearchBot) μένουν
// ανοιχτοί → μπορούν να προτείνουν το Washio σε όποιον ψάχνει πλυντήριο.
const AI_TRAINING = [
  'GPTBot', 'ClaudeBot', 'anthropic-ai', 'Claude-Web', 'CCBot', 'Google-Extended', 'Applebot-Extended',
  'Bytespider', 'Amazonbot', 'FacebookBot', 'Meta-ExternalAgent', 'cohere-ai', 'Diffbot', 'ImagesiftBot',
  'Omgilibot', 'PerplexityBot', 'YouBot', 'Timpibot', 'img2dataset',
]
const PRIVATE = ['/admin', '/dashboard', '/api/', '/booking', '/profile', '/contract/', '/auth/']

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: AI_TRAINING, disallow: '/' },
      { userAgent: '*', allow: '/', disallow: PRIVATE },
    ],
  }
}
