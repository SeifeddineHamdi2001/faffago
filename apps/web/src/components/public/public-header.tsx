import Image from 'next/image';
import Link from 'next/link';
import type { Locale } from '@/lib/locale';
import type { PublicTexts } from '@/lib/public-texts';
import { Icon } from './icons';
import { LanguageSwitch } from './language-switch';

/**
 * The logo: the chevron mark and "Faffa Go", white and orange, so it sits on
 * the navy header and footer only. The name stays in Latin letters in both
 * languages.
 */
export function Logo({ className = 'h-10' }: { className?: string }) {
  return (
    <Image
      src="/logo-faffago.png"
      alt="Faffa Go"
      width={440}
      height={108}
      className={`w-auto object-contain ${className}`}
    />
  );
}

/**
 * The sticky top bar (Landing 2.1): logo, Suivre un colis, Tarifs, FR / AR,
 * Se connecter, Devenir partenaire. On a phone: logo, language, Devenir
 * partenaire, and a menu for the rest, which opens without JavaScript.
 */
export function PublicHeader({ locale, texts }: { locale: Locale; texts: PublicTexts }) {
  const home = `/${locale}`;
  const links = [
    { href: `${home}#suivre`, label: texts.nav.track },
    { href: `${home}#tarifs`, label: texts.nav.prices },
    { href: `${home}#zones`, label: texts.nav.zones },
    { href: `${home}#faq`, label: texts.nav.faq },
  ];
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-navy/95 text-white backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-1.5 px-3 sm:h-20 sm:gap-3 sm:px-6 lg:px-8">
        <Link href={home} className="me-auto inline-flex min-h-11 shrink-0 items-center rounded-lg">
          <Logo className="h-6 sm:h-10" />
        </Link>
        <nav aria-label={texts.nav.menu} className="hidden items-center gap-1 lg:flex">
          {links.map((link, index) => (
            <a
              key={link.href}
              href={link.href}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-white/80 transition-colors hover:text-orange"
            >
              {index === 0 && <Icon name="search" className="size-3.5 text-orange" />}
              {link.label}
            </a>
          ))}
          <Link
            href="/vendeur/connexion"
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-white/80 transition-colors hover:text-white"
          >
            {texts.nav.login}
          </Link>
        </nav>
        <LanguageSwitch locale={locale} label={texts.nav.otherLanguage} />
        <a
          href={`${home}#contact`}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-orange px-2.5 text-xs font-bold whitespace-nowrap text-navy shadow-lg shadow-orange/25 transition hover:-translate-y-0.5 hover:brightness-105 sm:px-5 sm:text-sm"
        >
          {texts.nav.partner}
        </a>
        <details className="relative lg:hidden">
          <summary
            aria-label={texts.nav.menu}
            className="inline-flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white [&::-webkit-details-marker]:hidden"
          >
            <Icon name="menu" className="size-6" />
          </summary>
          <ul className="absolute inset-e-0 mt-2 w-60 rounded-2xl border border-navy/10 bg-white p-2 text-navy shadow-xl">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="flex min-h-11 items-center rounded-lg px-3 font-medium hover:bg-navy/5"
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <Link
                href="/vendeur/connexion"
                className="flex min-h-11 items-center rounded-lg px-3 font-medium hover:bg-navy/5"
              >
                {texts.nav.login}
              </Link>
            </li>
          </ul>
        </details>
      </div>
    </header>
  );
}
