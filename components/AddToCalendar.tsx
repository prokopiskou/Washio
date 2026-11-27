'use client'

import { useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { googleCalUrl, outlookCalUrl, icsUrl, eventUtc, type CalEvent } from '@/lib/calendar'
import { funnel } from '@/lib/funnel'

// «Πρόσθεσε στο ημερολόγιο» → ο πελάτης διαλέγει: Google / Apple (iPhone) / Outlook.
// Αν η εφαρμογή ημερολογίου υπάρχει στο κινητό → ανοίγει ΑΥΤΗ (συμπληρωμένο ραντεβού). Αλλιώς → web.
//   Android (εφαρμογή Washio): plugin CalendarIntent (Intent INSERT με package) → αλλιώς web.
//   Android (browser): intent: URL με package + browser_fallback_url (το Chrome ανοίγει web αν λείπει).
//   iPhone: Apple → .ics (φύλλο «Προσθήκη» του Ημερολογίου). Google/Outlook → εξωτερικό άνοιγμα
//           (universal link: ανοίγει την εφαρμογή αν υπάρχει, αλλιώς Safari).
const PKG: Record<string, string> = { google: 'com.google.android.calendar', outlook: 'com.microsoft.office.outlook' }

type Plat = 'ios' | 'android' | 'web'
async function platform(): Promise<{ native: boolean; os: Plat }> {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (Capacitor.isNativePlatform()) return { native: true, os: Capacitor.getPlatform() as Plat }
  } catch { /* web */ }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  return { native: false, os: /android/i.test(ua) ? 'android' : /iphone|ipad|ipod/i.test(ua) ? 'ios' : 'web' }
}

function androidIntentUrl(e: CalEvent, pkg: string, fallback: string): string {
  const { start, end } = eventUtc(e)
  const enc = (v: string) => encodeURIComponent(v)
  return 'intent:#Intent;action=android.intent.action.INSERT;type=vnd.android.cursor.item/event;'
    + `package=${pkg};S.title=${enc(e.title)};l.beginTime=${start.getTime()};l.endTime=${end.getTime()};`
    + (e.location ? `S.eventLocation=${enc(e.location)};` : '') + (e.details ? `S.description=${enc(e.details)};` : '')
    + `S.browser_fallback_url=${enc(fallback)};end`
}

async function addTo(kind: string, e: CalEvent, webUrl: string) {
  const abs = webUrl.startsWith('/') ? `${window.location.origin}${webUrl}` : webUrl
  const { native, os } = await platform()
  const pkg = PKG[kind]

  if (native) {
    if (os === 'android' && pkg) {
      try {
        const { Capacitor, registerPlugin } = await import('@capacitor/core')
        if (Capacitor.isPluginAvailable('CalendarIntent')) {
          const { start, end } = eventUtc(e)
          const Cal = registerPlugin<{ add(o: Record<string, unknown>): Promise<void> }>('CalendarIntent')
          await Cal.add({ title: e.title, begin: start.getTime(), end: end.getTime(), location: e.location || '', description: e.details || '', pkg })
          return
        }
      } catch { /* not_installed → web */ }
    }
    if (kind === 'apple' || webUrl.startsWith('/')) {
      // .ics: το in-app Safari δείχνει το φύλλο «Προσθήκη στο Ημερολόγιο».
      try { const { Browser } = await import('@capacitor/browser'); await Browser.open({ url: abs }); return } catch { /* */ }
    }
    // Εξωτερικός host → το Capacitor τον δίνει στο σύστημα (ανοίγει την εφαρμογή αν δηλώνει το link, αλλιώς browser).
    window.location.href = abs
    return
  }

  if (os === 'android' && pkg) { window.location.href = androidIntentUrl(e, pkg, abs); return }
  if (webUrl.startsWith('/')) { window.location.href = abs; return }
  // iPhone: ίδια καρτέλα → το universal link ανοίγει την εφαρμογή αν υπάρχει. Υπολογιστής: νέα καρτέλα.
  if (os === 'ios') window.location.href = abs
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
            <button key={k} type="button" onClick={() => { funnel('calendar_add', { meta: { to: k } }); void addTo(k, event, url()) }}
              className={`h-11 rounded-xl border text-[12px] font-semibold ${base}`}>{label}</button>
          ))}
        </div>
      )}
    </div>
  )
}
