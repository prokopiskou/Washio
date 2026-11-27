'use client'

// Κάρτα χάρτη για τούνελ (χωρίς ραντεβού): αντί για υπηρεσίες/ώρες → μεμονωμένο πλύσιμο + πακέτα.
// Tap → /packs?l=…&p=… (ανοίγει κατευθείαν η πληρωμή). Δεδομένα: /api/packs (lib/packs).
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Pack = { id: string; name: string; washes: number; price: number; perWash: number; single: number; save: number }

const eur = (n: number) => `€${Number(n).toFixed(Number.isInteger(Number(n)) ? 0 : 2).replace('.', ',')}`

export function TunnelPacks({ locationId, locale = 'el' }: { locationId: string; locale?: string }) {
  const router = useRouter()
  const [data, setData] = useState<{ lid: string; packs: Pack[] } | null>(null)
  const packs = data && data.lid === locationId ? data.packs : null
  const en = locale === 'en'
  useEffect(() => {
    let alive = true
    fetch(`/api/packs?locationId=${encodeURIComponent(locationId)}`).then(r => r.json())
      .then(d => { if (alive) setData({ lid: locationId, packs: d.packs || [] }) }).catch(() => { if (alive) setData({ lid: locationId, packs: [] }) })
    return () => { alive = false }
  }, [locationId])

  const go = (p: Pack) => {
    router.push(`/packs?l=${locationId}&p=${p.id}`)
  }

  if (packs === null) {
    return <div className="flex gap-2 mb-3">{[0, 1, 2].map(i => <span key={i} className="flex-1 h-[60px] rounded-[14px] bg-gray-100 animate-pulse" />)}</div>
  }
  const singles = packs.filter(p => p.washes === 1)
  const multi = packs.filter(p => p.washes > 1)

  return (
    <div className="mb-1">
      {singles.length > 0 && (
        <>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{en ? 'Single wash' : 'Μεμονωμένο πλύσιμο'}</p>
          <div className="flex gap-2 mb-3">
            {singles.map(p => (
              <button key={p.id} onClick={() => go(p)}
                className="flex-1 min-w-0 px-1 py-2.5 rounded-[14px] border border-washio-border bg-white text-center active:scale-[0.98] transition-transform">
                <p className="text-xs font-semibold text-washio-navy truncate">{p.name}</p>
                <p className="text-xs mt-0.5 font-semibold text-gray-500">{eur(p.price)}</p>
              </button>
            ))}
          </div>
        </>
      )}
      {multi.length > 0 && (
        <>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{en ? 'Packs' : 'Πακέτα'}</p>
          <div className="flex flex-col gap-2 mb-3">
            {multi.map(p => (
              <button key={p.id} onClick={() => go(p)}
                className="w-full rounded-[14px] border border-washio-border bg-white px-3.5 py-3 flex items-center justify-between text-left active:scale-[0.99] transition-transform">
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-washio-navy truncate">{p.name}</span>
                  <span className="block text-[11.5px] text-gray-500 mt-0.5">
                    {eur(p.perWash)} {en ? 'per wash' : 'το πλύσιμο'}{p.save > 0 ? <span className="font-semibold" style={{ color: '#0F7A5C' }}> · {en ? 'save' : 'κερδίζεις'} {eur(p.save)}</span> : null}
                  </span>
                </span>
                <span className="text-[16px] font-bold text-washio-navy shrink-0 ml-3">{eur(p.price)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      {packs.length === 0 && <p className="text-xs text-gray-500 mb-3">{en ? 'No packs yet.' : 'Δεν υπάρχουν πακέτα ακόμα.'}</p>}
      <p className="text-[11px] text-gray-400 mb-1">{en ? 'Pay now, come whenever you want — show the QR at the entrance.' : 'Πληρώνεις τώρα, έρχεσαι όποτε θες — δείχνεις το QR στην είσοδο.'}</p>
    </div>
  )
}
