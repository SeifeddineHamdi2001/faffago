'use client';

import Script from 'next/script';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

/** Meta issues numeric ids; anything else is never written into the page. */
export function isPixelId(id: string): boolean {
  return /^\d{1,20}$/.test(id);
}

/**
 * Meta Pixel (Landing 6, TO CONFIRM): loaded only when Paramètres holds an id,
 * so emptying the field in Paramètres switches it off everywhere.
 */
export function MetaPixel({ pixelId }: { pixelId: string }) {
  if (!isPixelId(pixelId)) return null;
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${pixelId}');fbq('track','PageView');`}
    </Script>
  );
}

export type PartnerChannel = 'whatsapp' | 'phone' | 'facebook' | 'instagram' | 'tiktok';

/**
 * A "Devenir partenaire" click (Landing 6): Meta's standard Contact event with
 * the channel. Does nothing while the pixel is off.
 */
export function trackPartnerContact(channel: PartnerChannel): void {
  window.fbq?.('track', 'Contact', { channel });
}
