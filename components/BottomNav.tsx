'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, MapPin, User } from 'lucide-react'

const ITEMS = [
  { href: '/', label: 'Αρχική', Icon: Home },
  { href: '/map', label: 'Εύρεση', Icon: MapPin },
  { href: '/profile', label: 'Προφίλ', Icon: User },
]

export function BottomNav() {
  const pathname = usePathname()
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-30 border-t border-gray-100 bg-white/85 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex justify-around items-stretch px-3 pt-1.5 pb-1">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className="group flex flex-col items-center gap-1 flex-1 py-1.5 select-none"
            >
              <Icon
                size={22}
                strokeWidth={active ? 2.3 : 1.7}
                className={`transition-colors duration-200 ${active ? 'text-gray-900' : 'text-gray-400 group-active:text-gray-600'}`}
              />
              <span
                className={`text-[10.5px] tracking-tight transition-colors duration-200 ${active ? 'font-semibold text-gray-900' : 'font-medium text-gray-400'}`}
              >
                {label}
              </span>
              <span
                className={`h-1 w-1 rounded-full transition-all duration-200 ${active ? 'bg-gray-900 opacity-100' : 'opacity-0'}`}
              />
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
