'use client'

// Τελευταίο δίχτυ: σφάλμα στο root layout. Πρέπει να έχει δικά του html/body.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="el">
      <body style={{ margin: 0, fontFamily: '-apple-system, sans-serif', background: '#fff' }}>
        <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: 34, margin: '0 0 8px' }}>😕</p>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: '#0A0A0A', margin: 0 }}>Κάτι πήγε στραβά</h1>
          <p style={{ fontSize: 13, color: '#666', marginTop: 8 }}>Δοκίμασε ξανά ή άνοιξε ξανά την εφαρμογή.</p>
          {error?.digest && <p style={{ fontSize: 10, color: '#ccc', marginTop: 8 }}>#{error.digest}</p>}
          <div style={{ display: 'flex', gap: 8, marginTop: 24, width: '100%', maxWidth: 320 }}>
            <button onClick={() => reset()} style={{ flex: 1, height: 44, borderRadius: 12, background: '#0A0A0A', color: '#fff', border: 0, fontSize: 13, fontWeight: 600 }}>
              Δοκίμασε ξανά
            </button>
            <a href="/" style={{ flex: 1, height: 44, lineHeight: '44px', borderRadius: 12, border: '1px solid #E5E7EB', color: '#333', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              Αρχική
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
