'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Preview = { subject: string; total: number; withCoupon: number; willGetCoupon: number; sample: string[] }

// Admin: καμπάνια email «Από Δευτέρα ήλιος — κλείσε με −3€».
// 1) Βλέπεις πόσους αφορά  2) Στέλνεις δοκιμή στον εαυτό σου  3) Αποστολή σε όλους.
export default function CampaignPage() {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState<'' | 'test' | 'send'>('')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')

  const call = async (mode: 'preview' | 'test' | 'send') => {
    const res = await fetch('/api/admin/campaign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || 'Σφάλμα')
    return json
  }

  useEffect(() => { call('preview').then(setPreview).catch(e => setErr(e.message)) }, [])

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
        <p className="text-[13px] text-gray-500 mt-1">«Από Δευτέρα ήλιος — κλείσε με −3€» σε όσους δεν έχουν κάνει κράτηση.</p>

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
      </div>
    </main>
  )
}
