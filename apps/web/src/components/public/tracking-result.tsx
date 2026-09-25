import {
  PublicStatus,
  TrackStepState,
  formatDT,
  millimesFromJson,
  publicTimelineSteps,
  publicTrackLine,
  type PublicTrackingView,
} from '@faffago/shared';
import { formatDayKey, formatTunisDateTime, type Locale } from '@/lib/locale';
import type { PublicTexts } from '@/lib/public-texts';

/** The amount matters only while the delivery is still ahead. */
const AMOUNT_SHOWN: readonly PublicStatus[] = [
  PublicStatus.COMMANDE_ENREGISTREE,
  PublicStatus.CHEZ_FAFFA_GO,
  PublicStatus.EN_COURS_DE_LIVRAISON,
  PublicStatus.LIVRAISON_REPORTEE,
  PublicStatus.LIVRAISON_REPORTEE_CLIENT,
];

/**
 * One parcel as its customer sees it (Landing 4.1, Q1–Q3): chevron line,
 * public status, last update, shop, délégation, amount to prepare, the
 * livreur's first name while out, the day he chose if he postponed (D-9).
 * Nothing else ever reaches this component (Landing 4.3).
 */
export function TrackingResult({
  view,
  locale,
  texts,
}: {
  view: PublicTrackingView;
  locale: Locale;
  texts: PublicTexts['tracking'];
}) {
  const line = publicTrackLine(view.status);
  const steps = publicTimelineSteps(view.timeline);
  const amount = millimesFromJson(view.codAmountMillimes);
  const statusLabel =
    view.status === PublicStatus.LIVRAISON_REPORTEE_CLIENT && view.postponedTo
      ? `${texts.statuses[view.status]} — ${formatDayKey(view.postponedTo)}`
      : texts.statuses[view.status];

  return (
    <article className="card space-y-5" aria-labelledby="statut-colis">
      <p dir="ltr" className="text-sm font-semibold tracking-wider text-navy/70">
        {view.code}
      </p>
      <ol className="flex flex-wrap gap-1" aria-label={texts.status}>
        {line.steps.map(({ step, state }) => (
          <li
            key={step}
            aria-current={state === TrackStepState.ACTUEL ? 'step' : undefined}
            className={`chevron px-5 py-2 text-xs font-semibold sm:text-sm ${
              state === TrackStepState.FAIT
                ? 'bg-navy text-white'
                : state === TrackStepState.ACTUEL
                  ? 'bg-orange text-navy'
                  : 'bg-navy/10 text-navy/60'
            }`}
          >
            {texts.steps[step]}
          </li>
        ))}
      </ol>

      <div>
        <p className="text-sm text-navy/70">{texts.status}</p>
        <h1 id="statut-colis" className="font-display text-2xl font-bold text-navy">
          {statusLabel}
        </h1>
        {view.livreurFirstName && (
          <p className="mt-1 text-navy">
            {texts.livreur} : <strong>{view.livreurFirstName}</strong>
          </p>
        )}
        {view.postponedTo && (
          <p className="mt-1 text-navy">
            {texts.postponedTo} <strong dir="ltr">{formatDayKey(view.postponedTo)}</strong>
          </p>
        )}
      </div>

      <dl className="grid gap-4 sm:grid-cols-2">
        {AMOUNT_SHOWN.includes(view.status) && (
          <div className="rounded-lg bg-orange/15 p-3 sm:col-span-2">
            <dt className="text-sm font-semibold text-navy">{texts.amount}</dt>
            <dd dir="ltr" className="font-display text-3xl font-bold text-navy rtl:text-right">
              {amount > 0n ? formatDT(amount) : texts.nothingToPay}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-sm text-navy/70">{texts.shop}</dt>
          <dd className="font-semibold text-navy">{view.shopName}</dd>
        </div>
        <div>
          <dt className="text-sm text-navy/70">{texts.delegation}</dt>
          <dd className="font-semibold text-navy">{view.delegationName}</dd>
        </div>
        <div>
          <dt className="text-sm text-navy/70">{texts.lastUpdate}</dt>
          <dd className="font-semibold text-navy">
            {formatTunisDateTime(view.lastUpdateAt, locale)}
          </dd>
        </div>
      </dl>

      {steps.length > 0 && (
        <section aria-labelledby="historique">
          <h2 id="historique" className="mb-2 font-display text-lg font-bold text-navy">
            {texts.history}
          </h2>
          <ol className="space-y-2 border-s-2 border-navy/15 ps-4">
            {[...steps].reverse().map((entry) => (
              <li key={`${entry.step}-${entry.at}`}>
                <p className="font-semibold text-navy">{texts.steps[entry.step]}</p>
                <p className="text-sm text-navy/70">{formatTunisDateTime(entry.at, locale)}</p>
              </li>
            ))}
          </ol>
        </section>
      )}
    </article>
  );
}
