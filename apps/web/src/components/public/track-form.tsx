import { PARCEL_CODE_PREFIX } from '@faffago/shared';
import type { Locale } from '@/lib/locale';
import type { PublicTexts } from '@/lib/public-texts';

/**
 * Suivre mon colis (Landing 4.1): one field, one button. A plain form, so it
 * works on a phone with no JavaScript yet loaded; `/suivi?code=` sends it on
 * to the parcel's own address.
 */
export function TrackForm({
  locale,
  texts,
  defaultCode = '',
  headingLevel = 2,
}: {
  locale: Locale;
  texts: PublicTexts['trackBox'];
  defaultCode?: string;
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  return (
    <form action={`/${locale}/suivi`} method="get" className="card space-y-3" role="search">
      <Heading className="font-display text-xl font-bold text-navy">{texts.title}</Heading>
      <label htmlFor={`code-${locale}`} className="field-label">
        {texts.label}
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id={`code-${locale}`}
          name="code"
          required
          dir="ltr"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          defaultValue={defaultCode}
          placeholder={`${PARCEL_CODE_PREFIX}XXXXXXXX`}
          className="field min-h-14 flex-1 text-lg tracking-wider uppercase"
        />
        <button type="submit" className="btn-primary min-h-14 px-8 text-lg">
          {texts.submit}
        </button>
      </div>
      <p className="text-sm text-navy/70">{texts.hint}</p>
    </form>
  );
}
