import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import '../../globals.css';
import { arabic, grotesk, manrope } from '../../fonts';
import { MetaPixel } from '@/components/public/meta-pixel';
import { PublicFooter } from '@/components/public/public-footer';
import { PublicHeader } from '@/components/public/public-header';
import { isLocale } from '@/lib/locale';
import { publicTexts } from '@/lib/public-texts';
import { siteUrl } from '@/lib/site-url';
import { getSiteInfo } from '@/lib/server/public-site';

/**
 * The public site: /fr and /ar, right to left in Arabic (tech-stack 3,
 * landing 5). Rendered on each request, never at build: prices, zones and
 * contact links are read from the API (Landing 3), kept a few minutes by
 * `getSiteInfo`.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = publicTexts(locale);
  return {
    metadataBase: siteUrl(),
    title: t.meta.title,
    description: t.meta.description,
    // Each language has its own address, both announced to search engines (Landing 6).
    alternates: {
      canonical: `/${locale}`,
      languages: { fr: '/fr', ar: '/ar', 'x-default': '/fr' },
    },
    openGraph: {
      type: 'website',
      siteName: 'Faffa Go',
      url: `/${locale}`,
      title: t.meta.title,
      description: t.meta.description,
      locale: locale === 'ar' ? 'ar_TN' : 'fr_TN',
      alternateLocale: locale === 'ar' ? ['fr_TN'] : ['ar_TN'],
    },
    twitter: { card: 'summary_large_image', title: t.meta.title, description: t.meta.description },
  };
}

export default async function PublicLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const texts = publicTexts(locale);
  const info = await getSiteInfo();

  return (
    <html
      lang={locale}
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      className={`${manrope.variable} ${grotesk.variable} ${arabic.variable} scroll-smooth`}
    >
      <body
        className={`flex min-h-screen flex-col ${locale === 'ar' ? 'font-arabic' : 'font-sans'}`}
      >
        <PublicHeader locale={locale} texts={texts} />
        <main className="flex-1">{children}</main>
        <PublicFooter locale={locale} texts={texts} links={info?.contactLinks ?? null} />
        {info && <MetaPixel pixelId={info.metaPixelId} />}
      </body>
    </html>
  );
}
