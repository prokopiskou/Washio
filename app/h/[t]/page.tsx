'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { redeemHandoff } from '@/lib/app-handoff'
import { WashioLoader } from '@/components/WashioLoader'

// washio.gr/h/<token>: ανοίγει (στην εφαρμογή ή στο web) συνδεδεμένο με τον λογαριασμό του web.
export default function HandoffPage() {
  const { t } = useParams<{ t: string }>()
  const [msg, setMsg] = useState('')
  useEffect(() => {
    redeemHandoff(String(t || ''), 'link').then(ok => {
      if (ok) window.location.replace('/map')
      else { setMsg('Το link έληξε. Συνδέσου με το email σου.'); setTimeout(() => window.location.replace('/login?redirect=%2Fmap'), 1500) }
    })
  }, [t])
  return <main className="min-h-[60vh] flex flex-col items-center justify-center gap-3 px-6 text-center"><WashioLoader />{msg && <p className="text-[14px] text-gray-600">{msg}</p>}</main>
}
