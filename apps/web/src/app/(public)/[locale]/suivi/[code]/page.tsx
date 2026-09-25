import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { TrackForm } from '@/components/public/track-form';
import { TrackingResult } from '@/components/public/tracking-result';
import { isLocale } from '@/lib/locale';
import { publicTexts } from '@/lib/public-texts';
import { forwardedHeaders } from '@/lib/server/api';
import { getTracking } from '@/lib/server/public-site';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  // One parcel's page is for its customer, not for search engines.
  return { title: publicTexts(locale).meta.trackingTitle, robots: { index: false, follow: false } };
}

/** Suivre mon colis, one parcel (Landing 4). */
export default async function TrackParcel({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code: rawCode } = await params;
  if (!isLocale(locale)) notFound();
  let code = rawCode;
  try {
    code = decodeURIComponent(rawCode);
  } catch {
    // A malformed escape in a hand-typed address: sent as it is, answered "Aucun colis trouvé".
  }
  const texts = publicTexts(locale);
  const result = await getTracking(code, locale, forwardedHeaders(await headers()));

  const message =
    result.kind === 'not-found'
      ? texts.tracking.notFound
      : result.kind === 'too-many'
        ? texts.tracking.tooMany
        : result.kind === 'unavailable'
          ? texts.tracking.unavailable
          : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      {result.kind === 'found' ? (
        <TrackingResult view={result.view} locale={locale} texts={texts.tracking} />
      ) : (
        <div role="alert" className="card border-s-4 border-s-orange-dark">
          <h1 className="font-display text-xl font-bold text-navy">{texts.tracking.title}</h1>
          <p className="mt-2 text-navy">{message}</p>
        </div>
      )}
      <TrackForm
        locale={locale}
        texts={{ ...texts.trackBox, title: texts.tracking.another }}
        defaultCode={result.kind === 'found' ? '' : code}
      />
    </div>
  );
}
