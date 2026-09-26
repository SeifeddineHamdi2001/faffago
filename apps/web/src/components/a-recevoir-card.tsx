import type { ReactNode } from 'react';
import { CHARGE_TYPE_LABELS_FR } from '@faffago/shared';
import { dt } from '@/lib/money';
import type { ARecevoirTotals } from '@/lib/types';

/**
 * À recevoir (Vendeur 4.1, 4.11, D-83, D-96), read top to bottom: the cash of
 * the delivered, unpaid parcels, each fee waiting, and what is left for him.
 * A change-client line shows only when there is one.
 */
export function ARecevoirCard({ money, footer }: { money: ARecevoirTotals; footer?: ReactNode }) {
  const fees = [
    { label: CHARGE_TYPE_LABELS_FR.LIVRAISON, amount: money.fraisLivraisonMillimes, always: true },
    { label: CHARGE_TYPE_LABELS_FR.RETOUR, amount: money.fraisRetourMillimes, always: true },
    {
      label: CHARGE_TYPE_LABELS_FR.CHANGEMENT_CLIENT,
      amount: money.fraisChangementClientMillimes,
      always: false,
    },
    { label: CHARGE_TYPE_LABELS_FR.RAMASSAGE, amount: money.fraisRamassageMillimes, always: true },
  ].filter((fee) => fee.always || fee.amount !== '0');
  return (
    <section aria-labelledby="a-recevoir" className="card mb-4 border-2 border-orange">
      <h2 id="a-recevoir" className="mb-2 font-display text-lg font-bold text-navy">
        À recevoir
      </h2>
      <dl className="text-sm">
        <div className="flex justify-between gap-3 py-1">
          <dt className="font-semibold text-navy">Montant total des colis livrés</dt>
          <dd className="font-semibold text-navy">{dt(money.codMillimes)}</dd>
        </div>
        {fees.map((fee) => (
          <div key={fee.label} className="flex justify-between gap-3 py-1 text-navy/80">
            <dt>{fee.label}</dt>
            <dd>− {dt(fee.amount)}</dd>
          </div>
        ))}
        <div className="mt-1 flex items-baseline justify-between gap-3 border-t border-navy/20 pt-2">
          <dt className="font-semibold text-navy">Total à recevoir</dt>
          <dd className="font-display text-3xl font-bold text-navy">{dt(money.netMillimes)}</dd>
        </div>
      </dl>
      <p className="mt-2 text-sm">
        Chez les coursiers : {dt(money.chezLesCoursiersMillimes)} · Au dépôt, prêt à payer :{' '}
        {dt(money.auDepotMillimes)}
      </p>
      <p className="mt-1 text-xs text-navy/70">
        Avant retenue à la source, s’il y en a une : elle est calculée sur le bon de versement.
        {footer && <> {footer}</>}
      </p>
    </section>
  );
}
