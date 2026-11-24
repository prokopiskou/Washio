'use client'

import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ensureDeviceId } from '@/lib/device'
import { funnel } from '@/lib/funnel'

// Εφαρμογή, ΕΠΙΣΚΕΠΤΗΣ (χωρίς λογαριασμό): ζητάμε ειδοποιήσεις ΜΙΑ φορά, όταν κλείσει πλυντήριο χωρίς κράτηση.
// Token ανά συσκευή → /api/push/register-guest → την επόμενη μέρα «Το −3€ σε περιμένει».
// Αν η άδεια υπάρχει ήδη (π.χ. Android ≤12) → καταχώρηση σιωπηλά, χωρίς παράθυρο.
const ASKED = 'ws_guest_push_asked'

async function registerGuest(ask: boolean): Promise<boolean> {
  try {
    const { FirebaseMessaging } = await import('@capacitor-firebase/messaging')
    let perm = await FirebaseMessaging.checkPermissions()
    if (perm.receive !== 'granted') {
      if (!ask || perm.receive === 'denied') return false
      perm = await FirebaseMessaging.requestPermissions()
      if (perm.receive !== 'granted') return false
    }
    const { token } = await FirebaseMessaging.getToken()
    const device = ensureDeviceId()
    if (!token || !device) return false
    await fetch('/api/push/register-guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, device, platform: Capacitor.getPlatform() }) })
    return true
  } catch { return false }
}

export function GuestPushPrompt() {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState('')
  useEffect(() => {
    let native = false
    try { native = Capacitor.isNativePlatform() } catch { /* web */ }
    if (!native) return
    let alive = true
    // (24/11) ΟΧΙ στο πρώτο άνοιγμα (ο χρήστης είναι απασχολημένος): μόλις ΚΛΕΙΣΕΙ ένα πλυντήριο χωρίς κράτηση
    // (το στέλνει ο χάρτης: washio:washer-closed). Μία φορά.
    const onClosed = async (ev: Event) => {
      try { if (localStorage.getItem(ASKED)) return } catch { return }
      const { data } = await createClient().auth.getSession()
      if (!alive || data.session) return // συνδεδεμένοι: η κανονική ροή (PushReminderPrompt)
      try {
        const { FirebaseMessaging } = await import('@capacitor-firebase/messaging')
        const perm = await FirebaseMessaging.checkPermissions()
        if (perm.receive === 'granted') { try { localStorage.setItem(ASKED, '1') } catch { /* ignore */ } ; await registerGuest(false); return }
        if (perm.receive === 'denied') return
      } catch { return }
      if (!alive) return
      setPlace(String((ev as CustomEvent).detail?.name || ''))
      setOpen(true); funnel('guest_push_prompt', { meta: { on: 'washer_closed' } })
    }
    window.addEventListener('washio:washer-closed', onClosed)
    return () => { alive = false; window.removeEventListener('washio:washer-closed', onClosed) }
  }, [])

  if (!open) return null
  const close = (yes: boolean) => {
    try { localStorage.setItem(ASKED, '1') } catch { /* ignore */ }
    setOpen(false)
    funnel(yes ? 'guest_push_yes' : 'guest_push_no')
    if (yes) registerGuest(true)
  }
  return (
    <div className="fixed inset-x-0 bottom-0 z-[85] px-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}>
      <div className="mx-auto max-w-md rounded-[22px] bg-white shadow-[0_10px_40px_rgba(16,24,42,0.25)] border border-washio-border p-4">
        <div className="flex items-start gap-3">
          <span className="shrink-0 w-10 h-10 rounded-xl bg-[#EAF7FB] text-washio-cyan-dark flex items-center justify-center"><Bell size={20} /></span>
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-washio-navy leading-snug">Να σου θυμίσουμε το −3€{place ? ` για το ${place}` : ''};</p>
            <p className="text-[13px] text-gray-600 leading-snug mt-0.5">Μία ειδοποίηση για το κουπόνι σου και ελεύθερες ώρες κοντά σου. Τίποτα άλλο.</p>
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={() => close(false)} className="flex-1 h-11 rounded-xl border border-washio-border text-[14px] font-semibold text-gray-600">Όχι τώρα</button>
          <button onClick={() => close(true)} className="flex-1 h-11 rounded-xl bg-washio-cyan text-white text-[14px] font-semibold">Ναι</button>
        </div>
      </div>
    </div>
  )
}
