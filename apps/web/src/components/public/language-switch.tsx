'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Locale } from '@/lib/locale';

/**
 * FR / AR in one tap, to the same page in the other language (Landing 5). The
 * middleware remembers the language of the page opened — so the other
 * language is never prefetched, which would remember it without a tap.
 */
export function LanguageSwitch({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname() ?? `/${locale}`;
  const other: Locale = locale === 'fr' ? 'ar' : 'fr';
  const href = pathname.replace(/^\/(fr|ar)(?=\/|$)/, `/${other}`);
  return (
    <Link
      href={href}
      prefetch={false}
      hrefLang={other}
      lang={other}
      className="inline-flex min-h-11 items-center rounded-lg px-2 font-semibold text-white hover:bg-white/10 sm:px-3"
    >
      {label}
    </Link>
  );
}
