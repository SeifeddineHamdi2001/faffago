import Link from 'next/link';
import type { Locale } from '@/lib/locale';
import type { PublicTexts } from '@/lib/public-texts';
import { LanguageSwitch } from './language-switch';

export function Wordmark({ className = '' }: { className?: string }) {
  // The brand name stays in Latin letters in both languages.
  return (
    <span dir="ltr" className={`font-display font-bold whitespace-nowrap ${className}`}>
      Faffa <span className="text-orange">Go</span>
    </span>
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
    <header className="sticky top-0 z-30 bg-navy text-white shadow">
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-3 py-2 sm:gap-2 sm:px-4">
        <Link href={home} className="me-auto inline-flex min-h-11 items-center text-xl sm:text-2xl">
          <Wordmark />
        </Link>
        <nav aria-label={texts.nav.menu} className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="inline-flex min-h-11 items-center rounded-lg px-3 text-white/90 hover:bg-white/10"
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/vendeur/connexion"
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-white/90 hover:bg-white/10"
          >
            {texts.nav.login}
          </Link>
        </nav>
        <LanguageSwitch locale={locale} label={texts.nav.otherLanguage} />
        <a
          href={`${home}#contact`}
          className="btn-primary px-3 text-sm whitespace-nowrap sm:px-4 sm:text-base"
        >
          {texts.nav.partner}
        </a>
        <details className="relative md:hidden">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-lg px-2 hover:bg-white/10">
            {texts.nav.menu}
          </summary>
          <ul className="absolute end-0 mt-2 w-56 rounded-xl bg-white p-2 text-navy shadow-lg">
            {links.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="flex min-h-11 items-center rounded-lg px-3 hover:bg-navy/5"
                >
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <Link
                href="/vendeur/connexion"
                className="flex min-h-11 items-center rounded-lg px-3 hover:bg-navy/5"
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
