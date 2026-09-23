import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import '../../globals.css';
import { arabic, grotesk, manrope } from '../../fonts';

/**
 * The public site: /fr and /ar, right to left in Arabic (tech-stack 3,
 * landing 5). Built in phase 9; the layout exists from the first commit so
 * the right-to-left direction is never retrofitted.
 */
const LOCALES = ['fr', 'ar'] as const;
type Locale = (typeof LOCALES)[number];

export const metadata: Metadata = { title: 'Faffa Go' };

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function PublicLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!LOCALES.includes(locale as Locale)) notFound();
  const isArabic = locale === 'ar';

  return (
    <html
      lang={locale}
      dir={isArabic ? 'rtl' : 'ltr'}
      className={`${manrope.variable} ${grotesk.variable} ${arabic.variable}`}
    >
      <body className={isArabic ? 'font-arabic' : 'font-sans'}>{children}</body>
    </html>
  );
}
