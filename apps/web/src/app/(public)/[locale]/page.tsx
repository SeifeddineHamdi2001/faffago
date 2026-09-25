import { notFound } from 'next/navigation';
import {
  Contact,
  Faq,
  Hero,
  HowItWorks,
  Prices,
  WhyFaffaGo,
  Zones,
} from '@/components/public/landing-sections';
import { isLocale } from '@/lib/locale';
import { publicTexts } from '@/lib/public-texts';
import { getSiteInfo } from '@/lib/server/public-site';

/** The landing page (Landing 2): one long page, in the order of the spec. */
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const texts = publicTexts(locale);
  const info = await getSiteInfo();

  return (
    <>
      <Hero locale={locale} texts={texts} />
      <HowItWorks texts={texts} />
      <WhyFaffaGo texts={texts} />
      <Prices locale={locale} texts={texts} info={info} />
      <Zones locale={locale} texts={texts} info={info} />
      <Faq texts={texts} info={info} />
      <Contact texts={texts} info={info} />
    </>
  );
}
