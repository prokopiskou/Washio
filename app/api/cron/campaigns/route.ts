import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { campaignAudience, recipientsFor, sendCampaignTo, type Campaign } from '@/lib/campaign-send'

// Προγραμματισμένες καμπάνιες (campaigns.status = 'scheduled', scheduled_at ≤ τώρα).
// Τρέχει από το /api/cron/emails κάθε 15'. Κάθε καμπάνια «κλειδώνεται» (sending) → στέλνεται μία φορά.
// Παλιότερες από 3 ώρες δεν στέλνονται (π.χ. αν έπεσε το cron) → μένουν «missed» για έλεγχο.
export const maxDuration = 300
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const now = new Date()
  const { data, error } = await db.from('campaigns').select('*').eq('status', 'scheduled').lte('scheduled_at', now.toISOString())
  if (error) return NextResponse.json({ ok: false, error: error.message })
  const results: Record<string, unknown> = {}
  for (const c of (data || []) as Campaign[]) {
    if (c.scheduled_at && now.getTime() - new Date(c.scheduled_at).getTime() > 3 * 3600_000) {
      await db.from('campaigns').update({ status: 'missed' }).eq('id', c.id).eq('status', 'scheduled')
      results[c.id] = 'missed'; continue
    }
    const { data: claimed } = await db.from('campaigns').update({ status: 'sending' }).eq('id', c.id).eq('status', 'scheduled').select('id')
    if (!claimed?.length) continue
    try {
      const people = await campaignAudience(db, c)
      const to = recipientsFor(people, c.channels[0])
      const r = await sendCampaignTo(db, c, to, { record: true })
      await db.from('campaigns').update({ status: 'sent', sent_at: new Date().toISOString(), audience_size: r.sent }).eq('id', c.id)
      results[c.id] = r
    } catch (e) {
      await db.from('campaigns').update({ status: 'failed' }).eq('id', c.id)
      results[c.id] = { error: (e as Error).message }
    }
  }
  return NextResponse.json({ ok: true, results })
}
