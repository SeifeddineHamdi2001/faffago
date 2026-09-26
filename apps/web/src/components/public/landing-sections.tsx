import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
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
import { Icon, type IconName } from './icons';
import { TrackForm } from './track-form';

const dt = (millimes: string) => formatDT(millimesFromJson(millimes));

function nameIn(place: NamedPlace, locale: Locale): string {
  return delegationNameFor(place, locale === 'ar' ? Langue.AR : Langue.FR);
}

/** A small label over a section title, orange-dark on white (AA). */
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-orange/10 px-3 py-1 text-xs font-extrabold tracking-wider text-orange-dark uppercase">
      {children}
    </span>
  );
}

function SectionHeader({
  id,
  eyebrow,
  title,
  lead,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  lead?: string;
}) {
  return (
    <div className="mx-auto mb-14 max-w-2xl text-center">
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 id={id} className="mt-3 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">
        {title}
      </h2>
      {lead && <p className="mt-3 text-base text-navy/60">{lead}</p>}
    </div>
  );
}

/** The headline with its highlighted words in the brand gradient. */
function HeroTitle({ title, highlight }: { title: string; highlight: string }) {
  const at = title.indexOf(highlight);
  if (at < 0) return <>{title}</>;
  return (
    <>
      {title.slice(0, at)}
      <span className="bg-linear-to-r from-orange via-orange-300 to-amber-300 bg-clip-text text-transparent">
        {highlight}
      </span>
      {title.slice(at + highlight.length)}
    </>
  );
}

/** Hero and, straight under it, Suivre mon colis (Landing 2.2). */
export function Hero({
  locale,
  texts,
  info,
}: {
  locale: Locale;
  texts: PublicTexts;
  info: PublicSiteInfo | null;
}) {
  const h = texts.hero;
  const delegations = info?.zones.reduce((sum, zone) => sum + zone.delegations.length, 0) ?? 0;
  // Only figures the platform itself holds (Landing 1: promise only what operations deliver).
  const stats = info
    ? [
        { value: dt(info.fees.deliveryFeeMillimes), label: h.stats.delivery, ltr: true },
        { value: texts.prices.free, label: h.stats.relaunch, ltr: false },
        ...(delegations > 0
          ? [{ value: String(delegations), label: h.stats.zones, ltr: true }]
          : []),
      ]
    : [];
  return (
    <>
      <section
        className="relative overflow-hidden bg-navy pt-12 pb-24 lg:pt-20 lg:pb-36"
        aria-labelledby="accroche"
      >
        <div aria-hidden className="hero-dots pointer-events-none absolute inset-0 opacity-40" />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 inset-e-10 size-96 rounded-full bg-orange/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-s-10 bottom-10 size-80 rounded-full bg-blue-600/10 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:gap-8 lg:px-8">
          <div className="space-y-7 text-center lg:col-span-7 lg:text-start">
            <p className="inline-flex items-center gap-2 rounded-full border border-orange/30 bg-orange/10 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-orange sm:text-sm">
              <span aria-hidden className="size-2 animate-pulse rounded-full bg-orange" />
              {h.badge}
            </p>
            <h1
              id="accroche"
              className="text-3xl leading-[1.15] font-extrabold tracking-tight text-white sm:text-4xl md:text-5xl lg:text-[3.25rem]"
            >
              <HeroTitle title={h.title} highlight={h.highlight} />
            </h1>
            <p className="mx-auto max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg lg:mx-0">
              {h.lead}
            </p>
            <div className="flex flex-col items-center justify-center gap-4 pt-2 sm:flex-row lg:justify-start">
              <a
                href={`/${locale}#contact`}
                className="inline-flex min-h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-orange px-8 text-base font-bold text-navy shadow-xl shadow-orange/30 transition hover:-translate-y-0.5 hover:brightness-105 sm:w-auto"
              >
                {texts.nav.partner}
                <Icon name="arrow" className="size-4 rtl:-scale-x-100" />
              </a>
              <Link
                href="/vendeur/connexion"
                className="inline-flex min-h-14 w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-7 text-base font-semibold text-white/90 transition hover:border-white/25 hover:bg-white/10 sm:w-auto"
              >
                {texts.nav.login}
              </Link>
            </div>
            {stats.length > 0 && (
              <dl className="mx-auto grid max-w-lg grid-cols-3 gap-3 border-t border-white/10 pt-6 lg:mx-0">
                {stats.map((stat, index) => (
                  <div
                    key={stat.label}
                    className={`flex flex-col-reverse items-center lg:items-start ${index > 0 ? 'border-s border-white/10 ps-4' : ''}`}
                  >
                    <dt className="text-xs font-medium text-white/60">{stat.label}</dt>
                    <dd
                      dir={stat.ltr ? 'ltr' : undefined}
                      className="text-lg font-extrabold text-orange lg:text-2xl"
                    >
                      {stat.value}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="relative flex justify-center lg:col-span-5">
            <div className="relative w-full max-w-lg">
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-linear-to-b from-white/10 to-navy-deep p-2 shadow-2xl shadow-black/60">
                <Image
                  src="/hero-coursier.jpg"
                  alt={h.visual}
                  width={512}
                  height={306}
                  preload
                  unoptimized
                  className="h-auto w-full rounded-2xl object-cover transition-transform duration-500 hover:scale-[1.02]"
                />
              </div>
              <div className="float-slow absolute -inset-e-3 -top-4 flex items-center gap-2.5 rounded-xl border border-orange/40 bg-navy/90 px-3.5 py-2 shadow-xl shadow-orange/10 backdrop-blur-md sm:-inset-e-6">
                <span className="flex size-7 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                  <Icon name="check" className="size-4" />
                </span>
                <span>
                  <span className="block text-[11px] leading-none font-medium text-white/60">
                    {h.statusBadge.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-tight font-bold text-white">
                    {h.statusBadge.value}
                  </span>
                </span>
              </div>
              <div className="absolute -inset-s-3 -bottom-5 flex items-center gap-3 rounded-xl border border-white/15 bg-navy/90 px-4 py-2.5 shadow-xl backdrop-blur-md sm:-inset-s-6">
                <span className="flex size-8 items-center justify-center rounded-full bg-orange/20 text-orange">
                  <Icon name="banknote" className="size-4" />
                </span>
                <span>
                  <span className="block text-[11px] leading-none font-medium text-white/60">
                    {h.bonBadge.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-tight font-bold text-white">
                    {h.bonBadge.value}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section
        id="suivre"
        className="relative z-20 mx-auto -mt-12 max-w-3xl scroll-mt-24 px-4 sm:-mt-16 sm:px-6"
        aria-label={texts.trackBox.title}
      >
        <TrackForm locale={locale} texts={texts.trackBox} />
      </section>
    </>
  );
}

const STEP_ICONS: IconName[] = ['file', 'scooter', 'map', 'wallet'];

/** Comment ça marche (Landing 2.3): four steps, joined by the brand chevron. */
export function HowItWorks({ texts }: { texts: PublicTexts }) {
  const last = texts.how.steps.length - 1;
  return (
    <section id="comment" className="scroll-mt-24 py-20 lg:py-28" aria-labelledby="comment-titre">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          id="comment-titre"
          eyebrow={texts.how.eyebrow}
          title={texts.how.title}
          lead={texts.how.lead}
        />
        <ol className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {texts.how.steps.map((step, index) => {
            const final = index === last;
            return (
              <li
                key={step.title}
                className={`group relative flex flex-col justify-between rounded-2xl bg-white p-6 shadow-sm transition-shadow hover:shadow-md sm:p-7 ${
                  final
                    ? 'border-2 border-orange/25 bg-linear-to-b from-white to-orange/5'
                    : 'border border-navy/10'
                }`}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span
                      dir="ltr"
                      className={`flex size-8 items-center justify-center rounded-lg text-xs font-black ${
                        final ? 'bg-orange text-navy' : 'bg-navy text-white'
                      }`}
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span
                      className={`flex size-10 items-center justify-center rounded-full transition-transform group-hover:scale-110 ${
                        final ? 'bg-emerald-100 text-emerald-700' : 'bg-orange/10 text-orange-dark'
                      }`}
                    >
                      <Icon name={STEP_ICONS[index] ?? 'box'} />
                    </span>
                  </div>
                  <h3 className="pt-1 text-lg font-bold text-navy">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-navy/70">{step.text}</p>
                </div>
                <p
                  className={`mt-6 flex items-center gap-1.5 border-t border-navy/5 pt-3 text-xs font-semibold ${
                    final ? 'text-emerald-700' : 'text-orange-dark'
                  }`}
                >
                  {final && <Icon name="circleCheck" className="size-4" />}
                  {step.tag}
                </p>
                {!final && (
                  <span
                    aria-hidden
                    className="absolute top-1/2 -inset-e-5 z-10 hidden size-6 -translate-y-1/2 items-center justify-center text-orange lg:flex"
                  >
                    <Icon name="chevron" className="size-5 rtl:-scale-x-100" />
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

const WHY_STYLE: Array<{ icon: IconName; tone: string }> = [
  { icon: 'shield', tone: 'bg-orange text-navy shadow-md shadow-orange/20' },
  { icon: 'receipt', tone: 'bg-emerald-50 text-emerald-700' },
  { icon: 'scale', tone: 'bg-blue-50 text-blue-700' },
  { icon: 'chart', tone: 'bg-purple-50 text-purple-700' },
  { icon: 'map', tone: 'bg-amber-50 text-amber-700' },
];

/** Pourquoi Faffa Go (Landing 2.4): the first advantage, the differentiator, leads. */
export function WhyFaffaGo({ texts }: { texts: PublicTexts }) {
  return (
    <section
      id="pourquoi"
      className="border-y border-navy/5 bg-slate-100/70 py-20"
      aria-labelledby="pourquoi-titre"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader id="pourquoi-titre" title={texts.why.title} lead={texts.why.lead} />
        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {texts.why.items.map((item, index) => {
            const style = WHY_STYLE[index] ?? WHY_STYLE[1]!;
            if (index === 0) {
              return (
                <li
                  key={item.title}
                  className="group relative overflow-hidden rounded-2xl border-2 border-orange/30 bg-white p-8 shadow-sm lg:col-span-2"
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -inset-e-6 -bottom-6 size-32 rounded-full bg-orange/5 transition-transform duration-500 group-hover:scale-150"
                  />
                  <div className="relative flex items-start gap-4">
                    <span
                      className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${style.tone}`}
                    >
                      <Icon name={style.icon} className="size-6" />
                    </span>
                    <div className="space-y-2">
                      <h3 className="text-xl font-bold text-navy">{item.title}</h3>
                      <p className="text-sm leading-relaxed text-navy/70 sm:text-base">
                        {item.text}
                      </p>
                    </div>
                  </div>
                </li>
              );
            }
            return (
              <li
                key={item.title}
                className="group rounded-2xl border border-navy/10 bg-white p-7 shadow-sm transition-colors hover:border-navy/20"
              >
                <span
                  className={`mb-4 flex size-11 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${style.tone}`}
                >
                  <Icon name={style.icon} />
                </span>
                <h3 className="mb-2 text-lg font-bold text-navy">{item.title}</h3>
                <p className="text-sm leading-relaxed text-navy/70">{item.text}</p>
              </li>
            );
          })}
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
  const amount = 'font-mono text-base font-bold text-navy sm:text-lg';
  return (
    <section id="tarifs" className="scroll-mt-24 py-20 lg:py-28" aria-labelledby="tarifs-titre">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <SectionHeader id="tarifs-titre" title={p.title} lead={info ? p.lead : undefined} />
        {info ? (
          <div className="overflow-hidden rounded-3xl border border-navy/10 bg-white shadow-xl shadow-navy/5">
            <table className="w-full">
              <thead>
                <tr className="border-b border-navy/10 bg-slate-50 text-xs font-bold tracking-wider text-navy/60 uppercase">
                  <th scope="col" className="px-6 py-4 text-start sm:px-8">
                    {p.service}
                  </th>
                  <th scope="col" className="px-6 py-4 text-end sm:px-8">
                    {p.price}
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    service: p.delivery,
                    note: p.notes.delivery,
                    price: (
                      <span dir="ltr" className="font-mono text-lg font-black text-navy sm:text-xl">
                        {dt(info.fees.deliveryFeeMillimes)}
                      </span>
                    ),
                  },
                  {
                    service: p.return,
                    note: p.notes.return,
                    price: (
                      <span dir="ltr" className={amount}>
                        {dt(info.fees.returnFeeMillimes)}
                      </span>
                    ),
                  },
                  {
                    service: p.relaunch,
                    note: p.notes.relaunch,
                    highlight: true,
                    price: (
                      <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-black tracking-wider text-emerald-800 uppercase">
                        {p.free}
                      </span>
                    ),
                  },
                  {
                    service: p.changeClient,
                    note: p.notes.changeClient,
                    price: (
                      <span dir="ltr" className={amount}>
                        {dt(info.fees.changeClientFeeMillimes)}
                      </span>
                    ),
                  },
                  {
                    service: p.pickup,
                    note: p.notes.pickup,
                    price: (
                      <span className="flex flex-col items-end gap-1">
                        <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                          {p.pickupFree(info.fees.pickupFreeThreshold)}
                        </span>
                        <span className="text-xs text-navy/60">
                          {p.pickupBelow(
                            info.fees.pickupFreeThreshold,
                            dt(info.fees.pickupFeeMillimes),
                          )}
                        </span>
                      </span>
                    ),
                  },
                ].map((row) => (
                  <tr
                    key={row.service}
                    className={`border-b border-navy/5 transition-colors ${
                      row.highlight
                        ? 'bg-emerald-50/40 hover:bg-emerald-50/70'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <th scope="row" className="px-6 py-5 text-start font-normal sm:px-8">
                      <span className="block font-bold text-navy">{row.service}</span>
                      <span className="mt-0.5 block text-xs text-navy/60">{row.note}</span>
                    </th>
                    <td className="px-6 py-5 text-end sm:px-8">{row.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="bg-slate-50 px-6 py-4 text-xs text-navy/70 sm:px-8">
              {p.retenueNote(formatRatePercent(info.fees.retenueRateBps))}{' '}
              <a
                href={`/${locale}#faq`}
                className="font-bold text-orange-dark underline hover:text-navy"
              >
                {p.faqLink}
              </a>
            </p>
          </div>
        ) : (
          <p role="status" className="card text-navy">
            {p.unavailable}
          </p>
        )}
      </div>
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
  const byName = (a: NamedPlace, b: NamedPlace) =>
    collator.compare(nameIn(a, locale), nameIn(b, locale));
  return (
    <section
      id="zones"
      className="scroll-mt-24 border-t border-navy/5 bg-white py-20"
      aria-labelledby="zones-titre"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          id="zones-titre"
          eyebrow={texts.zones.eyebrow}
          title={texts.zones.title}
          lead={info && info.zones.length > 0 ? texts.zones.lead : undefined}
        />
        {info && info.zones.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[...info.zones]
              .sort((a, b) => byName(a.gouvernorat, b.gouvernorat))
              .map((zone) => (
                <div
                  key={zone.gouvernorat.code}
                  className="rounded-2xl border border-navy/10 bg-slate-50 p-6"
                >
                  <div className="mb-4 flex items-center justify-between gap-2 border-b border-navy/10 pb-4">
                    <h3 className="flex items-center gap-2 text-lg font-extrabold text-navy">
                      <Icon name="pin" className="size-4 text-orange" />
                      {nameIn(zone.gouvernorat, locale)}
                    </h3>
                    <span className="rounded-md border border-navy/10 bg-white px-2 py-0.5 text-xs font-bold whitespace-nowrap text-navy/70">
                      {texts.zones.count(zone.delegations.length)}
                    </span>
                  </div>
                  <ul className="max-h-80 space-y-2 overflow-y-auto pe-1 text-sm text-navy/75">
                    {[...zone.delegations].sort(byName).map((delegation) => (
                      <li key={delegation.code} className="flex items-center gap-2">
                        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-orange" />
                        {nameIn(delegation, locale)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        ) : (
          <p role="status" className="text-center text-navy">
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
    <section id="faq" className="scroll-mt-24 py-20 lg:py-28" aria-labelledby="faq-titre">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          id="faq-titre"
          eyebrow={texts.faq.eyebrow}
          title={texts.faq.title}
          lead={texts.faq.lead}
        />
        <div className="space-y-4">
          {items.map((item, index) => (
            <details
              key={item.q}
              open={index === 0}
              className="group rounded-2xl border border-navy/10 bg-white p-5 shadow-sm"
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-base font-bold text-navy transition-colors hover:text-orange-dark [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-navy/60 transition-transform duration-200 group-open:rotate-180 group-open:bg-orange/10 group-open:text-orange-dark"
                >
                  <Icon name="chevronDown" className="size-4" />
                </span>
              </summary>
              <p className="mt-4 border-t border-navy/5 pt-4 text-sm leading-relaxed text-navy/75">
                {item.a}{' '}
                {item.link && (
                  <a
                    href={item.link.href}
                    className="font-semibold text-orange-dark underline hover:text-navy"
                  >
                    {item.link.label}
                  </a>
                )}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Devenir partenaire (Landing 2.8): direct contact, no form (Landing rule 1). */
export function Contact({ texts, info }: { texts: PublicTexts; info: PublicSiteInfo | null }) {
  return (
    <section
      id="contact"
      className="relative scroll-mt-24 overflow-hidden bg-navy py-20 lg:py-24"
      aria-labelledby="contact-titre"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="size-125 rounded-full bg-orange/10 blur-[120px]" />
      </div>
      <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-orange/15 px-3 py-1 text-xs font-semibold text-orange">
          <Icon name="bolt" className="size-3.5" />
          {texts.contact.eyebrow}
        </p>
        <h2
          id="contact-titre"
          className="text-3xl leading-tight font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl"
        >
          {texts.contact.title}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-white/75 sm:text-lg">
          {texts.contact.lead}
        </p>
        {info && (
          <div className="mt-9">
            <ContactLinks links={info.contactLinks} texts={texts.contact} />
          </div>
        )}
      </div>
    </section>
  );
}
