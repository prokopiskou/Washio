'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, MapPin, User } from 'lucide-react'
import { useT } from '@/lib/i18n'

const T = {
  el: { home: 'Αρχική', find: 'Εύρεση', profile: 'Προφίλ' },
  en: { home: 'Home', find: 'Find', profile: 'Profile' },
}

const ITEMS = [
  { href: '/', key: 'home' as const, Icon: Home },
  { href: '/map', key: 'find' as const, Icon: MapPin },
  { href: '/profile', key: 'profile' as const, Icon: User },
]

export function BottomNav() {
  const pathname = usePathname()
  const t = useT(T)
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-30 border-t border-gray-100 bg-white/85 backdrop-blur-xl pointer-events-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex justify-around items-center gap-1 px-3 h-[72px]">
        {ITEMS.map(({ href, key, Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className={`group pointer-events-auto flex flex-1 flex-col items-center gap-1.5 rounded-2xl py-2 select-none transition-colors duration-200 ${active ? 'bg-gray-900/[0.05]' : 'active:bg-gray-900/[0.03]'}`}
            >
              <Icon
                size={24}
                strokeWidth={active ? 2.2 : 1.8}
                className={`transition-colors duration-200 ${active ? 'text-gray-900' : 'text-gray-400 group-active:text-gray-600'}`}
              />
              <span
                className={`text-[11px] tracking-tight transition-colors duration-200 ${active ? 'font-semibold text-gray-900' : 'font-medium text-gray-400'}`}
              >
                {t[key]}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
