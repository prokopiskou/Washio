'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type FavoriteLocation = {
  id: string
  location_id: string
  locations?: {
    id?: string
    name?: string
    distance_km?: number
    rating?: number
  } | null
}

export default function ProfileFavoritesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [favorites, setFavorites] = useState<FavoriteLocation[]>([])

  useEffect(() => {
    const loadFavorites = async () => {
      const supabase = createClient()
      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData.session?.user

      if (!user) {
        router.push('/login')
        return
      }

      const { data } = await supabase
        .from('favorites')
        .select('id, location_id, locations(id, name, distance_km, rating)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      setFavorites((data as FavoriteLocation[]) || [])
      setLoading(false)
    }

    loadFavorites()
  }, [router])

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-md pb-8">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <button onClick={() => router.push('/profile')} className="text-gray-400">
            <ArrowLeft size={18} />
          </button>
          <p className="text-sm font-medium text-gray-900">Όλα τα αγαπημένα</p>
        </div>

        {loading ? (
          <div className="px-5 py-8">
            <p className="text-xs text-gray-400">Φόρτωση...</p>
          </div>
        ) : favorites.length === 0 ? (
          <div className="px-5 py-8">
            <p className="text-sm text-gray-500">Δεν υπάρχουν αγαπημένα πρατήρια.</p>
          </div>
        ) : (
          <div className="px-4 pt-4 flex flex-col gap-2">
            {favorites.map(fav => (
              <button
                key={fav.id}
                onClick={() => router.push(`/locations/${fav.locations?.id || fav.location_id}`)}
                className="w-full bg-white border border-gray-100 rounded-xl p-3 text-left"
              >
                <p className="text-sm text-gray-900">{fav.locations?.name || 'Πρατήριο'}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Star size={11} className="text-amber-400 fill-amber-400" />
                  <p className="text-xs text-gray-400">{fav.locations?.rating ?? '-'} · {(fav.locations?.distance_km ?? 0).toFixed(1)} km</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
