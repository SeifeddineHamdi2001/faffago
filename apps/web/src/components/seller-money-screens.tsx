import Link from 'next/link';
import {
  BON_CORRECTION_LABEL_FR,
  BON_STATUS_LABELS_FR,
  PARCEL_CASH_STATUS_LABELS_FR,
  PARCEL_STATUS_LABELS_FR,
  formatRatePercent,
  type BonStatus,
  type ParcelStatus,
} from '@faffago/shared';
import { dt, when } from '@/lib/money';
import type {
  BonRetourRow,
  BonVersementRow,
  SellerCertificates,
  SellerPaiements,
  SellerRetours,
} from '@/lib/types';

/**
 * Paiements (Vendeur 4.11, D-83): what he is owed, parcel by parcel, and his
 * bons de versement to print. He never asks for a payment: he sees what is
 * coming and signs what he received.
 */
export function SellerPaiementsScreen({
  data,
  certificates,
  canPrint,
}: {
  data: SellerPaiements;
  certificates?: SellerCertificates;
  canPrint: boolean;
}) {
  const { aRecevoir, bons } = data;
  return (
    <section>
      <h1 className="mb-4 font-display text-2xl font-bold text-navy">Paiements</h1>

      <section aria-labelledby="a-recevoir" className="card mb-4 border-2 border-orange">
        <h2 id="a-recevoir" className="text-sm font-semibold text-navy/70">
          À recevoir
        </h2>
        <p className="font-display text-3xl font-bold text-navy">{dt(aRecevoir.totalMillimes)}</p>
        <p className="text-sm">
          Chez les coursiers : {dt(aRecevoir.chezLesCoursiersMillimes)} · Au dépôt, prêt à payer :{' '}
          {dt(aRecevoir.auDepotMillimes)}
        </p>
        {aRecevoir.fraisADeduireMillimes !== '0' && (
          <p className="text-sm">
            Frais à déduire (retours, changements de client, ramassages) :{' '}
            {dt(aRecevoir.fraisADeduireMillimes)}
          </p>
        )}
        <p className="mt-1 text-xs text-navy/70">
          Chaque colis : montant encaissé − frais de livraison. La retenue à la source, s’il y en a
          une, est calculée sur le bon de versement.
        </p>
      </section>

      {aRecevoir.parcels.length > 0 && (
        <section className="card mb-4 overflow-x-auto">
          <h2 className="mb-2 font-display text-lg font-bold text-navy">Colis livrés non payés</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-navy/70">
              <tr>
                <th className="py-2">Colis</th>
                <th>Livré le</th>
                <th className="text-right">Montant</th>
                <th className="text-right">Frais</th>
                <th className="text-right">Net</th>
                <th>Paiement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/10">
              {aRecevoir.parcels.map((parcel) => (
                <tr key={parcel.code}>
                  <td className="py-2">
                    <Link
                      href={`/vendeur/colis/${parcel.code}`}
                      className="font-mono text-orange-dark underline"
                    >
                      {parcel.code}
                    </Link>
                    <span className="block text-navy/70">{parcel.recipientName}</span>
                  </td>
                  <td>{when(parcel.deliveredAt)}</td>
                  <td className="text-right">{dt(parcel.codMillimes)}</td>
                  <td className="text-right">− {dt(parcel.deliveryFeeMillimes)}</td>
                  <td className="text-right font-semibold">{dt(parcel.netMillimes)}</td>
                  <td>
                    {PARCEL_CASH_STATUS_LABELS_FR[parcel.cashStatus]}
                    {parcel.bon && (
                      <span className="block text-navy/70">
                        {parcel.bon.number} · {BON_STATUS_LABELS_FR[parcel.bon.status as BonStatus]}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <h2 className="mb-2 font-display text-lg font-bold text-navy">Bons de versement</h2>
        {bons.length === 0 ? (
          <p className="text-sm text-navy/70">Aucun bon de versement pour l’instant.</p>
        ) : (
          <ul className="divide-y divide-navy/10 text-sm">
            {bons.map((bon) => (
              <BonVersementLine key={bon.id} bon={bon} canPrint={canPrint} />
            ))}
          </ul>
        )}
      </section>

      {certificates && (certificates.certificates.length > 0 || certificates.years.length > 0) && (
        <Certificates data={certificates} canPrint={canPrint} />
      )}
    </section>
  );
}

/**
 * Certificats de retenue à la source (Vendeur 4.11, D-89): one per bon that
 * withheld something, and the yearly summary. A bon corrected by Faffa Go
 * leaves its certificate Annulé; the next one replaces it.
 */
function Certificates({ data, canPrint }: { data: SellerCertificates; canPrint: boolean }) {
  return (
    <section className="card mt-6" aria-labelledby="certificats-title">
      <h2 id="certificats-title" className="mb-2 font-display text-lg font-bold text-navy">
        Certificats de retenue à la source
      </h2>
      {data.years.length > 0 && (
        <p className="mb-2 flex flex-wrap gap-2 text-sm">
          {data.years.map((year) =>
            canPrint ? (
              <a
                key={year}
                className="btn-secondary"
                href={`/api/bff/paiements/certificats/annuel/${year}/pdf`}
                target="_blank"
                rel="noreferrer"
              >
                Récapitulatif {year}
              </a>
            ) : (
              <span key={year}>Récapitulatif {year}</span>
            ),
          )}
        </p>
      )}
      <ul className="divide-y divide-navy/10 text-sm">
        {data.certificates.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>
              <strong>{c.number}</strong> · bon {c.bonNumber} · {when(c.issuedAt)} ·{' '}
              {dt(c.amountMillimes)}
              {c.cancelled && (
                <span className="ml-2 rounded bg-navy/10 px-1 text-xs text-navy">
                  Annulé · {BON_CORRECTION_LABEL_FR}
                </span>
              )}
            </span>
            {canPrint && (
              <a
                className="btn-secondary"
                href={`/api/bff/paiements/certificats/${c.id}/pdf`}
                target="_blank"
                rel="noreferrer"
              >
                Télécharger
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function BonVersementLine({ bon, canPrint }: { bon: BonVersementRow; canPrint: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span>
        <strong>{bon.number}</strong> · {when(bon.preparedAt)} ·{' '}
        {BON_STATUS_LABELS_FR[bon.status as BonStatus]}
        {bon.correctedAt && <Correction at={bon.correctedAt} />}
        <span className="block text-navy/70">
          {bon.parcelCount} colis · total {dt(bon.totalCodMillimes)} − frais{' '}
          {dt(bon.totalFeesMillimes)}
          {bon.retenueMillimes !== '0' &&
            ` − retenue à la source ${formatRatePercent(bon.retenueRateBps)} % ${dt(bon.retenueMillimes)}`}{' '}
          = <strong>{dt(bon.netMillimes)}</strong>
        </span>
      </span>
      {canPrint && (
        <a
          href={`/api/bff/paiements/bons/${bon.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary"
        >
          Imprimer
        </a>
      )}
    </li>
  );
}

/**
 * Retours (Vendeur 4.12): his returns on their way back — the old items of
 * his échanges too — and his bons de retour to print.
 */
export function SellerRetoursScreen({
  data,
  canPrint,
}: {
  data: SellerRetours;
  canPrint: boolean;
}) {
  return (
    <section>
      <h1 className="mb-4 font-display text-2xl font-bold text-navy">Retours</h1>
      <section className="card mb-4">
        <h2 className="mb-2 font-display text-lg font-bold text-navy">
          En cours de retour ({data.returns.length})
        </h2>
        {data.returns.length === 0 ? (
          <p className="text-sm text-navy/70">Aucun retour en cours.</p>
        ) : (
          <ul className="divide-y divide-navy/10 text-sm">
            {data.returns.map((line) => (
              <li
                key={`${line.code}-${line.itemType}`}
                className="flex flex-wrap justify-between gap-2 py-2"
              >
                <span>
                  <Link
                    href={`/vendeur/colis/${line.code}`}
                    className="font-mono text-orange-dark underline"
                  >
                    {line.code}
                  </Link>{' '}
                  ·{' '}
                  {line.itemType === 'ARTICLE_RECUPERE'
                    ? 'Ancien article (échange)'
                    : line.recipientName}
                </span>
                <span className="text-navy/70">
                  {PARCEL_STATUS_LABELS_FR[line.status as ParcelStatus]}
                  {line.bonNumber && ` · ${line.bonNumber}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-navy/70">
          Les retours vous sont rapportés par le ramasseur lors de sa prochaine visite.{' '}
          {data.receivedCount} retour(s) reçu(s) au total.
        </p>
      </section>
      <section className="card">
        <h2 className="mb-2 font-display text-lg font-bold text-navy">Bons de retour</h2>
        {data.bons.length === 0 ? (
          <p className="text-sm text-navy/70">Aucun bon de retour pour l’instant.</p>
        ) : (
          <ul className="divide-y divide-navy/10 text-sm">
            {data.bons.map((bon) => (
              <BonRetourLine key={bon.id} bon={bon} canPrint={canPrint} />
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

function BonRetourLine({ bon, canPrint }: { bon: BonRetourRow; canPrint: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span>
        <strong>{bon.number}</strong> · {when(bon.preparedAt)} ·{' '}
        {BON_STATUS_LABELS_FR[bon.status as BonStatus]}
        {bon.correctedAt && <Correction at={bon.correctedAt} />}
        <span className="block text-navy/70">{bon.lines.length} article(s)</span>
      </span>
      {canPrint && (
        <a
          href={`/api/bff/retours/bons/${bon.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary"
        >
          Imprimer
        </a>
      )}
    </li>
  );
}

/** A bon corrected by the team (D-88): the seller reads this, never the reason. */
function Correction({ at }: { at: string }) {
  return (
    <span className="ml-2 rounded bg-navy/10 px-1 text-xs text-navy">
      {BON_CORRECTION_LABEL_FR} · {when(at)}
    </span>
  );
}
