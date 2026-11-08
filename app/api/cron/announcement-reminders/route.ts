import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { remindUnacked } from '@/lib/announcements'
import { sendSms } from '@/lib/sms'

// Ενημερώσεις πλυντηρίων: 4 ώρες χωρίς «Το διάβασα» → 2ο push + SMS (μία φορά). Μόνο 09:00–20:59.
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Athens', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
  if (h < 9 || h > 20) return NextResponse.json({ skipped: 'hours' })
  try { return NextResponse.json({ ok: true, ...(await remindUnacked(db, sendSms)) }) } catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }) }
}
