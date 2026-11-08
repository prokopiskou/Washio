'use client'

import { useCallback, useEffect, useState } from 'react'

// Dashboard πλυντηρίου → Ενημερώσεις Washio με «Το διάβασα ✓».
//  mode 'gate': ΣΗΜΑΝΤΙΚΗ αδιάβαστη → καλύπτει την οθόνη μέχρι «Το διάβασα» · κανονική αδιάβαστη → banner πάνω.
//  mode 'list': όλο το ιστορικό (tab «Ενημερώσεις»).
type Item = { id: string; sentAt: string; ackedAt: string | null; title: string; body: string; important: boolean; location: string }

const EVT = 'washio-updates-changed'
const when = (iso: string) => new Intl.DateTimeFormat('el-GR', { timeZone: 'Europe/Athens', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

export function WasherUpdates({ mode, onCount, onOpenList, t = (s: string) => s }: {
  mode: 'gate' | 'list'; onCount?: (n: number) => void; onOpenList?: () => void; t?: (s: string) => string
}) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    const r = await fetch('/api/dashboard/announcements', { cache: 'no-store' }).catch(() => null)
    const j = r ? await r.json().catch(() => ({})) : {}
    const list = (j.items || []) as Item[]
    setItems(list)
    onCount?.(list.filter(i => !i.ackedAt).length)
  }, [onCount])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
    const h = () => { load() }
    window.addEventListener(EVT, h)
    return () => window.removeEventListener(EVT, h)
  }, [load])

  const ack = async (id: string) => {
    setBusy(id)
    await fetch('/api/dashboard/announcements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => null)
    setBusy('')
    window.dispatchEvent(new Event(EVT))
  }

  if (!items) return null
  const unread = items.filter(i => !i.ackedAt)

  if (mode === 'gate') {
    const blocking = unread.find(i => i.important)
    if (blocking) return (
      <div className="fixed inset-0 z-[90] bg-black/50 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-[22px] p-5 max-h-[85vh] overflow-y-auto">
          <span className="inline-block text-[11px] font-bold px-2 py-1 rounded-md bg-red-50 text-red-700">{t('ΣΗΜΑΝΤΙΚΗ ΕΝΗΜΕΡΩΣΗ')}</span>
          <p className="text-[18px] font-bold text-gray-900 mt-2.5">{blocking.title}</p>
          <p className="text-[14px] text-gray-700 mt-2 leading-relaxed whitespace-pre-line">{blocking.body}</p>
          <p className="text-[11px] text-gray-400 mt-3">Washio · {when(blocking.sentAt)}</p>
          <button disabled={busy === blocking.id} onClick={() => ack(blocking.id)}
            className="mt-4 w-full h-12 rounded-xl bg-gray-900 text-white text-[15px] font-semibold disabled:opacity-50">{t('Το διάβασα ✓')}</button>
        </div>
      </div>
    )
    if (!unread.length) return null
    return (
      <button onClick={onOpenList} className="w-full mb-3 text-left rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
        <p className="text-[13px] font-bold text-blue-900">📣 {unread.length === 1 ? t('Νέα ενημέρωση από τη Washio') : `${unread.length} ${t('νέες ενημερώσεις από τη Washio')}`}</p>
        <p className="text-[12px] text-blue-800 mt-0.5 truncate">{unread[0].title} · {t('Πάτα για να τη διαβάσεις')}</p>
      </button>
    )
  }

  return (
    <div className="space-y-2.5">
      {items.length === 0 && <p className="text-[13px] text-gray-400 text-center py-8">{t('Καμία ενημέρωση ακόμα.')}</p>}
      {items.map(i => (
        <div key={i.id} className={`rounded-2xl border p-4 ${i.ackedAt ? 'border-gray-200 bg-white' : 'border-blue-300 bg-blue-50/40'}`}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-[15px] font-bold text-gray-900">{i.title}</p>
            {i.important && <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-50 text-red-700">{t('ΣΗΜΑΝΤΙΚΟ')}</span>}
          </div>
          <p className="text-[14px] text-gray-700 mt-1.5 leading-relaxed whitespace-pre-line">{i.body}</p>
          <div className="flex items-center justify-between mt-3">
            <p className="text-[11px] text-gray-400">{when(i.sentAt)}</p>
            {i.ackedAt
              ? <p className="text-[12px] font-semibold text-green-700">✓ {t('Διαβάστηκε')} {when(i.ackedAt)}</p>
              : <button disabled={busy === i.id} onClick={() => ack(i.id)} className="h-9 px-4 rounded-lg bg-gray-900 text-white text-[13px] font-semibold disabled:opacity-50">{t('Το διάβασα ✓')}</button>}
          </div>
        </div>
      ))}
    </div>
  )
}
