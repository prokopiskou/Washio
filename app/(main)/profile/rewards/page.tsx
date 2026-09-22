'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Gift, Users, Copy, Share2, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n'
import { WashioLoader } from '@/components/WashioLoader'
import { MAX_REFERRALS, WELCOME_DISCOUNT, REFERRER_REWARD } from '@/lib/referral'

const T = {
  el: {
    title: 'Κουπόνια & Παραπομπές', back: 'Πίσω',
    tabCoupons: 'Κουπόνια', tabReferral: 'Κάλεσε φίλους',
    balance: 'Το υπόλοιπό σου', useAtCheckout: 'Εξαργυρώνεται αυτόματα στην επόμενη κράτησή σου με κάρτα.',
    history: 'Ιστορικό', empty: 'Δεν έχεις κουπόνια ακόμα.',
    welcome: 'Καλωσόρισμα', referral_reward: 'Επιβράβευση παραπομπής', redeem: 'Εξαργύρωση',
    referTitle: 'Φέρε φίλους, κερδίστε και οι δύο',
    referSub: (a: number, b: number, n: number) =>
      `Κάθε φίλος παίρνει −${a}€ στην πρώτη του κράτηση. Εσύ παίρνεις +${b}€ για την επόμενή σου — έως ${n} φορές.`,
    yourCode: 'Ο κωδικός σου', yourLink: 'Ο σύνδεσμός σου',
    copy: 'Αντιγραφή', copied: 'Αντιγράφηκε!', share: 'Κοινοποίηση',
    used: (x: number, n: number) => `${x} από ${n} παραπομπές ολοκληρώθηκαν`,
    shareMsg: (code: string) => `Κλείσε πλύσιμο αυτοκινήτου με το Washio και πάρε −${WELCOME_DISCOUNT}€ στην πρώτη σου κράτηση με τον κωδικό μου: ${code}`,
    loading: 'Φόρτωση...',
  },
  en: {
    title: 'Coupons & Referrals', back: 'Back',
    tabCoupons: 'Coupons', tabReferral: 'Invite friends',
    balance: 'Your balance', useAtCheckout: 'Applied automatically on your next card booking.',
    history: 'History', empty: 'No coupons yet.',
    welcome: 'Welcome', referral_reward: 'Referral reward', redeem: 'Redeemed',
    referTitle: 'Invite friends, both win',
    referSub: (a: number, b: number, n: number) =>
      `Each friend gets −€${a} on their first booking. You get +€${b} for your next — up to ${n} times.`,
    yourCode: 'Your code', yourLink: 'Your link',
    copy: 'Copy', copied: 'Copied!', share: 'Share',
    used: (x: number, n: number) => `${x} of ${n} referrals completed`,
    shareMsg: (code: string) => `Book a car wash with Washio and get −€${WELCOME_DISCOUNT} on your first booking with my code: ${code}`,
    loading: 'Loading...',
  },
}

type Ledger = { id: string; amount: number; kind: string; created_at: string }

export default function RewardsPage() {
  const router = useRouter()
  const t = useT(T)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'coupons' | 'referral'>('coupons')
  const [code, setCode] = useState('')
  const [credit, setCredit] = useState(0)
  const [ledger, setLedger] = useState<Ledger[]>([])
  const [completedRefs, setCompletedRefs] = useState(0)
  const [copied, setCopied] = useState('')

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) { router.push('/login'); return }

      const [{ data: prof }, { data: led }, { count }] = await Promise.all([
        supabase.from('profiles').select('referral_code, referral_credit').eq('id', user.id).maybeSingle(),
        supabase.from('credit_ledger').select('id, amount, kind, created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30),
        supabase.from('referrals').select('id', { count: 'exact', head: true }).eq('referrer_id', user.id).eq('status', 'completed'),
      ])
      setCode(prof?.referral_code || '')
      setCredit(Number(prof?.referral_credit) || 0)
      setLedger((led as Ledger[]) || [])
      setCompletedRefs(count || 0)
      setLoading(false)
    }
    load()
  }, [router])

  const link = code ? `https://washio.gr/?ref=${code}` : ''

  const doCopy = useCallback(async (text: string, which: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      setTimeout(() => setCopied(''), 1600)
    } catch { /* ignore */ }
  }, [])

  const doShare = useCallback(async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Washio', text: t.shareMsg(code), url: link })
      else await doCopy(link, 'share')
    } catch { /* cancelled */ }
  }, [code, link, t, doCopy])

  const kindLabel = (k: string) => k === 'welcome' ? t.welcome : k === 'referral_reward' ? t.referral_reward : t.redeem

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center">
      <div className="w-full max-w-md pb-12">
        <div className="bg-gray-50 pt-[calc(var(--safe-top)+14px)] pb-3 px-5">
          <div className="flex items-center gap-3.5 mb-4">
            <button onClick={() => router.push('/profile')} aria-label={t.back}
              className="w-10 h-10 rounded-full bg-white border border-gray-100 flex items-center justify-center text-gray-900">
              <ChevronLeft size={18} />
            </button>
            <h1 className="text-[20px] font-bold tracking-tight text-gray-900">{t.title}</h1>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setTab('coupons')}
              className={`flex-1 py-2.5 rounded-xl text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 ${tab === 'coupons' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>
              <Gift size={15} /> {t.tabCoupons}
            </button>
            <button onClick={() => setTab('referral')}
              className={`flex-1 py-2.5 rounded-xl text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 ${tab === 'referral' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 border border-gray-200'}`}>
              <Users size={15} /> {t.tabReferral}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="px-5 py-10"><WashioLoader /></div>
        ) : tab === 'coupons' ? (
          <div className="px-5 pt-3 flex flex-col gap-4">
            <div className="bg-gray-900 rounded-2xl p-5 text-white">
              <p className="text-[12px] text-white/60">{t.balance}</p>
              <p className="text-[34px] font-bold tracking-tight mt-0.5">€{credit.toFixed(2)}</p>
              <p className="text-[12px] text-white/60 mt-2 leading-snug">{t.useAtCheckout}</p>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">{t.history}</p>
              {ledger.length === 0 ? (
                <p className="text-[13px] text-gray-400 px-1">{t.empty}</p>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
                  {ledger.map(l => (
                    <div key={l.id} className="flex justify-between items-center px-4 py-3">
                      <div>
                        <p className="text-[13px] font-medium text-gray-900">{kindLabel(l.kind)}</p>
                        <p className="text-[11px] text-gray-400">{new Date(l.created_at).toLocaleDateString('el-GR', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      </div>
                      <span className={`text-[14px] font-semibold ${l.amount >= 0 ? 'text-green-600' : 'text-gray-500'}`}>
                        {l.amount >= 0 ? '+' : ''}€{Math.abs(l.amount).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="px-5 pt-3 flex flex-col gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
              <div className="w-12 h-12 rounded-2xl bg-gray-900 flex items-center justify-center mx-auto mb-3">
                <Gift size={22} className="text-white" />
              </div>
              <h2 className="text-[17px] font-bold tracking-tight text-gray-900">{t.referTitle}</h2>
              <p className="text-[13px] text-gray-500 mt-1.5 leading-snug">{t.referSub(WELCOME_DISCOUNT, REFERRER_REWARD, MAX_REFERRALS)}</p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{t.yourCode}</p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-[24px] font-bold tracking-[3px] text-gray-900 font-mono">{code}</span>
                <button onClick={() => doCopy(code, 'code')} className="text-gray-500 inline-flex items-center gap-1 text-[12px] font-medium">
                  {copied === 'code' ? <><Check size={14} className="text-green-600" /> {t.copied}</> : <><Copy size={14} /> {t.copy}</>}
                </button>
              </div>
            </div>

            <button onClick={doShare} className="w-full bg-gray-900 text-white rounded-2xl py-4 text-[15px] font-semibold inline-flex items-center justify-center gap-2">
              <Share2 size={18} /> {t.share}
            </button>
            <button onClick={() => doCopy(link, 'link')} className="w-full bg-white border border-gray-200 text-gray-700 rounded-2xl py-3 text-[13px] font-medium inline-flex items-center justify-center gap-2">
              {copied === 'link' ? <><Check size={15} className="text-green-600" /> {t.copied}</> : <><Copy size={15} /> {t.yourLink}</>}
            </button>

            <p className="text-[12px] text-gray-400 text-center">{t.used(completedRefs, MAX_REFERRALS)}</p>
          </div>
        )}
      </div>
    </main>
  )
}
