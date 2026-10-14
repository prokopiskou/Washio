'use client'

import Script from 'next/script'

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID
const GA_ID = process.env.NEXT_PUBLIC_GA4_ID

// Φορτώνει τα base scripts Meta Pixel + GA4. Ενεργοποιείται μόνο αν υπάρχουν τα env IDs.
// Εσωτερικές συσκευές (localStorage ws_internal=1, βλ. lib/internal.ts) → τίποτα δεν φορτώνεται.
export function AnalyticsScripts() {
  return (
    <>
      {PIXEL_ID && (
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
          fbq('set','autoConfig',false,'${PIXEL_ID}');fbq('init','${PIXEL_ID}');fbq('track','PageView');}`}
        </Script>
      )}
      {GA_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
            if(!window.__wsInternal){gtag('js',new Date());gtag('config','${GA_ID}');}`}
          </Script>
        </>
      )}
    </>
  )
}
