import { formatRatePercent, sumMillimes, type Millimes } from './money.js';
import { ParcelEventType } from './parcel-state-machine.js';
import { ChargeType, ParcelCashStatus } from './statuses.js';

/**
 * What the seller sees of his money (Vendeur 4.1, 4.11, D-40, D-83).
 */

export interface ARecevoir {
  parcelCount: number;
  chezLesCoursiersMillimes: Millimes;
  /** Includes the parcels already on a bon Préparé or En route. */
  auDepotMillimes: Millimes;
  totalMillimes: Millimes;
  /** The other fees waiting: return, change-client, pickup. */
  fraisADeduireMillimes: Millimes;
  /** The breakdown the seller reads, top to bottom: COD, each fee, what is left. */
  codMillimes: Millimes;
  fraisLivraisonMillimes: Millimes;
  fraisRetourMillimes: Millimes;
  fraisChangementClientMillimes: Millimes;
  fraisRamassageMillimes: Millimes;
  /** COD − every fee waiting; below zero when the fees are more than the cash. */
  netMillimes: Millimes;
}

/**
 * À recevoir: COD − the delivery fee frozen on each delivered, unpaid parcel
 * (the estimate of D-40), split by where the cash is. The other waiting fees
 * are given by type and taken off the net (D-96); the retenue is not
 * estimated (D-83).
 */
export function aRecevoirOf(
  parcels: readonly {
    cashStatus: ParcelCashStatus | null;
    codAmountMillimes: Millimes;
    deliveryFeeMillimes: Millimes;
  }[],
  otherPendingCharges: readonly { type: ChargeType; amountMillimes: Millimes }[],
): ARecevoir {
  const net = (p: { codAmountMillimes: Millimes; deliveryFeeMillimes: Millimes }) =>
    p.codAmountMillimes - p.deliveryFeeMillimes;
  const withCouriers = parcels.filter((p) => p.cashStatus === ParcelCashStatus.CHEZ_LE_COURSIER);
  const atDepot = parcels.filter((p) => p.cashStatus === ParcelCashStatus.AU_DEPOT);
  const chezLesCoursiersMillimes = sumMillimes(withCouriers.map(net));
  const auDepotMillimes = sumMillimes(atDepot.map(net));
  const unpaid = [...withCouriers, ...atDepot];
  const feesOf = (type: ChargeType) =>
    sumMillimes(
      otherPendingCharges
        .filter((charge) => charge.type === type)
        .map((charge) => charge.amountMillimes),
    );
  const totalMillimes = chezLesCoursiersMillimes + auDepotMillimes;
  const fraisADeduireMillimes = sumMillimes(
    otherPendingCharges.map((charge) => charge.amountMillimes),
  );
  return {
    parcelCount: unpaid.length,
    chezLesCoursiersMillimes,
    auDepotMillimes,
    totalMillimes,
    fraisADeduireMillimes,
    codMillimes: sumMillimes(unpaid.map((p) => p.codAmountMillimes)),
    fraisLivraisonMillimes: sumMillimes(unpaid.map((p) => p.deliveryFeeMillimes)),
    fraisRetourMillimes: feesOf(ChargeType.RETOUR),
    fraisChangementClientMillimes: feesOf(ChargeType.CHANGEMENT_CLIENT),
    fraisRamassageMillimes: feesOf(ChargeType.RAMASSAGE),
    netMillimes: totalMillimes - fraisADeduireMillimes,
  };
}

/**
 * The events that make a parcel "retourné" for the Taux de livraison (D-97):
 * the return is decided — the seller's choice, 48 hours without decision, or
 * the 3rd failed attempt — not received back.
 */
export const RETURN_DECIDED_EVENT_TYPES = [
  ParcelEventType.DECISION_RETOURNER,
  ParcelEventType.RETOUR_AUTO_48H,
  ParcelEventType.RETOUR_AUTO_3E_TENTATIVE,
] as const;

/**
 * Taux de livraison: livrés ÷ (livrés + retournés), in basis points rounded
 * half up; null when nothing ended in the period (Vendeur 4.1, D-83).
 */
export function deliveryRateBps(delivered: number, returned: number): number | null {
  const total = delivered + returned;
  if (total <= 0) return null;
  return Math.floor((delivered * 20_000 + total) / (2 * total));
}

export function formatDeliveryRate(bps: number | null): string {
  return bps === null ? '—' : `${formatRatePercent(bps)} %`;
}
