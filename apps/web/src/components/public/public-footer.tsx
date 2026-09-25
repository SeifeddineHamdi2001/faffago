import type { ContactLinks as Links } from '@faffago/shared';
import type { Locale } from '@/lib/locale';
import type { PublicTexts } from '@/lib/public-texts';
import { ContactLinks } from './contact-links';
import { LanguageSwitch } from './language-switch';
import { Wordmark } from './public-header';

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
    <footer className="bg-navy text-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 md:grid-cols-3">
        <div className="space-y-2">
          <p className="text-2xl">
            <Wordmark />
          </p>
          <p className="text-white/80">{texts.footer.tagline}</p>
        </div>
        {links && (
          <div>
            <h2 className="mb-2 font-display font-bold">{texts.footer.contact}</h2>
            <ContactLinks links={links} texts={texts.contact} variant="list" />
          </div>
        )}
        <div className="space-y-2">
          <LanguageSwitch locale={locale} label={texts.nav.otherLanguage} />
          <p className="text-sm text-white/60" dir="ltr">
            © {new Date().getFullYear()} Faffa Go
          </p>
        </div>
      </div>
    </footer>
  );
}
