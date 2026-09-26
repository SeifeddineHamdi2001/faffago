import { PARCEL_CODE_PREFIX } from '@faffago/shared';
import type { Locale } from '@/lib/locale';
import type { PublicTexts } from '@/lib/public-texts';
import { Icon } from './icons';

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
    <form
      action={`/${locale}/suivi`}
      method="get"
      role="search"
      className="space-y-2 rounded-2xl border border-navy/5 bg-white p-6 shadow-xl shadow-navy/10 sm:p-8"
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-orange/10 text-orange-dark">
          <Icon name="box" className="size-4" />
        </span>
        <Heading className="text-lg font-bold text-navy">{texts.title}</Heading>
      </div>
      <label htmlFor={`code-${locale}`} className="block text-xs font-semibold text-navy/70">
        {texts.label}
      </label>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-navy/40">
            <Icon name="barcode" className="size-4" />
          </span>
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
            className="min-h-14 w-full rounded-xl border border-navy/15 bg-slate-50 pr-4 pl-10 font-mono text-base tracking-wider text-navy uppercase placeholder:text-navy/40 focus:border-orange focus:ring-2 focus:ring-orange focus:outline-none"
          />
        </div>
        <button
          type="submit"
          className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-orange px-8 text-base font-bold text-navy shadow-md shadow-orange/20 transition hover:brightness-105 active:scale-95"
        >
          {texts.submit}
          <Icon name="chevron" className="size-4 rtl:-scale-x-100" />
        </button>
      </div>
      <p className="flex items-center gap-1.5 pt-1 text-xs text-navy/60">
        <Icon name="help" className="size-3.5" />
        {texts.hint}
      </p>
    </form>
  );
}
