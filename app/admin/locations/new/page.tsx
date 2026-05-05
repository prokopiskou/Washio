'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, MapPin } from 'lucide-react'

declare global {
  interface Window {
    google: any
    initAutocomplete: () => void
  }
}

export default function NewLocationPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const autocompleteRef = useRef<any>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({
    name: '',
    address: '',
    city: '',
    postal_code: '',
    lat: '',
    lng: '',
    phone: '',
    email: '',
  })

  const handleChange = (key: string, value: string) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    const initAutocomplete = () => {
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

        let address = ''
        let city = ''
        let postal_code = ''

        for (const component of place.address_components) {
          const types = component.types
          if (types.includes('route')) address = component.long_name
          if (types.includes('street_number')) address = `${address} ${component.long_name}`.trim()
          if (types.includes('locality') || types.includes('administrative_area_level_3')) city = component.long_name
          if (types.includes('postal_code')) postal_code = component.long_name
        }

        setForm(prev => ({
          ...prev,
          address: address || place.formatted_address,
          city,
          postal_code,
          lat,
          lng,
        }))
      })
    }

    if (window.google) {
      initAutocomplete()
    } else {
      window.initAutocomplete = initAutocomplete
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places&callback=initAutocomplete`
      script.async = true
      document.head.appendChild(script)
    }
  }, [])

  const handleSave = async () => {
    if (!form.name || !form.address || !form.city || !form.lat || !form.lng) {
      setError('Συμπλήρωσε όλα τα υποχρεωτικά πεδία')
      return
    }

    setLoading(true)
    setError('')

    const supabase = createClient()
    const slug = form.name.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/--+/g, '-')

    const { error: dbError } = await supabase.from('locations').insert({
      name: form.name,
      slug: `${slug}-${Date.now()}`,
      address: form.address,
      city: form.city,
      postal_code: form.postal_code,
      lat: parseFloat(form.lat),
      lng: parseFloat(form.lng),
      phone: form.phone,
      email: form.email,
      is_active: true,
      commission_rate: 10,
    })

    if (dbError) {
      setError(dbError.message)
      setLoading(false)
      return
    }

    router.push('/admin')
  }

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md pb-20">

        <div className="bg-white border-b border-gray-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-gray-400">
              <ArrowLeft size={18} />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">Νέο πρατήριο</h1>
          </div>
        </div>

        <div className="px-6 pt-5 flex flex-col gap-4">

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-xs font-medium tracking-widest text-gray-400 uppercase">Βασικά στοιχεία</p>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Όνομα *</label>
                <input
                  value={form.name}
                  onChange={e => handleChange('name', e.target.value)}
                  placeholder="π.χ. Avin Γλυφάδα"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                />
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Διεύθυνση * <span className="text-blue-400">(αυτόματες συντεταγμένες)</span></label>
                <div className="relative">
                  <input
                    ref={inputRef}
                    value={form.address}
                    onChange={e => handleChange('address', e.target.value)}
                    placeholder="Πληκτρολόγησε διεύθυνση..."
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-10 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                  />
                  <MapPin size={14} className="absolute right-3 top-3.5 text-gray-300" />
                </div>
                {form.lat && form.lng && (
                  <p className="text-xs text-green-500 mt-1">✓ Συντεταγμένες: {parseFloat(form.lat).toFixed(4)}, {parseFloat(form.lng).toFixed(4)}</p>
                )}
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 mb-1 block">Πόλη *</label>
                  <input
                    value={form.city}
                    onChange={e => handleChange('city', e.target.value)}
                    placeholder="Γλυφάδα"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-400 mb-1 block">ΤΚ</label>
                  <input
                    value={form.postal_code}
                    onChange={e => handleChange('postal_code', e.target.value)}
                    placeholder="16674"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Manual coordinates fallback */}
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-xs font-medium tracking-widest text-gray-400 uppercase">Συντεταγμένες</p>
            </div>
            <div className="p-4 flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-400 mb-1 block">Latitude</label>
                <input
                  value={form.lat}
                  onChange={e => handleChange('lat', e.target.value)}
                  placeholder="37.8678"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-400 mb-1 block">Longitude</label>
                <input
                  value={form.lng}
                  onChange={e => handleChange('lng', e.target.value)}
                  placeholder="23.7536"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                />
              </div>
            </div>
            <p className="text-xs text-gray-300 px-4 pb-3">Συμπληρώνονται αυτόματα από τη διεύθυνση ή χειροκίνητα.</p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-xs font-medium tracking-widest text-gray-400 uppercase">Επικοινωνία</p>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Τηλέφωνο</label>
                <input
                  value={form.phone}
                  onChange={e => handleChange('phone', e.target.value)}
                  placeholder="210 123 4567"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Email</label>
                <input
                  value={form.email}
                  onChange={e => handleChange('email', e.target.value)}
                  placeholder="info@avin-glyfada.gr"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-gray-400"
                />
              </div>
            </div>
          </div>

          {error && <p className="text-xs text-red-500 text-center">{error}</p>}

          <button
            onClick={handleSave}
            disabled={loading}
            className="w-full bg-gray-900 text-white text-sm font-medium py-3.5 rounded-xl disabled:opacity-40"
          >
            {loading ? 'Αποθήκευση...' : 'Αποθήκευση πρατηρίου'}
          </button>

        </div>
      </div>
    </main>
  )
}