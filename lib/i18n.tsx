'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export type Locale = 'el' | 'en'

const STORAGE_KEY = 'washio_lang'

type Ctx = { locale: Locale; setLocale: (l: Locale) => void }

const LanguageContext = createContext<Ctx>({ locale: 'el', setLocale: () => {} })

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Default 'el' σε server + πρώτο client render (αποφυγή hydration mismatch),
  // μετά διαβάζουμε την αποθηκευμένη επιλογή.
  const [locale, setLocaleState] = useState<Locale>('el')

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Locale | null
      if (saved === 'en' || saved === 'el') setLocaleState(saved)
    } catch {}
  }, [])

  const setLocale = (l: Locale) => {
    setLocaleState(l)
    try { localStorage.setItem(STORAGE_KEY, l) } catch {}
    try { document.documentElement.lang = l } catch {}
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLocale(): Ctx {
  return useContext(LanguageContext)
}

// Βοηθητικό: επιστρέφει το λεξικό της τρέχουσας γλώσσας.
// Χρήση σε κάθε αρχείο:
//   const T = { el: { title: 'Κράτηση' }, en: { title: 'Booking' } }
//   const t = useT(T)
//   ... {t.title}
export function useT<D>(dict: Record<Locale, D>): D {
  const { locale } = useLocale()
  return dict[locale]
}
