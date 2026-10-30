'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import CheckinScanner from '@/components/CheckinScanner'
import { SCAN_KEY } from '@/lib/scan-device'

// «Σκάνερ καταστήματος»: washio.gr/s/<token> — ανοίγει ΜΟΝΟ κάμερα check-in για ένα πλυντήριο,
// χωρίς login (για υπαλλήλους). Το token αποθηκεύεται στη συσκευή → πιάνει και η κάμερα του κινητού (/c/...).

export default function StoreScannerPage() {
  const params = useParams<{ token: string }>()
  const token = String(params?.token || '')
  const [state, setState] = useState<'loading' | 'ok' | 'bad'>('loading')
  const [name, setName] = useState('')

  useEffect(() => {
    let alive = true
    fetch(`/api/scan/info?t=${encodeURIComponent(token)}`).then(r => r.json()).then(j => {
      if (!alive) return
      if (j?.ok) {
        setName(String(j.name || '')); setState('ok')
        try { localStorage.setItem(SCAN_KEY, token) } catch { /* ignore */ }
      } else {
        try { if (localStorage.getItem(SCAN_KEY) === token) localStorage.removeItem(SCAN_KEY) } catch { /* ignore */ }
        setState('bad')
      }
    }).catch(() => { if (alive) setState('bad') })
    return () => { alive = false }
  }, [token])

  if (state === 'loading') return <main className="min-h-screen bg-white flex items-center justify-center text-[13px] text-gray-400">Φόρτωση…</main>
  if (state === 'bad') return (
    <main className="min-h-screen bg-white flex items-center justify-center px-8 text-center">
      <div>
        <p className="text-[17px] font-semibold text-gray-900">Το link σκάνερ δεν ισχύει</p>
        <p className="text-[13px] text-gray-500 mt-2">Ζήτα νέο link από τον υπεύθυνο του πλυντηρίου.</p>
      </div>
    </main>
  )
  return <CheckinScanner embedded scanToken={token} title={`Σκάνερ · ${name}`} onClose={() => {}} />
}
