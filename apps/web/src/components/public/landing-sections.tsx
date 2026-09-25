import Link from 'next/link';
import {
  DEFAULT_SETTINGS,
  Langue,
  delegationNameFor,
  formatDT,
  formatRatePercent,
  millimesFromJson,
  type NamedPlace,
  type PublicSiteInfo,
} from '@faffago/shared';
import type { Locale } from '@/lib/locale';
import type { PublicTexts } from '@/lib/public-texts';
import { ContactLinks } from './contact-links';
import { HeroVisual } from './hero-visual';
import { TrackForm } from './track-form';

const dt = (millimes: string) => formatDT(millimesFromJson(millimes));

function nameIn(place: NamedPlace, locale: Locale): string {
  return delegationNameFor(place, locale === 'ar' ? Langue.AR : Langue.FR);
}

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mb-6 font-display text-3xl font-bold text-navy">
      {children}
    </h2>
  );
}

/** Hero and, straight under it, Suivre mon colis (Landing 2.2). */
export function Hero({ locale, texts }: { locale: Locale; texts: PublicTexts }) {
  return (
    <>
      <section className="bg-navy text-white" aria-labelledby="accroche">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 md:grid-cols-2 md:py-20">
          <div className="space-y-5">
            <h1 id="accroche" className="font-display text-3xl leading-tight font-bold md:text-5xl">
              {texts.hero.title}
            </h1>
            <p className="text-lg text-white/85">{texts.hero.lead}</p>
            <div className="flex flex-wrap gap-3">
              <a href={`/${locale}#contact`} className="btn-primary min-h-14 px-6 text-lg">
                {texts.nav.partner}
              </a>
              <Link
                href="/vendeur/connexion"
                className="inline-flex min-h-14 items-center rounded-lg border border-white/40 px-6 text-lg font-semibold text-white hover:bg-white/10"
              >
                {texts.nav.login}
              </Link>
            </div>
          </div>
          <div className="flex justify-center">
            <HeroVisual label={texts.hero.visual} />
          </div>
        </div>
      </section>
      <section
        id="suivre"
        className="mx-auto -mt-6 max-w-3xl scroll-mt-20 px-4"
        aria-label={texts.trackBox.title}
      >
        <TrackForm locale={locale} texts={texts.trackBox} />
      </section>
    </>
  );
}

/** Comment ça marche (Landing 2.3): four steps on the brand chevron line. */
export function HowItWorks({ texts }: { texts: PublicTexts }) {
  return (
    <section
      id="comment"
      className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14"
      aria-labelledby="comment-titre"
    >
      <SectionTitle id="comment-titre">{texts.how.title}</SectionTitle>
      <ol className="grid gap-2 md:grid-cols-4">
        {texts.how.steps.map((step, index) => (
          <li key={step.title} className="chevron bg-navy px-8 py-5 text-white">
            <p className="font-display text-sm font-bold text-orange">
              <span dir="ltr">{index + 1}</span> ·
            </p>
            <h3 className="font-display text-lg font-bold">{step.title}</h3>
            <p className="mt-1 text-sm text-white/85">{step.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Pourquoi Faffa Go (Landing 2.4). */
export function WhyFaffaGo({ texts }: { texts: PublicTexts }) {
  return (
    <section id="pourquoi" className="bg-white py-14" aria-labelledby="pourquoi-titre">
      <div className="mx-auto max-w-6xl px-4">
        <SectionTitle id="pourquoi-titre">{texts.why.title}</SectionTitle>
        <ul className="grid gap-4 md:grid-cols-3">
          {texts.why.items.map((item) => (
            <li key={item.title} className="card border-t-4 border-t-orange">
              <h3 className="font-display text-lg font-bold text-navy">{item.title}</h3>
              <p className="mt-2 text-navy/80">{item.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Tarifs (Landing 3): every amount from Paramètres, none typed by hand. */
export function Prices({
  locale,
  texts,
  info,
}: {
  locale: Locale;
  texts: PublicTexts;
  info: PublicSiteInfo | null;
}) {
  const p = texts.prices;
  return (
    <section
      id="tarifs"
      className="mx-auto max-w-3xl scroll-mt-20 px-4 py-14"
      aria-labelledby="tarifs-titre"
    >
      <SectionTitle id="tarifs-titre">{p.title}</SectionTitle>
      {info ? (
        <div className="card">
          <p className="mb-4 text-navy/80">{p.lead}</p>
          <table className="w-full text-start">
            <thead>
              <tr className="border-b border-navy/10 text-sm text-navy/70">
                <th scope="col" className="py-2 text-start font-semibold">
                  {p.service}
                </th>
                <th scope="col" className="py-2 text-end font-semibold">
                  {p.price}
                </th>
              </tr>
            </thead>
            <tbody className="text-navy">
              {[
                [p.delivery, dt(info.fees.deliveryFeeMillimes)],
                [p.return, dt(info.fees.returnFeeMillimes)],
                [p.relaunch, p.free],
                [p.changeClient, dt(info.fees.changeClientFeeMillimes)],
                [
                  p.pickup,
                  p.pickupPrice(info.fees.pickupFreeThreshold, dt(info.fees.pickupFeeMillimes)),
                ],
              ].map(([service, price]) => (
                <tr key={service} className="border-b border-navy/10 last:border-0">
                  <th scope="row" className="py-3 text-start font-semibold">
                    {service}
                  </th>
                  <td className="py-3 text-end font-display font-bold">{price}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-sm text-navy/80">
            {p.retenueNote(formatRatePercent(info.fees.retenueRateBps))}{' '}
            <a href={`/${locale}#faq`} className="font-semibold text-orange-dark underline">
              {p.faqLink}
            </a>
          </p>
        </div>
      ) : (
        <p role="status" className="card text-navy">
          {p.unavailable}
        </p>
      )}
    </section>
  );
}

/** Zones couvertes (Landing 2.6): the délégations served, by gouvernorat. */
export function Zones({
  locale,
  texts,
  info,
}: {
  locale: Locale;
  texts: PublicTexts;
  info: PublicSiteInfo | null;
}) {
  const collator = new Intl.Collator(locale === 'ar' ? 'ar' : 'fr');
  return (
    <section id="zones" className="bg-white py-14 scroll-mt-20" aria-labelledby="zones-titre">
      <div className="mx-auto max-w-6xl px-4">
        <SectionTitle id="zones-titre">{texts.zones.title}</SectionTitle>
        {info && info.zones.length > 0 ? (
          <>
            <p className="mb-6 text-navy/80">{texts.zones.lead}</p>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {info.zones.map((zone) => (
                <div key={zone.gouvernorat.code}>
                  <h3 className="mb-2 font-display text-lg font-bold text-navy">
                    {nameIn(zone.gouvernorat, locale)}
                  </h3>
                  <ul className="space-y-1 text-navy/85">
                    {[...zone.delegations]
                      .sort((a, b) => collator.compare(nameIn(a, locale), nameIn(b, locale)))
                      .map((delegation) => (
                        <li key={delegation.code}>{nameIn(delegation, locale)}</li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p role="status" className="text-navy">
            {texts.zones.unavailable}
          </p>
        )}
      </div>
    </section>
  );
}

/** FAQ (Landing 2.7). The rules it quotes come from Paramètres too. */
export function Faq({ texts, info }: { texts: PublicTexts; info: PublicSiteInfo | null }) {
  // Only if the API has never answered since this server started
  // (getSiteInfo keeps the last good copy): the platform's documented defaults.
  const items = texts.faq.items({
    retenueRate: formatRatePercent(info?.fees.retenueRateBps ?? DEFAULT_SETTINGS.retenueRateBps),
    verifyHours: info?.rules.verifyDeadlineHours ?? DEFAULT_SETTINGS.verifyDeadlineHours,
    maxAttempts: info?.rules.maxDeliveryAttempts ?? DEFAULT_SETTINGS.maxDeliveryAttempts,
  });
  return (
    <section
      id="faq"
      className="mx-auto max-w-3xl scroll-mt-20 px-4 py-14"
      aria-labelledby="faq-titre"
    >
      <SectionTitle id="faq-titre">{texts.faq.title}</SectionTitle>
      <div className="space-y-3">
        {items.map((item) => (
          <details key={item.q} className="card group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-display text-lg font-bold text-navy">
              {item.q}
              <span aria-hidden className="text-orange-dark transition group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 text-navy/85">
              {item.a}{' '}
              {item.link && (
                <a href={item.link.href} className="font-semibold text-orange-dark underline">
                  {item.link.label}
                </a>
              )}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}

/** Devenir partenaire (Landing 2.8): direct contact, no form (Landing rule 1). */
export function Contact({ texts, info }: { texts: PublicTexts; info: PublicSiteInfo | null }) {
  return (
    <section id="contact" className="bg-navy py-14 scroll-mt-20" aria-labelledby="contact-titre">
      <div className="mx-auto max-w-3xl space-y-4 px-4 text-white">
        <h2 id="contact-titre" className="font-display text-3xl font-bold">
          {texts.contact.title}
        </h2>
        <p className="text-lg">{texts.contact.lead}</p>
        {info && <ContactLinks links={info.contactLinks} texts={texts.contact} />}
      </div>
    </section>
  );
}
