import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPush } from '@/lib/push'

// Reminder «ώρα για φρεσκάρισμα» — push σε πελάτες που έχουν κάνει opt-in, ~3 βδομάδες
// μετά το τελευταίο τους πλύσιμο, εφόσον δεν έχουν επόμενη κράτηση. Τρέχει από cron.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const REMIND_AFTER_DAYS = 21   // πόσες μέρες μετά το τελευταίο πλύσιμο
const RENOTIFY_DAYS = 30       // μη ξαναστείλεις μέσα σε τόσες μέρες

const dt = (d: string, t?: string | null) =>
  new Date(`${d}T${(t || '00:00').slice(0, 5)}:00`)
const daysSince = (d: Date) => (Date.now() - d.getTime()) / 86400000

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Χρήστες με push subscription (μόνο αυτοί λαμβάνουν reminder).
    const { data: subs } = await supabase.from('push_subscriptions').select('user_id')
    const userIds = [...new Set((subs || []).map(s => s.user_id).filter(Boolean))]
    if (userIds.length === 0) return NextResponse.json({ ok: true, sent: 0 })

    const { data: bookings } = await supabase
      .from('bookings')
      .select('user_id, slot_date, slot_start_time, status')
      .in('user_id', userIds)
      .neq('status', 'cancelled')

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, last_wash_reminder_at')
      .in('id', userIds)

    const lastReminded = new Map<string, string | null>(
      (profiles || []).map(p => [p.id, p.last_wash_reminder_at])
    )

    const now = Date.now()
    let sent = 0

    for (const uid of userIds) {
      const mine = (bookings || []).filter(b => b.user_id === uid)
      if (mine.length === 0) continue

      let lastCompleted: Date | null = null
      let hasUpcoming = false
      for (const b of mine) {
        const when = dt(b.slot_date, b.slot_start_time)
        if (isNaN(when.getTime())) continue
        if (when.getTime() < now) { if (!lastCompleted || when > lastCompleted) lastCompleted = when }
        else hasUpcoming = true
      }

      if (!lastCompleted || hasUpcoming) continue
      if (daysSince(lastCompleted) < REMIND_AFTER_DAYS) continue

      const lr = lastReminded.get(uid)
      if (lr && daysSince(new Date(lr)) < RENOTIFY_DAYS) continue

      await sendPush(uid, {
        title: 'Ώρα για φρεσκάρισμα;',
        body: 'Πέρασε λίγος καιρός από το τελευταίο πλύσιμο. Κλείσε το επόμενο σε 30 δευτερόλεπτα.',
        url: '/map',
      })
      await supabase.from('profiles').update({ last_wash_reminder_at: new Date().toISOString() }).eq('id', uid)
      sent++
    }

    return NextResponse.json({ ok: true, sent })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Σφάλμα'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
