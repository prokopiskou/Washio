'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'
import { CONSENT_EVENT, getConsent, isNativeClient, type Consent } from '@/lib/consent'

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID
const GA_ID = process.env.NEXT_PUBLIC_GA4_ID

// Meta Pixel + GA4 — ΜΟΝΟ μετά από συγκατάθεση (μπάνερ cookies).
//  • GA4: Consent Mode v2 — default «denied» (χωρίς cookies), «granted» μόνο με «Στατιστικά».
//  • Meta Pixel: φορτώνει ΜΟΝΟ με «Διαφήμιση» και ΠΟΤΕ μέσα στην εφαρμογή (Apple ATT).
// Εσωτερικές συσκευές (localStorage ws_internal=1) → τίποτα.
export function AnalyticsScripts() {
  const [c, setC] = useState<Consent | null>(null)
  const [native, setNative] = useState(false)

  useEffect(() => {
    setC(getConsent())
    setNative(isNativeClient())
    const on = (e: Event) => {
      const d = (e as CustomEvent<Consent>).detail
      setC(d)
      const gtag = (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag
      if (gtag) gtag('consent', 'update', {
        analytics_storage: d.analytics ? 'granted' : 'denied',
        ad_storage: d.marketing && !isNativeClient() ? 'granted' : 'denied',
        ad_user_data: d.marketing && !isNativeClient() ? 'granted' : 'denied',
        ad_personalization: d.marketing && !isNativeClient() ? 'granted' : 'denied',
      })
      // Ανάκληση διαφήμισης: σταμάτα το ήδη φορτωμένο Pixel.
      const fbq = (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq
      if (fbq) fbq('consent', d.marketing ? 'grant' : 'revoke')
    }
    window.addEventListener(CONSENT_EVENT, on)
    return () => window.removeEventListener(CONSENT_EVENT, on)
  }, [])

  const marketing = !!c?.marketing && !native

  return (
    <>
      {GA_ID && (
        <>
          <Script id="ga4-consent" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;
            try{if(localStorage.getItem('ws_internal')==='1')window.__wsInternal=1}catch(e){}
            var m=document.cookie.match(/(?:^|; )ws_consent=v1\\.a([01])\\.m([01])/);var n=!!(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform());
            var a=m&&m[1]==='1',k=m&&m[2]==='1'&&!n;
            gtag('consent','default',{analytics_storage:a?'granted':'denied',ad_storage:k?'granted':'denied',ad_user_data:k?'granted':'denied',ad_personalization:k?'granted':'denied',wait_for_update:500});
            if(!window.__wsInternal){gtag('js',new Date());gtag('config','${GA_ID}');}`}
          </Script>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
        </>
      )}
      {PIXEL_ID && marketing && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`try{if(localStorage.getItem('ws_internal')==='1')window.__wsInternal=1}catch(e){}
          if(!window.__wsInternal){!function(f,b,e,v,n,t,s)
          {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
          n.callMethod.apply(n,arguments):n.queue.push(arguments)};
          if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
          n.queue=[];t=b.createElement(e);t.async=!0;
          t.src=v;s=b.getElementsByTagName(e)[0];
          s.parentNode.insertBefore(t,s)}(window,document,'script',
          'https://connect.facebook.net/en_US/fbevents.js');
          fbq('consent','grant');fbq('set','autoConfig',false,'${PIXEL_ID}');fbq('init','${PIXEL_ID}');fbq('track','PageView');}`}
        </Script>
      )}
    </>
  )
}
