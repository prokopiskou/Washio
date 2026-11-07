'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { applyPromo } from '@/lib/promotions'

// Dashboard → «Προωθήσεις»: έκπτωση σε μία υπηρεσία για ραντεβού από–έως.
// Ο πελάτης βλέπει την παλιά τιμή διαγραμμένη και τη νέα· η τιμή εφαρμόζεται αυτόματα στην κράτηση.
type Svc = { id: string; service_name: string; price: number; is_active: boolean; is_range?: boolean }
type Promo = { id: string; service_id: string; discount_type: 'percent' | 'amount' | 'fixed'; discount_value: number; starts_on: string; ends_on: string; is_active: boolean }

const eur = (n: number) => n.toFixed(2).replace('.', ',') + '€'
const todayYmd = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(new Date())
const addDays = (ymd: string, d: number) => { const t = new Date(ymd + 'T12:00:00'); t.setDate(t.getDate() + d); return t.toISOString().slice(0, 10) }
const gr = (ymd: string) => { const [y, m, d] = ymd.split('-'); return `${d}/${m}/${y}` }

export function PromotionsPanel({ locationId, services, t }: { locationId: string; services: Svc[]; t: (s: string) => string }) {
  // Υπηρεσίες εύρους (βιολογικός): μόνο «σταθερή τιμή» (π.χ. μόνο 120€) — το εύρος σβήνει στην εφαρμογή.
  const usable = useMemo(() => services.filter(s => s.is_active && (s.is_range || Number(s.price) > 0)), [services])
  const [serviceId, setServiceId] = useState('')
  const [type, setType] = useState<'percent' | 'amount' | 'fixed'>('percent')
  const [value, setValue] = useState('')
  const [from, setFrom] = useState(todayYmd())
  const [to, setTo] = useState(addDays(todayYmd(), 7))
  const [list, setList] = useState<Promo[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const j = await fetch(`/api/dashboard/promotions?location=${locationId}`).then(r => r.json()).catch(() => ({}))
    setList(j.promotions || [])
  }, [locationId])
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const svc = usable.find(s => s.id === serviceId)
  const base = Number(svc?.price || 0)
  const v = Number(String(value).replace(',', '.')) || 0
  const isRangeSvc = !!svc?.is_range
  const effType = isRangeSvc ? 'fixed' : type
  const final = svc && v > 0 ? applyPromo(base, { discount_type: effType, discount_value: v }) : base
  const off = base - final
  const valid = !!svc && v > 0 && final > 0 && (effType !== 'percent' || v <= 90) && (effType !== 'fixed' || isRangeSvc || v < base) && from <= to && to >= todayYmd()

  const create = async () => {
    if (!valid || busy) return
    setBusy(true); setMsg('')
    const r = await fetch('/api/dashboard/promotions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationId, serviceId, discountType: effType, discountValue: v, startsOn: from, endsOn: to }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMsg(j.error || 'Σφάλμα'); return }
    setMsg('✓ ' + t('Η προώθηση δημιουργήθηκε'))
    setValue(''); load()
  }

  const toggle = async (p: Promo) => {
    await fetch('/api/dashboard/promotions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, isActive: !p.is_active }) })
    load()
  }

  const status = (p: Promo) => {
    const d = todayYmd()
    if (!p.is_active) return { l: t('Σε παύση'), c: 'bg-gray-100 text-gray-600' }
    if (p.ends_on < d) return { l: t('Έληξε'), c: 'bg-gray-100 text-gray-500' }
    if (p.starts_on > d) return { l: t('Προγραμματισμένη'), c: 'bg-blue-50 text-blue-700' }
    return { l: t('Ενεργή'), c: 'bg-green-50 text-green-700' }
  }

  const input = 'w-full h-11 px-3 rounded-xl border border-gray-200 text-[15px] bg-white'
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-[17px] font-semibold text-gray-900">{t('Προωθήσεις')}</h2>
        <p className="text-[13px] text-gray-500 mt-1">{t('Δώσε έκπτωση σε μία υπηρεσία. Οι πελάτες βλέπουν την προσφορά στην εφαρμογή και η τιμή εφαρμόζεται αυτόματα στην κράτηση.')}</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-4">
        <label className="text-[12px] font-semibold text-gray-500">{t('Υπηρεσία')}
          <select value={serviceId} onChange={e => setServiceId(e.target.value)} className={input + ' mt-1'}>
            <option value="">{t('Επίλεξε υπηρεσία…')}</option>
            {usable.map(s => <option key={s.id} value={s.id}>{s.service_name} · {s.is_range ? t('εύρος τιμής') : eur(Number(s.price))}</option>)}
          </select>
        </label>

        <div>
          <p className="text-[12px] font-semibold text-gray-500 mb-1">{effType === 'fixed' ? t('Τιμή προσφοράς (€)') : t('Έκπτωση')}</p>
          <div className="flex gap-2">
            {!isRangeSvc && (
              <div className="flex rounded-xl border border-gray-200 overflow-hidden shrink-0">
                {(['percent', 'amount', 'fixed'] as const).map(k => (
                  <button key={k} onClick={() => setType(k)} className={`${k === 'fixed' ? 'px-2.5' : 'w-12'} h-11 text-[14px] font-semibold ${type === k ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'}`}>{k === 'percent' ? '%' : k === 'amount' ? '−€' : t('Τιμή')}</button>
                ))}
              </div>
            )}
            <input value={value} onChange={e => setValue(e.target.value)} inputMode="decimal" placeholder={effType === 'percent' ? 'π.χ. 20' : effType === 'fixed' ? 'π.χ. 120' : 'π.χ. 3'} className={input} />
          </div>
        </div>

        {svc && (
          <div className="rounded-xl bg-gray-50 p-3 text-[14px] flex flex-col gap-1.5">
            <div className="flex justify-between"><span className="text-gray-500">{t('Αρχική τιμή')}</span><span className={v > 0 ? 'line-through text-gray-400' : 'font-semibold'}>{isRangeSvc ? t('εύρος τιμής') : eur(base)}</span></div>
            {!isRangeSvc && <div className="flex justify-between"><span className="text-gray-500">{t('Έκπτωση')}</span><span className="text-red-600 font-semibold">{off > 0 ? `−${eur(off)} (${Math.round(off / base * 100)}%)` : '—'}</span></div>}
            <div className="flex justify-between border-t border-gray-200 pt-1.5"><span className="font-semibold text-gray-900">{t('Τελική τιμή')}</span><span className="font-bold text-gray-900 text-[16px]">{eur(final)}</span></div>
            <p className="text-[11px] text-gray-400">{effType === 'fixed' ? t('Σταθερή τιμή για όλα τα οχήματα (ΙΧ & SUV). Στην εφαρμογή φαίνεται «μόνο» αυτή η τιμή.') : t('Για ΙΧ. Μοτοσικλέτα/SUV: ίδια έκπτωση στην τιμή τους.')}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <label className="text-[12px] font-semibold text-gray-500">{t('Από')}<input type="date" value={from} min={todayYmd()} onChange={e => setFrom(e.target.value)} className={input + ' mt-1'} /></label>
          <label className="text-[12px] font-semibold text-gray-500">{t('Έως')}<input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className={input + ' mt-1'} /></label>
        </div>
        <p className="text-[11px] text-gray-400 -mt-2">{t('Ισχύει για ραντεβού μέσα σε αυτές τις ημέρες (μαζί με την τελευταία).')}</p>

        {msg && <p className={`text-[13px] ${msg.startsWith('✓') ? 'text-green-700' : 'text-red-600'}`}>{msg}</p>}
        <button onClick={create} disabled={!valid || busy} className="h-12 rounded-xl bg-gray-900 text-white text-[15px] font-semibold disabled:opacity-40">
          {busy ? '…' : t('Δημιουργία προώθησης')}
        </button>
      </div>

      {list.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-[12px] font-bold tracking-wide uppercase text-gray-500">{t('Οι προωθήσεις σου')}</p>
          {list.map(p => {
            const s = services.find(x => x.id === p.service_id)
            const b = Number(s?.price || 0)
            const st = status(p)
            return (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-200 p-3.5 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-gray-900 truncate">{s?.service_name || t('Υπηρεσία')}</p>
                  <p className="text-[13px] mt-0.5">{p.discount_type === 'fixed'
                    ? <><span className="line-through text-gray-400">{s?.is_range ? t('εύρος τιμής') : eur(b)}</span> <span className="font-semibold text-gray-900">{t('μόνο')} {eur(Number(p.discount_value))}</span></>
                    : <><span className="line-through text-gray-400">{eur(b)}</span> <span className="font-semibold text-gray-900">{eur(applyPromo(b, p))}</span> <span className="text-red-600">({p.discount_type === 'percent' ? `−${Number(p.discount_value)}%` : `−${eur(Number(p.discount_value))}`})</span></>}</p>
                  <p className="text-[12px] text-gray-500 mt-0.5">{gr(p.starts_on)} – {gr(p.ends_on)}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${st.c}`}>{st.l}</span>
                  {p.ends_on >= todayYmd() && (
                    <button onClick={() => toggle(p)} className="text-[12px] font-semibold text-gray-600 underline">{p.is_active ? t('Παύση') : t('Ενεργοποίηση')}</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
