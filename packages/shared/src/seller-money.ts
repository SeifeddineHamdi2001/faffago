import { formatRatePercent, sumMillimes, type Millimes } from './money.js';
import { ParcelCashStatus } from './statuses.js';

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
}

/**
 * À recevoir: COD − the delivery fee frozen on each delivered, unpaid parcel
 * (the estimate of D-40), split by where the cash is. The other waiting fees
 * are given on their own line; the retenue is not estimated (D-83).
 */
export function aRecevoirOf(
  parcels: readonly {
    cashStatus: ParcelCashStatus | null;
    codAmountMillimes: Millimes;
    deliveryFeeMillimes: Millimes;
  }[],
  otherPendingCharges: readonly Millimes[],
): ARecevoir {
  const net = (p: { codAmountMillimes: Millimes; deliveryFeeMillimes: Millimes }) =>
    p.codAmountMillimes - p.deliveryFeeMillimes;
  const withCouriers = parcels.filter((p) => p.cashStatus === ParcelCashStatus.CHEZ_LE_COURSIER);
  const atDepot = parcels.filter((p) => p.cashStatus === ParcelCashStatus.AU_DEPOT);
  const chezLesCoursiersMillimes = sumMillimes(withCouriers.map(net));
  const auDepotMillimes = sumMillimes(atDepot.map(net));
  return {
    parcelCount: withCouriers.length + atDepot.length,
    chezLesCoursiersMillimes,
    auDepotMillimes,
    totalMillimes: chezLesCoursiersMillimes + auDepotMillimes,
    fraisADeduireMillimes: sumMillimes(otherPendingCharges),
  };
}

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
