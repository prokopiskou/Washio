'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n'

const T = {
  el: {
    allFavorites: 'Όλα τα αγαπημένα',
    loading: 'Φόρτωση...',
    noFavorites: 'Δεν υπάρχουν αγαπημένα πρατήρια.',
    station: 'Πρατήριο',
  },
  en: {
    allFavorites: 'All favorites',
    loading: 'Loading...',
    noFavorites: 'No favorite stations yet.',
    station: 'Station',
  },
}

type FavoriteLocation = {
  id: string
  location_id: string
  locations?: {
    id?: string
    name?: string
    slug?: string
    city?: string
  } | null
}

export default function ProfileFavoritesPage() {
  const router = useRouter()
  const t = useT(T)
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
        .select('id, location_id, locations(id, name, slug, city)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      setFavorites((data as unknown as FavoriteLocation[]) || [])
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
          <p className="text-sm font-medium text-gray-900">{t.allFavorites}</p>
        </div>

        {loading ? (
          <div className="px-5 py-8">
            <p className="text-xs text-gray-400">{t.loading}</p>
          </div>
        ) : favorites.length === 0 ? (
          <div className="px-5 py-8">
            <p className="text-sm text-gray-500">{t.noFavorites}</p>
          </div>
        ) : (
          <div className="px-4 pt-4 flex flex-col gap-2">
            {favorites.map(fav => (
              <button
                key={fav.id}
                onClick={() => router.push(`/locations/${(fav.locations as any)?.slug || fav.location_id}`)}
                className="w-full bg-white border border-gray-100 rounded-xl p-4 text-left flex items-center gap-3"
              >
                <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-lg shrink-0">
                  ⛽
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{(fav.locations as any)?.name || t.station}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{(fav.locations as any)?.city || ''}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}