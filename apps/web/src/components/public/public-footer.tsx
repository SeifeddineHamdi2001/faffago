import type { ContactLinks as Links } from '@faffago/shared';
import type { Locale } from '@/lib/locale';
import type { PublicTexts } from '@/lib/public-texts';
import { ContactLinks } from './contact-links';
import { LanguageSwitch } from './language-switch';
import { Logo } from './public-header';

/**
 * Footer (Landing 2.8): logo, contact, social links, language switch. The
 * company's legal information is not in the specs; it is added once given
 * (PROGRESS, Open questions), never invented.
 */
export function PublicFooter({
  locale,
  texts,
  links,
}: {
  locale: Locale;
  texts: PublicTexts;
  links: Links | null;
}) {
  return (
    <footer className="border-t border-white/10 bg-navy-deep text-white/70">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 border-b border-white/10 pb-10 md:grid-cols-12">
          <div className="space-y-4 md:col-span-6">
            <Logo className="h-9" />
            <p className="max-w-sm text-sm leading-relaxed">{texts.footer.tagline}</p>
          </div>
          {links && (
            <div className="space-y-3 md:col-span-3">
              <h2 className="text-xs font-bold tracking-wider text-white uppercase">
                {texts.footer.contact}
              </h2>
              <ContactLinks links={links} texts={texts.contact} variant="list" />
            </div>
          )}
          <div className="space-y-3 md:col-span-3">
            <h2 className="text-xs font-bold tracking-wider text-white uppercase">
              {texts.footer.language}
            </h2>
            <LanguageSwitch locale={locale} label={texts.nav.otherLanguage} />
          </div>
        </div>
        <div className="flex flex-col items-center justify-between gap-4 pt-8 text-xs sm:flex-row">
          <p dir="ltr">© {new Date().getFullYear()} Faffa Go</p>
          <a
            href={`/${locale}#suivre`}
            className="inline-flex min-h-11 items-center transition-colors hover:text-orange"
          >
            {texts.nav.track}
          </a>
        </div>
      </div>
    </footer>
  );
}
