'use client'

import { Suspense, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { WashioLoader } from '@/components/WashioLoader'

// Δεν υπάρχει ξεχωριστή εγγραφή — ο μόνος τρόπος είναι email + OTP (το /login).
// Ό,τι έφτανε εδώ (παλιά links, ?ref, ?welcome) το στέλνουμε στο login κρατώντας τα params.
function RegisterRedirect() {
  const router = useRouter()
  const params = useSearchParams()

  useEffect(() => {
    const qs = params.toString()
    router.replace(`/login${qs ? `?${qs}` : ''}`)
  }, [router, params])

  return <div className="min-h-screen flex items-center justify-center"><WashioLoader /></div>
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><WashioLoader /></div>}>
      <RegisterRedirect />
    </Suspense>
  )
}
