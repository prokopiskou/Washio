'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, MapPin, X, Upload } from 'lucide-react'
import { WashioLoader } from '@/components/WashioLoader'

declare global {
  interface Window {
    google: any
    initEditAutocomplete: () => void
  }
}

export default function EditLocationPage() {
  const router = useRouter()
  const params = useParams()
  const locationId = String(params.id)

  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<any>(null)

  const [form, setForm] = useState({
    name: '',
    address: '',
    city: '',
    postal_code: '',
    lat: '',
    lng: '',
    capacity: '1',
  })
  const [photos, setPhotos] = useState<string[]>([])

  const handleChange = (key: string, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }))

  // Φόρτωση δεδομένων πρατηρίου.
  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase.from('locations')
        .select('name, address, city, postal_code, lat, lng, capacity, photos')
        .eq('id', locationId).single()
      if (data) {
        setForm({
          name: data.name || '',
          address: data.address || '',
          city: data.city || '',
          postal_code: data.postal_code || '',
          lat: data.lat != null ? String(data.lat) : '',
          lng: data.lng != null ? String(data.lng) : '',
          capacity: data.capacity != null ? String(data.capacity) : '1',
        })
        setPhotos(Array.isArray(data.photos) ? data.photos : [])
      }
      setLoadingData(false)
    }
    load()
  }, [locationId])

  // Google Places autocomplete → συντεταγμένες από πραγματικό σημείο.
  useEffect(() => {
    const init = () => {
      if (!inputRef.current || !window.google) return
      autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'gr' },
        fields: ['address_components', 'geometry', 'formatted_address'],
      })
      autocompleteRef.current.addListener('place_changed', () => {
        const place = autocompleteRef.current.getPlace()
        if (!place.geometry) return
        const lat = place.geometry.location.lat().toString()
        const lng = place.geometry.location.lng().toString()
        let route = '', streetNumber = '', city = '', postal_code = ''
        for (const c of place.address_components) {
          const t = c.types
          if (t.includes('route')) route = c.long_name
          if (t.includes('street_number')) streetNumber = c.long_name
          if (t.includes('locality') || t.includes('administrative_area_level_3')) city = c.long_name
          if (t.includes('postal_code')) postal_code = c.long_name
        }
        // Ελληνική σειρά: «Δρόμος Αριθμός» (π.χ. Διγενή 7). Κρατάμε και τα δύο.
        const address = [route, streetNumber].filter(Boolean).join(' ')
        setForm(prev => ({
          ...prev,
          address: address || place.formatted_address,
          city: city || prev.city,
          postal_code: postal_code || prev.postal_code,
          lat, lng,
        }))
      })
    }
    if (window.google) init()
    else {
      window.initEditAutocomplete = init
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&callback=initEditAutocomplete`
      script.async = true
      document.head.appendChild(script)
    }
  }, [loadingData])

  const uploadPhotos = async (files: FileList) => {
    setUploading(true); setError('')
    const supabase = createClient()
    const added: string[] = []
    for (const file of Array.from(files)) {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `photos/${locationId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
      const { error: upErr } = await supabase.storage.from('location-docs').upload(path, file, { upsert: true })
      if (upErr) { setError('Αποτυχία ανεβάσματος: ' + upErr.message); continue }
      const { data: urlData } = supabase.storage.from('location-docs').getPublicUrl(path)
      if (urlData?.publicUrl) added.push(urlData.publicUrl)
    }
    if (added.length) setPhotos(prev => [...prev, ...added])
    setUploading(false)
  }

  const removePhoto = (url: string) => setPhotos(prev => prev.filter(p => p !== url))

  const handleSave = async () => {
    if (!form.name || !form.lat || !form.lng) {
      setError('Χρειάζονται τουλάχιστον όνομα + συντεταγμένες (τοποθεσία).')
      return
    }
    setLoading(true); setError('')
    const supabase = createClient()
    const { error: dbErr } = await supabase.from('locations').update({
      name: form.name,
      address: form.address,
      city: form.city,
      postal_code: form.postal_code || null,
      lat: parseFloat(form.lat),
      lng: parseFloat(form.lng),
      capacity: Math.max(1, parseInt(form.capacity) || 1),
      photos,
    }).eq('id', locationId)
    setLoading(false)
    if (dbErr) { setError(dbErr.message); return }
    setSaved(true)
    setTimeout(() => router.push('/admin'), 700)
  }

  if (loadingData) {
    return <main className="min-h-screen bg-white flex items-center justify-center"><WashioLoader /></main>
  }

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md pb-24">
        <div className="bg-white border-b border-gray-100 px-6 pb-5 pt-[calc(max(env(safe-area-inset-top),47px)+16px)] flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-400"><ArrowLeft size={18} /></button>
          <h1 className="text-lg font-semibold text-gray-900">Επεξεργασία πρατηρίου</h1>
        </div>

        <div className="px-6 pt-5 flex flex-col gap-4">
          {/* Όνομα */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Όνομα *</label>
            <input value={form.name} onChange={e => handleChange('name', e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-400" />
          </div>

          {/* Διεύθυνση με autocomplete */}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Τοποθεσία <span className="text-blue-400">(διάλεξε από τη λίστα για ακριβείς συντεταγμένες)</span></label>
            <div className="relative">
              <input ref={inputRef} value={form.address} onChange={e => handleChange('address', e.target.value)}
                placeholder="Πληκτρολόγησε τη φυσική διεύθυνση του πλυντηρίου..."
                className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-10 text-sm focus:outline-none focus:border-gray-400" />
              <MapPin size={14} className="absolute right-3 top-3.5 text-gray-300" />
            </div>
            {form.lat && form.lng ? (
              <p className="text-xs text-green-500 mt-1">✓ Συντεταγμένες: {parseFloat(form.lat).toFixed(5)}, {parseFloat(form.lng).toFixed(5)}</p>
            ) : (
              <p className="text-xs text-red-400 mt-1">⚠ Χωρίς συντεταγμένες — διάλεξε τοποθεσία από τη λίστα.</p>
            )}
          </div>

          {/* Πόλη / ΤΚ / μάνικες */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-400 mb-1 block">Πόλη</label>
              <input value={form.city} onChange={e => handleChange('city', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-400" />
            </div>
            <div className="w-24">
              <label className="text-xs text-gray-400 mb-1 block">ΤΚ</label>
              <input value={form.postal_code} onChange={e => handleChange('postal_code', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-400" />
            </div>
            <div className="w-20">
              <label className="text-xs text-gray-400 mb-1 block">Μάνικες</label>
              <input type="number" min={1} value={form.capacity} onChange={e => handleChange('capacity', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-gray-400" />
            </div>
          </div>

          {/* Συντεταγμένες manual fallback */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-gray-400 mb-1 block">Latitude</label>
              <input value={form.lat} onChange={e => handleChange('lat', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-400" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-400 mb-1 block">Longitude</label>
              <input value={form.lng} onChange={e => handleChange('lng', e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-gray-400" />
            </div>
          </div>

          {/* Φωτογραφίες */}
          <div>
            <label className="text-xs text-gray-400 mb-1.5 block">Φωτογραφίες</label>
            <div className="grid grid-cols-3 gap-2">
              {photos.map(url => (
                <div key={url} className="relative aspect-square rounded-xl overflow-hidden border border-gray-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => removePhoto(url)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center">
                    <X size={13} />
                  </button>
                </div>
              ))}
              <label className="aspect-square rounded-xl border border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 cursor-pointer text-[11px] font-medium gap-1">
                <Upload size={16} />
                {uploading ? '...' : 'Προσθήκη'}
                <input type="file" accept="image/*" multiple className="hidden"
                  onChange={e => { if (e.target.files?.length) uploadPhotos(e.target.files) }} />
              </label>
            </div>
            <p className="text-[11px] text-gray-300 mt-1.5">Η πρώτη φωτογραφία είναι το εξώφυλλο στον χάρτη/σελίδα.</p>
          </div>

          {error && <p className="text-xs text-red-500 text-center">{error}</p>}

          <button onClick={handleSave} disabled={loading || uploading}
            className="w-full bg-gray-900 text-white text-sm font-semibold py-3.5 rounded-xl disabled:opacity-40">
            {saved ? 'Αποθηκεύτηκε ✓' : loading ? 'Αποθήκευση...' : 'Αποθήκευση'}
          </button>
        </div>
      </div>
    </main>
  )
}
