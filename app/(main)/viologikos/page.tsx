'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { MapPin, Star, ChevronRight } from 'lucide-react'
import { isCanary, stripWatermark } from '@/lib/canary'
import { athensToday, weekdayMon1FromYmd } from '@/lib/time'
import { promoAppliesTo } from '@/lib/promotions'

// Landing διαφήμισης «Βιολογικός καθαρισμός»: όλα τα πλυντήρια με βιολογικό, κοντινότερα πρώτα.
// Προσφορές σταθερής τιμής (π.χ. «μόνο 120€») μπαίνουν πρώτες. Πάτημα → σελίδα πλυντηρίου με επιλεγμένο τον βιολογικό.
type Svc = { id: string; name: string; price: number | null; is_range: boolean | null; price_min: number | null; price_max: number | null; is_active: boolean | null }
type Loc = { id: string; name: string; slug: string; city: string | null; address: string | null; lat: number; lng: number; photos: string[] | null; services: Svc[]; reviews: { rating: number }[] | null }
type Promo = { location_id: string; service_id: string; discount_type: string; discount_value: number; starts_on: string; ends_on: string; by_booking_date?: boolean }

const isBio = (n: string) => /^βιολογικός καθαρισμός/i.test(n.trim()) && !/παιδικ/i.test(n)
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}
const ATHENS = { lat: 37.9838, lng: 23.7275 }

export default function ViologikosPage() {
  const [locs, setLocs] = useState<Loc[] | null>(null)
  const [promos, setPromos] = useState<Promo[]>([])
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    const today = athensToday()
    fetch(`/api/map-data?date=${today}&dow=${weekdayMon1FromYmd(today)}`).then(r => r.json())
      .then(j => setLocs(((j.locations || []) as Loc[]).filter(l => !isCanary(l.id)).map(l => ({ ...l, name: stripWatermark(l.name || '') }))))
      .catch(() => setLocs([]))
    fetch('/api/promotions?all=1').then(r => r.json()).then(j => setPromos(j.promotions || [])).catch(() => {})
    navigator.geolocation?.getCurrentPosition(p => setMe({ lat: p.coords.latitude, lng: p.coords.longitude }), () => {}, { timeout: 8000, maximumAge: 600000 })
  }, [])

  const rows = useMemo(() => {
    const today = athensToday()
    const origin = me || ATHENS
    return (locs || []).flatMap(l => {
      const s = (l.services || []).find(x => x.is_active !== false && isBio(x.name))
      if (!s) return []
      const min = s.is_range ? Number(s.price_min) || 0 : Number(s.price) || 0
      const max = s.is_range ? Number(s.price_max) || 0 : min
      if (!(min > 0)) return []
      const p = promos.find(x => x.service_id === s.id && x.discount_type === 'fixed' && promoAppliesTo(x, today, today))
      const rs = l.reviews || []
      return [{ l, s, min, max, promo: p ? Number(p.discount_value) : null, until: p?.ends_on || null, dist: km(origin, l), rating: rs.length ? rs.reduce((a, r) => a + r.rating, 0) / rs.length : null, n: rs.length }]
    }).sort((a, b) => (a.promo != null ? 0 : 1) - (b.promo != null ? 0 : 1) || a.dist - b.dist)
  }, [locs, promos, me])

  const nearest = rows.filter(r => r.dist <= 25)
  const list = nearest.length ? nearest : rows
  const cheapest = list.length ? Math.min(...list.map(r => r.promo ?? r.min)) : null

  return (
    <div className="min-h-[100dvh] bg-washio-bg pb-28">
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+20px)] pb-5" style={{ background: 'linear-gradient(180deg,#10182A 0%,#1B2A44 100%)' }}>
        <p className="text-[11px] font-bold tracking-[1.6px] uppercase text-washio-cyan">Washio</p>
        <h1 className="mt-1.5 text-[26px] leading-tight font-bold text-white tracking-tight">Βιολογικός καθαρισμός αυτοκινήτου κοντά σου</h1>
        <p className="mt-2 text-[14px] text-white/75">Καθίσματα, ταπετσαρίες, μοκέτες. Διαλέγεις πλυντήριο και ώρα — πληρώνεις στο κατάστημα.</p>
        {cheapest != null && <p className="mt-3 inline-block rounded-full bg-white/10 px-3 py-1 text-[13px] font-semibold text-white">από €{Math.round(cheapest)}</p>}
      </div>

      <div className="px-4 pt-4 space-y-2.5">
        {locs == null && <p className="text-center text-[13px] text-gray-500 py-8">Φόρτωση…</p>}
        {locs != null && list.length === 0 && <p className="text-center text-[13px] text-gray-500 py-8">Δεν βρέθηκαν πλυντήρια με βιολογικό κοντά σου.</p>}
        {list.map(({ l, s, min, max, promo, until, dist, rating, n }) => (
          <Link key={l.id} href={`/locations/${l.slug}?service=${s.id}&utm_source=bio_landing`}
            className={`flex items-center gap-3 rounded-[18px] bg-white p-2.5 active:scale-[0.99] transition-transform ${promo != null ? 'border-2 border-[#C9A227]' : 'border border-washio-border'}`}
            style={{ boxShadow: '0 4px 14px rgba(16,24,42,0.06)' }}>
            <div className="w-[72px] h-[72px] rounded-[14px] overflow-hidden shrink-0 bg-washio-navy flex items-center justify-center">
              {l.photos?.[0]
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={l.photos[0]} alt="" loading="lazy" className="w-full h-full object-cover" />
                : <span className="text-white text-[20px] font-semibold">{l.name.charAt(0)}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-semibold text-washio-navy truncate">{l.name}</p>
              <p className="mt-0.5 flex items-center gap-1 text-[12px] text-gray-500 truncate">
                <MapPin size={12} className="shrink-0" />{dist < 1 ? `${Math.round(dist * 1000)} μ.` : `${dist.toFixed(1)} km`}{l.city ? ` · ${l.city}` : ''}
                {rating != null && <><span className="mx-0.5">·</span><Star size={11} className="text-washio-cyan-dark fill-washio-cyan-dark" />{rating.toFixed(1)} ({n})</>}
              </p>
              <div className="mt-1">
                {promo != null ? (
                  <p className="text-[13px]">
                    <span className="line-through text-gray-400 mr-1.5">{max > min ? `${Math.round(min)}–${Math.round(max)} €` : `${Math.round(min)} €`}</span>
                    <span className="font-bold text-[#8A6A0C]">€{Math.round(promo)} μόνο</span>
                    {until && <span className="ml-1.5 text-[11px] text-[#8A6A0C]">έως {Number(until.slice(8, 10))}/{Number(until.slice(5, 7))}</span>}
                  </p>
                ) : (
                  <p className="text-[13px] font-semibold text-washio-navy">από €{Math.round(min)}</p>
                )}
              </div>
            </div>
            <ChevronRight size={18} className="text-gray-300 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}
