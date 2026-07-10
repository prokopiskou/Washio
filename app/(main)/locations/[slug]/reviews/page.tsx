'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ChevronLeft, Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { lightTap } from '@/lib/haptics'
import { useT, useLocale, Locale } from '@/lib/i18n'

const T = {
  el: {
    loading: 'Φόρτωση...',
    reviews: 'Κριτικές',
    reviewsCount: (n: number) => `(${n} ${n === 1 ? 'κριτική' : 'κριτικές'})`,
    empty: 'Καμία κριτική ακόμα',
    emptySub: 'Γίνε ο πρώτος που θα αφήσει κριτική.',
    continue: 'Συνέχεια',
  },
  en: {
    loading: 'Loading...',
    reviews: 'Reviews',
    reviewsCount: (n: number) => `(${n} ${n === 1 ? 'review' : 'reviews'})`,
    empty: 'No reviews yet',
    emptySub: 'Be the first to leave a review.',
    continue: 'Continue',
  },
}

const MONTHS: Record<Locale, string[]> = {
  el: ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαϊ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
}

function formatDate(dateStr: string, locale: Locale) {
  const d = new Date(dateStr)
  return `${d.getDate()} ${MONTHS[locale][d.getMonth()]} ${d.getFullYear()}`
}

type Location = { id: string; name: string; slug: string }
type Review = { id: string; rating: number; comment: string | null; created_at: string }

function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={size}
          strokeWidth={1.6}
          className={i <= Math.round(rating) ? 'fill-gray-900 text-gray-900' : 'fill-none text-gray-300'}
        />
      ))}
    </div>
  )
}

export default function ReviewsPage() {
  const router = useRouter()
  const params = useParams()
  const slug = params.slug as string
  const t = useT(T)
  const { locale } = useLocale()

  const [loading, setLoading] = useState(true)
  const [location, setLocation] = useState<Location | null>(null)
  const [reviews, setReviews] = useState<Review[]>([])

  useEffect(() => {
    const loadData = async () => {
      const supabase = createClient()

      const { data: locationData } = await supabase
        .from('locations')
        .select('id, name, slug')
        .eq('slug', slug)
        .single()

      if (!locationData) {
        router.push('/')
        return
      }

      setLocation(locationData)

      const { data: reviewsData } = await supabase
        .from('reviews')
        .select('id, rating, comment, created_at')
        .eq('location_id', locationData.id)
        .order('created_at', { ascending: false })

      setReviews((reviewsData as Review[]) || [])
      setLoading(false)
    }

    loadData()
  }, [slug, router])

  const count = reviews.length
  const avg = count > 0 ? Math.round((reviews.reduce((sum, r) => sum + r.rating, 0) / count) * 10) / 10 : 0

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-xs text-gray-400">{t.loading}</p>
      </main>
    )
  }

  if (!location) return null

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center">
      <div className="w-full max-w-md md:max-w-2xl pb-28">
        <div className="px-5 pt-6 flex flex-col gap-4">

          {/* Header */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-gray-900 shrink-0"
              style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
            >
              <ChevronLeft size={20} />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold tracking-[1.6px] uppercase text-gray-400">{t.reviews}</p>
              <h1 className="text-[20px] font-semibold tracking-tight text-gray-900 truncate">{location.name}</h1>
            </div>
          </div>

          {/* Overall rating block */}
          {count > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 px-6 py-7 flex flex-col items-center gap-3" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <p className="text-[52px] font-semibold tracking-tight text-gray-900 leading-none">{avg.toFixed(1)}</p>
              <Stars rating={avg} size={22} />
              <p className="text-[13px] text-gray-500 font-medium">{t.reviewsCount(count)}</p>
            </div>
          )}

          {/* Individual reviews */}
          {count === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 px-6 py-12 flex flex-col items-center gap-2 text-center" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
              <Star size={28} className="text-gray-300" strokeWidth={1.6} />
              <p className="text-[15px] font-semibold text-gray-900">{t.empty}</p>
              <p className="text-[13px] text-gray-500">{t.emptySub}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {reviews.map(r => (
                <div key={r.id} className="bg-white rounded-2xl border border-gray-100 px-5 py-4 flex flex-col gap-2" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                  <div className="flex items-center justify-between">
                    <Stars rating={r.rating} size={15} />
                    <span className="text-[12px] text-gray-400">{formatDate(r.created_at, locale)}</span>
                  </div>
                  {r.comment && (
                    <p className="text-[14px] text-gray-900 leading-relaxed">{r.comment}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fixed bottom Continue button */}
        <div
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md px-5 pt-3.5 pb-8"
          style={{ background: 'linear-gradient(180deg, rgba(249,250,251,0) 0%, #F9FAFB 28%)' }}
        >
          <button
            onClick={() => { lightTap(); router.push('/locations/' + slug) }}
            className="w-full h-14 rounded-xl bg-gray-900 text-white text-[15px] font-semibold tracking-tight flex items-center justify-center"
          >
            {t.continue}
          </button>
        </div>
      </div>
    </main>
  )
}
