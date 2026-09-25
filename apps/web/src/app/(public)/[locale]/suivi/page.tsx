import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { normalizeParcelCode } from '@faffago/shared';
import { TrackForm } from '@/components/public/track-form';
import { isLocale } from '@/lib/locale';
import { publicTexts } from '@/lib/public-texts';

export const metadata: Metadata = { robots: { index: false, follow: true } };

/**
 * Where the Suivre mon colis form lands: straight on to the parcel's own
 * address, the one sellers share and the label's QR code opens (D-36).
 */
export default async function TrackSearch({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ code?: string | string[] }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const { code } = await searchParams;
  const typed = (Array.isArray(code) ? code[0] : code)?.trim();
  if (typed) redirect(`/${locale}/suivi/${encodeURIComponent(normalizeParcelCode(typed))}`);

  const texts = publicTexts(locale);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <TrackForm locale={locale} texts={texts.trackBox} headingLevel={1} />
    </div>
  );
}
