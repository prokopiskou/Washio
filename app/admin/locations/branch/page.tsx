'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { extractCityLabel } from '@/lib/geo'
import { ArrowLeft, MapPin, Check } from 'lucide-react'

// «Νέο υποκατάστημα» — για αλυσίδες (π.χ. Mr Car Wash με 7 καταστήματα). Φτιαγμένο για το κινητό του Γιώργου:
// διαλέγει το υπάρχον πλυντήριο, γράφει όνομα + διεύθυνση του νέου και τα στοιχεία του ΥΠΕΥΘΥΝΟΥ. Τέλος.
// Υπηρεσίες, τιμές, ωράριο, πρόσθετα, προμήθεια, ΑΦΜ αντιγράφονται από το υπάρχον (/api/admin/branch).
declare global {
  interface Window { google: any; initBranchAutocomplete: () => void } // eslint-disable-line @typescript-eslint/no-explicit-any
}
type Mgr = { name?: string; email?: string; phone?: string }
type Loc = { id: string; name: string; address: string; city: string; capacity: number; active: boolean; manager: Mgr | null; managerPending: boolean }
const input = 'w-full border border-gray-200 rounded-xl px-4 py-3 text-[16px] text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400'

function BranchForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [locs, setLocs] = useState<Loc[]>([])
  const [sourceId, setSourceId] = useState(params.get('from') || '')
  const [f, setF] = useState({ name: '', address: '', city: '', postal_code: '', lat: '', lng: '', phone: '', capacity: '', mName: '', mEmail: '', mPhone: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<{ name: string; manager: string; copied: { services: number; hours: number; addons: number }; active: boolean; warnings: string[] } | null>(null)
  const addrRef = useRef<HTMLInputElement>(null)
  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }))

  const load = () => fetch('/api/admin/branch').then(r => r.json()).then(j => setLocs(j.locations || [])).catch(() => {})
  useEffect(() => { load() }, [])
  const src = locs.find(l => l.id === sourceId)
  // Προτεινόμενο όνομα: «Mr Car Wash · » — συμπληρώνει μόνο την περιοχή.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (src && !f.name) setF(p => ({ ...p, name: src.name.split('·')[0].trim() + ' · ', capacity: p.capacity || String(src.capacity || 1) })) }, [src]) // eslint-disable-line react-hooks/exhaustive-deps, react-hooks/set-state-in-effect

  useEffect(() => {
    const init = () => {
      if (!addrRef.current || !window.google) return
      const ac = new window.google.maps.places.Autocomplete(addrRef.current, { componentRestrictions: { country: 'gr' }, fields: ['address_components', 'geometry', 'formatted_address'] })
      ac.addListener('place_changed', () => {
        const place = ac.getPlace()
        if (!place.geometry) return
        let route = '', num = '', pc = ''
        for (const c of place.address_components) {
          if (c.types.includes('route')) route = c.long_name
          if (c.types.includes('street_number')) num = c.long_name
          if (c.types.includes('postal_code')) pc = c.long_name
        }
        setF(p => ({
          ...p, address: [route, num].filter(Boolean).join(' ') || place.formatted_address, city: extractCityLabel(place.address_components), postal_code: pc,
          lat: String(place.geometry.location.lat()), lng: String(place.geometry.location.lng()),
        }))
      })
    }
    if (window.google) init()
    else {
      window.initBranchAutocomplete = init
      const s = document.createElement('script')
      s.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&callback=initBranchAutocomplete`
      s.async = true
      document.head.appendChild(s)
    }
  }, [])

  const save = async () => {
    setErr('')
    if (!sourceId) return setErr('Διάλεξε από ποιο πλυντήριο αντιγράφουμε')
    if (!f.name.trim() || f.name.trim().endsWith('·')) return setErr('Γράψε το όνομα του υποκαταστήματος (π.χ. «Mr Car Wash · Γλυφάδα»)')
    if (!f.lat || !f.lng) return setErr('Διάλεξε τη διεύθυνση από τη λίστα που εμφανίζεται')
    if (!f.mName.trim() || !f.mEmail.trim() || !f.mPhone.trim()) return setErr('Συμπλήρωσε όνομα, email και κινητό του υπευθύνου')
    setBusy(true)
    const r = await fetch('/api/admin/branch', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceId, name: f.name, address: f.address, city: f.city, postal_code: f.postal_code, lat: f.lat, lng: f.lng, phone: f.phone, capacity: f.capacity, manager: { name: f.mName, email: f.mEmail, phone: f.mPhone } }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) return setErr(j.error || 'Κάτι πήγε στραβά')
    setDone({ name: f.name, manager: j.manager, copied: j.copied, active: j.active, warnings: j.warnings || [] })
    load()
  }
  const again = () => { setDone(null); setF(p => ({ ...p, name: (src?.name.split('·')[0].trim() || '') + ' · ', address: '', city: '', postal_code: '', lat: '', lng: '', phone: '', mName: '', mEmail: '', mPhone: '' })); window.scrollTo(0, 0) }

  // Τα αδέρφια του (ίδια επωνυμία) — για να βλέπει τι έχει ήδη περάσει και ποιος είναι ο υπεύθυνος σε καθένα.
  const brand = (src?.name.split('·')[0].trim() || '').toLowerCase()
  const siblings = brand ? locs.filter(l => l.name.toLowerCase().startsWith(brand)) : []

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md pb-24">
        <div className="bg-white border-b border-gray-100 px-5 pb-4 pt-[calc(var(--safe-top)+16px)] flex items-center gap-3">
          <button onClick={() => router.push('/admin?tab=locations')} className="text-gray-400" aria-label="Πίσω"><ArrowLeft size={18} /></button>
          <h1 className="text-lg font-semibold text-gray-900">Νέο υποκατάστημα</h1>
        </div>

        {done ? (
          <div className="px-5 pt-8 flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center"><Check size={28} className="text-green-700" /></div>
            <p className="text-[17px] font-semibold text-gray-900">{done.name}</p>
            <p className="text-[13px] text-gray-500">Αντιγράφηκαν {done.copied.services} υπηρεσίες · {done.copied.hours} μέρες ωραρίου · {done.copied.addons} πρόσθετα</p>
            <p className={`text-[13px] font-semibold ${done.active ? 'text-green-700' : 'text-amber-700'}`}>{done.active ? 'Ενεργό — φαίνεται ήδη στους πελάτες' : 'ΑΝΕΝΕΡΓΟ — κάτι δεν αντιγράφηκε, θέλει έλεγχο'}</p>
            <p className="text-[13px] text-gray-700 bg-gray-50 rounded-xl px-4 py-3 leading-snug">
              {done.manager === 'assigned' ? 'Ο υπεύθυνος είχε ήδη λογαριασμό και δέθηκε με το πλυντήριο.'
                : done.manager === 'pending' ? 'Πες στον υπεύθυνο να ανοίξει washio.gr/dashboard και να συνδεθεί με το email που έδωσε. Θα δει αμέσως το πλυντήριό του.'
                : 'Δεν ορίστηκε υπεύθυνος.'}
            </p>
            {done.warnings.length > 0 && <p className="text-[12px] text-red-600">{done.warnings.join(' · ')}</p>}
            <button onClick={again} className="mt-2 w-full h-12 rounded-xl bg-gray-900 text-white text-[15px] font-semibold">+ Επόμενο υποκατάστημα</button>
            <button onClick={() => router.push('/admin?tab=locations')} className="text-[13px] text-gray-500 underline">Τέλος</button>
          </div>
        ) : (
          <div className="px-5 pt-5 flex flex-col gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Αντιγραφή από *</label>
              <select value={sourceId} onChange={e => { setSourceId(e.target.value); set('name', '') }} className={input + ' bg-white'}>
                <option value="">Διάλεξε πλυντήριο…</option>
                {locs.map(l => <option key={l.id} value={l.id}>{l.name}{l.city ? ` — ${l.city}` : ''}</option>)}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">Ίδιες υπηρεσίες, τιμές, ωράριο, πρόσθετα, προμήθεια και ΑΦΜ. Χωρίς νέο συμφωνητικό.</p>
            </div>

            <div className="rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
              <p className="text-xs font-medium tracking-widest text-gray-400 uppercase">Το νέο κατάστημα</p>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Όνομα *</label>
                <input value={f.name} onChange={e => set('name', e.target.value)} placeholder="Mr Car Wash · Γλυφάδα" className={input} />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Διεύθυνση * <span className="text-blue-400">(διάλεξε από τη λίστα)</span></label>
                <div className="relative">
                  <input ref={addrRef} value={f.address} onChange={e => setF(p => ({ ...p, address: e.target.value, lat: '', lng: '' }))} placeholder="Γράψε οδό και αριθμό…" className={input + ' pr-10'} />
                  <MapPin size={14} className="absolute right-3 top-4 text-gray-300" />
                </div>
                {f.lat && f.lng ? <p className="text-xs text-green-600 mt-1">✓ {f.city || 'Βρέθηκε'}</p> : f.address ? <p className="text-xs text-amber-600 mt-1">Πάτησε τη σωστή διεύθυνση στη λίστα</p> : null}
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 mb-1 block">Τηλέφωνο καταστήματος</label>
                  <input value={f.phone} onChange={e => set('phone', e.target.value)} inputMode="tel" placeholder="προαιρετικό" className={input} />
                </div>
                <div className="w-24">
                  <label className="text-xs text-gray-400 mb-1 block">Θέσεις</label>
                  <input value={f.capacity} onChange={e => set('capacity', e.target.value.replace(/\D/g, ''))} inputMode="numeric" className={input} />
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
              <p className="text-xs font-medium tracking-widest text-gray-400 uppercase">Υπεύθυνος καταστήματος</p>
              <input value={f.mName} onChange={e => set('mName', e.target.value)} placeholder="Όνομα *" autoComplete="off" className={input} />
              <input value={f.mEmail} onChange={e => set('mEmail', e.target.value)} placeholder="Email * (με αυτό θα συνδέεται)" inputMode="email" autoCapitalize="none" autoComplete="off" className={input} />
              <input value={f.mPhone} onChange={e => set('mPhone', e.target.value)} placeholder="Κινητό *" inputMode="tel" autoComplete="off" className={input} />
              <p className="text-[11px] text-gray-400 leading-snug">Παίρνει αυτός τις ειδοποιήσεις για κάθε κράτηση και βλέπει μόνο αυτό το κατάστημα. Ο ιδιοκτήτης συνεχίζει να τα βλέπει όλα.</p>
            </div>

            {err && <p className="text-[13px] text-red-600">{err}</p>}
            <button onClick={save} disabled={busy} className="w-full h-13 py-3.5 rounded-xl bg-gray-900 text-white text-[15px] font-semibold disabled:opacity-40">{busy ? 'Δημιουργία…' : 'Δημιουργία υποκαταστήματος'}</button>

            {siblings.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium tracking-widest text-gray-400 uppercase mb-2">Ήδη περασμένα ({siblings.length})</p>
                <div className="flex flex-col gap-1.5">
                  {siblings.map(l => (
                    <div key={l.id} className="rounded-xl border border-gray-100 px-3 py-2">
                      <p className="text-[13px] font-semibold text-gray-900">{l.name}{!l.active && <span className="ml-1 text-[11px] font-medium text-amber-700">· ανενεργό</span>}</p>
                      <p className="text-[11px] text-gray-500">{[l.address, l.city].filter(Boolean).join(', ')}</p>
                      <p className="text-[11px] text-gray-500">{l.manager?.name ? `Υπεύθυνος: ${l.manager.name} · ${l.manager.phone || ''} · ${l.manager.email || ''}${l.managerPending ? ' · δεν έχει συνδεθεί ακόμα' : ''}` : 'Χωρίς υπεύθυνο'}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

export default function BranchPage() {
  return <Suspense fallback={null}><BranchForm /></Suspense>
}
