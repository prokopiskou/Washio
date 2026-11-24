// «Πρόσθεσε στο ημερολόγιο»: Google / Apple (.ics) / Outlook για ένα ραντεβού (ώρα Ελλάδας).
export type CalEvent = { title: string; date: string; time: string; durMin: number; location?: string; details?: string }

const pad = (n: number) => String(n).padStart(2, '0')

/** Διαφορά ώρας Ελλάδας από UTC για εκείνη τη μέρα (+2 χειμώνα / +3 καλοκαίρι), σε λεπτά. */
export function athensOffsetMin(date: string): number {
  const d = new Date(`${date}T12:00:00Z`)
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', hourCycle: 'h23' }).format(d))
  return (h - 12) * 60
}

/** Έναρξη/λήξη σε UTC. */
export function eventUtc(e: CalEvent): { start: Date; end: Date } {
  const [hh, mm] = e.time.split(':').map(Number)
  const local = Date.UTC(+e.date.slice(0, 4), +e.date.slice(5, 7) - 1, +e.date.slice(8, 10), hh || 0, mm || 0)
  const start = new Date(local - athensOffsetMin(e.date) * 60000)
  return { start, end: new Date(start.getTime() + Math.max(15, e.durMin || 60) * 60000) }
}

const stamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`

export function googleCalUrl(e: CalEvent): string {
  const { start, end } = eventUtc(e)
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${stamp(start)}/${stamp(end)}`, ctz: 'Europe/Athens', ...(e.location ? { location: e.location } : {}), ...(e.details ? { details: e.details } : {}) })
  return `https://calendar.google.com/calendar/render?${q.toString()}`
}

export function outlookCalUrl(e: CalEvent): string {
  const { start, end } = eventUtc(e)
  const q = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: e.title, startdt: start.toISOString(), enddt: end.toISOString(), ...(e.location ? { location: e.location } : {}), ...(e.details ? { body: e.details } : {}) })
  return `https://outlook.live.com/calendar/0/deeplink/compose?${q.toString()}`
}

/** Link στο /api/ics (Apple / iPhone / Android με .ics). */
export function icsUrl(e: CalEvent): string {
  const q = new URLSearchParams({ t: e.title, d: e.date, h: e.time, m: String(e.durMin || 60), ...(e.location ? { l: e.location } : {}), ...(e.details ? { x: e.details } : {}) })
  return `/api/ics?${q.toString()}`
}

export function icsText(e: CalEvent, uid: string): string {
  const { start, end } = eventUtc(e)
  const esc = (s: string) => s.replace(/[\\;,]/g, m => '\\' + m).replace(/\r?\n/g, '\\n')
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Washio//Booking//EL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${uid}@washio.gr`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(e.title)}`, ...(e.location ? [`LOCATION:${esc(e.location)}`] : []), ...(e.details ? [`DESCRIPTION:${esc(e.details)}`] : []),
    'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:Ραντεβού πλυσίματος σε 1 ώρα', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n')
}
