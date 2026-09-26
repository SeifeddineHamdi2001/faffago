'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Locale } from '@/lib/locale';
import { Icon } from './icons';

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
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white/85 transition hover:bg-white/10 hover:text-white ${other === 'ar' ? 'font-arabic' : 'font-sans'}`}
    >
      <Icon name="globe" className="size-3.5 text-orange" />
      {label}
    </Link>
  );
}
