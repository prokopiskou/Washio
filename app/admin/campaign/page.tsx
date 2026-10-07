'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Stats = {
  sent: number; delivered: number; opened: number; clicked: number; bounced: number; complained: number
  openRate: number; clickRate: number; clickToOpen: number; bookings: number; bookers: number; revenue: number; firstSentAt: string | null
}
type Preview = { subject: string; total: number; withCoupon: number; willGetCoupon: number; sample: string[] }

// Admin: καμπάνια email «Το −3€ σου λήγει τη Δευτέρα 12/10».
// 1) Βλέπεις πόσους αφορά  2) Στέλνεις δοκιμή στον εαυτό σου  3) Αποστολή σε όλους.
export default function CampaignPage() {
  // 'new' = υπενθύμιση σε όσους ΔΕΝ έλαβαν κανένα email (χωρίς ημερομηνία λήξης) · 'all' = «λήγει 12/10»
  const [audience, setAudience] = useState<'new' | 'all'>('new')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState<'' | 'test' | 'send'>('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [stats, setStats] = useState<Stats | null>(null)
  const [statsBusy, setStatsBusy] = useState(false)
  const [statsErr, setStatsErr] = useState('')

  const call = async (mode: 'preview' | 'test' | 'send' | 'stats') => {
    const res = await fetch('/api/admin/campaign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, audience }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || 'Σφάλμα')
    return json
  }

  const loadStats = async () => {
    setStatsBusy(true); setStatsErr('')
    try { setStats(await call('stats')) } catch (e) { setStatsErr((e as Error).message) } finally { setStatsBusy(false) }
  }

  useEffect(() => {
    setPreview(null); setStats(null); setErr(''); setMsg('')
    call('preview').then(setPreview).catch(e => setErr(e.message))
    loadStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience])

  const sendTest = async () => {
    setBusy('test'); setMsg(''); setErr('')
    try { const r = await call('test'); setMsg(`Η δοκιμή στάλθηκε στο ${r.sentTo}. Δες το inbox σου.`) }
    catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }

  const sendAll = async () => {
    if (!preview) return
    if (!confirm(`Αποστολή σε ${preview.total} χρήστες; Δεν αναιρείται.`)) return
    setBusy('send'); setMsg(''); setErr('')
    try {
      const r = await call('send')
      setMsg(`Στάλθηκε σε ${r.sent} χρήστες. Νέα κουπόνια: ${r.couponsGiven}.${r.skipped ? ' Παραλείφθηκαν: ' + r.skipped + '.' : ''}${r.errors?.length ? ' Σφάλματα: ' + r.errors.join(', ') : ''}`)
    } catch (e) { setErr((e as Error).message) } finally { setBusy('') }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-5 py-8">
      <div className="max-w-md mx-auto">
        <Link href="/admin" className="text-[13px] text-gray-500">← Admin</Link>
        <h1 className="text-[22px] font-bold text-gray-900 mt-3">Καμπάνια email</h1>
        <div className="inline-flex bg-white border border-gray-200 rounded-xl p-1 mt-4">
          {([['new', 'Νέοι (υπενθύμιση)'], ['all', '«Λήγει 12/10»']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setAudience(k)}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold ${audience === k ? 'bg-gray-900 text-white' : 'text-gray-500'}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-gray-500 mt-2">
          {audience === 'new'
            ? '«Ξέχασες το −3€ σου;» σε όσους ΔΕΝ έχουν κάνει κράτηση ΚΑΙ δεν έχουν λάβει κανένα email καμπάνιας. Χωρίς ημερομηνία λήξης.'
            : '«Η έκπτωσή σου λήγει σύντομα» (3€ φθηνότερο μέχρι Δευτέρα 12/10) σε όσους δεν έχουν κάνει κράτηση.'}
        </p>

        <div className="bg-white border border-gray-100 rounded-2xl p-4 mt-5">
          {!preview && !err && <p className="text-[13px] text-gray-400">Φόρτωση παραληπτών…</p>}
          {preview && (
            <>
              <p className="text-[12px] text-gray-400">Θέμα</p>
              <p className="text-[14px] font-semibold text-gray-900">{preview.subject}</p>
              <div className="flex gap-6 mt-4">
                <div><p className="text-[26px] font-bold text-gray-900">{preview.total}</p><p className="text-[11px] text-gray-400">παραλήπτες</p></div>
                <div><p className="text-[26px] font-bold text-green-600">{preview.withCoupon}</p><p className="text-[11px] text-gray-400">με κουπόνι −3€</p></div>
              </div>
              {preview.willGetCoupon > 0 && (
                <p className="text-[12px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">
                  {preview.willGetCoupon} δεν έχουν ακόμα −3€ — θα τους δοθεί αυτόματα πριν φύγει το email, ώστε να ισχύει για όλους.
                </p>
              )}
              <p className="text-[11px] text-gray-400 mt-3">Δείγμα: {preview.sample.join(', ')}</p>
            </>
          )}
        </div>

        <button onClick={sendTest} disabled={!!busy || !preview}
          className="w-full mt-4 bg-white border border-gray-200 text-gray-900 text-[14px] font-semibold py-3.5 rounded-xl disabled:opacity-40">
          {busy === 'test' ? 'Αποστολή…' : '1. Στείλε δοκιμή σε μένα'}
        </button>
        <button onClick={sendAll} disabled={!!busy || !preview}
          className="w-full mt-2.5 bg-gray-900 text-white text-[14px] font-semibold py-3.5 rounded-xl disabled:opacity-40">
          {busy === 'send' ? 'Αποστολή…' : `2. Αποστολή σε όλους${preview ? ` (${preview.total})` : ''}`}
        </button>

        {msg && <p className="text-[13px] text-green-700 mt-4">{msg}</p>}
        {err && <p className="text-[13px] text-red-600 mt-4">{err}</p>}

        {/* ── Αποτελέσματα ── */}
        <div className="flex items-center justify-between mt-8">
          <h2 className="text-[17px] font-bold text-gray-900">Αποτελέσματα</h2>
          <button onClick={loadStats} disabled={statsBusy} className="text-[13px] font-semibold text-gray-500 disabled:opacity-40">
            {statsBusy ? 'Φόρτωση…' : '↻ Ανανέωση'}
          </button>
        </div>
        <div className="bg-white border border-gray-100 rounded-2xl p-4 mt-3">
          {statsErr && <p className="text-[13px] text-red-600">{statsErr}</p>}
          {!stats && !statsErr && <p className="text-[13px] text-gray-400">Φόρτωση στατιστικών…</p>}
          {stats && stats.sent === 0 && <p className="text-[13px] text-gray-400">Δεν έχει σταλεί ακόμα η καμπάνια.</p>}
          {stats && stats.sent > 0 && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div><p className="text-[22px] font-bold text-gray-900">{stats.delivered}<span className="text-[13px] text-gray-400 font-medium">/{stats.sent}</span></p><p className="text-[11px] text-gray-400">παραδόθηκαν</p></div>
                <div><p className="text-[22px] font-bold text-gray-900">{stats.openRate}%</p><p className="text-[11px] text-gray-400">άνοιξαν ({stats.opened})</p></div>
                <div><p className="text-[22px] font-bold text-[#19A8C7]">{stats.clickRate}%</p><p className="text-[11px] text-gray-400">πάτησαν ({stats.clicked})</p></div>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-gray-100">
                <div><p className="text-[22px] font-bold text-green-600">{stats.bookings}</p><p className="text-[11px] text-gray-400">κρατήσεις</p></div>
                <div><p className="text-[22px] font-bold text-gray-900">€{stats.revenue.toFixed(0)}</p><p className="text-[11px] text-gray-400">τζίρος</p></div>
                <div><p className="text-[22px] font-bold text-gray-900">{stats.clickToOpen}%</p><p className="text-[11px] text-gray-400">κλικ / ανοίγματα</p></div>
              </div>
              {(stats.bounced > 0 || stats.complained > 0) && (
                <p className="text-[12px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-4">
                  Bounce: {stats.bounced} · Spam: {stats.complained}
                </p>
              )}
              <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
                Ποσοστά επί των παραδομένων. Τα «ανοίγματα» είναι φουσκωμένα (το Apple Mail ανοίγει αυτόματα τα email) — μέτρα κλικ και κρατήσεις.
                Κρατήσεις = όσοι πήραν το email και έκλεισαν μετά την αποστολή.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
