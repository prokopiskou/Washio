'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

// QR check-in φτιαγμένο ΣΤΗ ΣΥΣΚΕΥΗ (χωρίς δεύτερο αίτημα για εικόνα στο /api/qr) → εμφανίζεται αμέσως.
// Ίδιο περιεχόμενο με το /api/qr: https://www.washio.gr/c/<κωδικός>.
export function CheckinQR({ code, size = 200, className = '' }: { code: string; size?: number; className?: string }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    let alive = true
    QRCode.toString(`https://www.washio.gr/c/${code}`, {
      type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#10182A', light: '#FFFFFF' },
    }).then(s => { if (alive) setSvg(s) }).catch(() => {})
    return () => { alive = false }
  }, [code])
  return (
    <div className={className} style={{ width: size, height: size }} aria-label="QR"
      dangerouslySetInnerHTML={svg ? { __html: svg.replace('<svg ', `<svg width="${size}" height="${size}" `) } : undefined} />
  )
}

/** Κωδικός QR από την τοπική μνήμη (για να φαίνεται αμέσως στο επόμενο άνοιγμα). */
export function cachedQr(key: string): string | null {
  try { const v = localStorage.getItem('ws_qr_' + key); return v && /^[A-Za-z0-9._-]{6,64}$/.test(v) ? v : null } catch { return null }
}
export function storeQr(key: string, code: string) {
  try { localStorage.setItem('ws_qr_' + key, code) } catch { /* ignore */ }
}
