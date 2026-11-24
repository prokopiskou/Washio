'use client'

import { useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { googleCalUrl, outlookCalUrl, icsUrl, type CalEvent } from '@/lib/calendar'
import { funnel } from '@/lib/funnel'

// «Πρόσθεσε στο ημερολόγιο» → ο πελάτης διαλέγει: Google / Apple (iPhone) / Outlook.
async function openUrl(url: string) {
  const abs = url.startsWith('/') ? `${window.location.origin}${url}` : url
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (Capacitor.isNativePlatform()) {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url: abs })
      return
    }
  } catch { /* web */ }
  if (url.startsWith('/')) window.location.href = abs
  else window.open(abs, '_blank', 'noopener')
}

export function AddToCalendar({ event, dark = false, locale = 'el' }: { event: CalEvent; dark?: boolean; locale?: string }) {
  const [open, setOpen] = useState(false)
  const en = locale === 'en'
  const opts: [string, string, () => string][] = [
    ['google', 'Google Calendar', () => googleCalUrl(event)],
    ['apple', en ? 'Apple / iPhone' : 'Apple / iPhone', () => icsUrl(event)],
    ['outlook', 'Outlook', () => outlookCalUrl(event)],
  ]
  const base = dark ? 'border-white/20 text-white' : 'border-gray-200 text-gray-900'
  return (
    <div className="w-full">
      <button type="button" onClick={() => { setOpen(o => !o); funnel('calendar_open') }}
        className={`w-full h-12 rounded-xl border flex items-center justify-center gap-2 text-[14px] font-semibold ${base}`}>
        <CalendarPlus size={18} /> {en ? 'Add to calendar' : 'Πρόσθεσε στο ημερολόγιο'}
      </button>
      {open && (
        <div className="grid grid-cols-3 gap-2 mt-2">
          {opts.map(([k, label, url]) => (
            <button key={k} type="button" onClick={() => { funnel('calendar_add', { meta: { to: k } }); void openUrl(url()) }}
              className={`h-11 rounded-xl border text-[12px] font-semibold ${base}`}>{label}</button>
          ))}
        </div>
      )}
    </div>
  )
}
