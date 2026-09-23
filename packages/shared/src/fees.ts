import { applyRateBps, sumMillimes, type BasisPoints, type Millimes } from './money.js';
import { PayPlan, SellerStatut, type ChargeType } from './statuses.js';

/**
 * Every money rule of the platform, in one file, on integers only.
 *
 * Each function is pure: the API calls it inside a transaction and stores the
 * result. Nothing here reads the database or the clock.
 */

// ─────────────────────────────────────────────────────────────
// Business date
// ─────────────────────────────────────────────────────────────

/**
 * Tunisia is UTC+1 all year and has had no daylight saving since 2009, so the
 * offset is a constant rather than a timezone database lookup.
 */
export const TUNISIA_UTC_OFFSET_MINUTES = 60;

/**
 * The business day an instant belongs to, as a UTC-midnight Date.
 *
 * A scan at 23:40 local time belongs to that day, not to the next one in UTC.
 * The Caisse counts a courier's day with this (A-12), and it is computed from
 * the device time the scan carries.
 */
export function businessDateOf(instant: Date): Date {
  const local = new Date(instant.getTime() + TUNISIA_UTC_OFFSET_MINUTES * 60_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/**
 * A scan whose device clock is this far from the server clock is stored and
 * accepted, but flagged, because its business date cannot be trusted (A-12).
 */
export function isClockSkewSuspect(
  deviceTime: Date,
  serverTime: Date,
  thresholdMinutes: number,
): boolean {
  return Math.abs(deviceTime.getTime() - serverTime.getTime()) > thresholdMinutes * 60_000;
}

// ─────────────────────────────────────────────────────────────
// Pickup fee
// ─────────────────────────────────────────────────────────────

export interface PickupFeeInput {
  /** Parcels actually scanned by the ramasseur, not the number announced. */
  scannedCount: number;
  feeMillimes: Millimes;
  freeThreshold: number;
}

/**
 * Free from 5 parcels scanned; below that, 2,000 DT (Vendeur rule 11).
 *
 * Zero parcels scanned costs nothing: the visit produced no pickup at all, so
 * it is treated as cancelled rather than as a tiny pickup (A-13).
 */
export function computePickupFee({
  scannedCount,
  feeMillimes,
  freeThreshold,
}: PickupFeeInput): Millimes {
  if (scannedCount <= 0) return 0n;
  if (scannedCount >= freeThreshold) return 0n;
  return feeMillimes;
}

// ─────────────────────────────────────────────────────────────
// Retenue à la source
// ─────────────────────────────────────────────────────────────

/**
 * 3 % of what is left after every Faffa Go fee, for sellers with statut
 * CIN uniquement only (Vendeur 2.4). The pickup fee counts as a Faffa Go fee
 * and is therefore inside the base (A-3a).
 *
 * Rounding is half-up at the millime and lives in `applyRateBps`, so the
 * accountant changes it in exactly one place (A-3b).
 */
export function computeRetenue(
  baseAfterFeesMillimes: Millimes,
  sellerStatut: SellerStatut,
  rateBps: BasisPoints,
): Millimes {
  if (sellerStatut !== SellerStatut.CIN_UNIQUEMENT) return 0n;
  if (baseAfterFeesMillimes <= 0n) return 0n;
  return applyRateBps(baseAfterFeesMillimes, rateBps);
}

// ─────────────────────────────────────────────────────────────
// Bon de versement
// ─────────────────────────────────────────────────────────────

export interface PayoutParcel {
  parcelId: string;
  codMillimes: Millimes;
}

export interface PayoutCharge {
  chargeId: string;
  type: ChargeType;
  amountMillimes: Millimes;
  createdAt: Date;
}

export interface BuildBonVersementInput {
  /** Parcels Livré, cash Au dépôt, not yet paid, that the admin kept ticked. */
  parcels: readonly PayoutParcel[];
  /** Every EN_ATTENTE charge of this seller. */
  pendingCharges: readonly PayoutCharge[];
  sellerStatut: SellerStatut;
  retenueRateBps: BasisPoints;
}

export interface BuildBonVersementResult {
  /** False when the net would be zero or negative: no bon is created (A-2). */
  generated: boolean;
  parcelIds: string[];
  includedChargeIds: string[];
  carriedChargeIds: string[];
  totalCodMillimes: Millimes;
  totalFeesMillimes: Millimes;
  baseAfterFeesMillimes: Millimes;
  retenueRateBps: BasisPoints;
  retenueMillimes: Millimes;
  netMillimes: Millimes;
  /** Charges left EN_ATTENTE, shown to the admin as the seller's solde débiteur. */
  soldeDebiteurMillimes: Millimes;
}

function netAfter(
  totalCod: Millimes,
  fees: Millimes,
  sellerStatut: SellerStatut,
  rateBps: BasisPoints,
): Millimes {
  const base = totalCod - fees;
  return base - computeRetenue(base, sellerStatut, rateBps);
}

/**
 * Builds one bon de versement.
 *
 * A bon is never negative (A-2). Charges are taken oldest first and the walk
 * stops at the first one that would push the net to zero or below; that charge
 * and everything after it carry over to the next bon. Stopping rather than
 * hunting for a smaller charge that would still fit keeps the deduction order
 * explainable to a seller reading two consecutive bons.
 *
 * Because a charge that does not fit is always carried, the net is positive by
 * construction. `generated` is therefore false only when there is nothing to
 * pay at all: no parcel selected, or every selected parcel has a COD of zero.
 * The seller's unpaid charges are reported as `soldeDebiteurMillimes` either
 * way, which is what the admin screen shows as his solde débiteur.
 */
export function buildBonVersement(input: BuildBonVersementInput): BuildBonVersementResult {
  const { parcels, pendingCharges, sellerStatut, retenueRateBps } = input;

  const totalCodMillimes = sumMillimes(parcels.map((parcel) => parcel.codMillimes));

  const ordered = [...pendingCharges].sort((a, b) => {
    const byDate = a.createdAt.getTime() - b.createdAt.getTime();
    return byDate !== 0 ? byDate : a.chargeId.localeCompare(b.chargeId);
  });

  const includedChargeIds: string[] = [];
  const carriedChargeIds: string[] = [];
  let totalFeesMillimes = 0n;
  let stopped = false;

  for (const charge of ordered) {
    if (stopped) {
      carriedChargeIds.push(charge.chargeId);
      continue;
    }
    const candidateFees = totalFeesMillimes + charge.amountMillimes;
    if (netAfter(totalCodMillimes, candidateFees, sellerStatut, retenueRateBps) > 0n) {
      totalFeesMillimes = candidateFees;
      includedChargeIds.push(charge.chargeId);
    } else {
      stopped = true;
      carriedChargeIds.push(charge.chargeId);
    }
  }

  const baseAfterFeesMillimes = totalCodMillimes - totalFeesMillimes;
  const retenueMillimes = computeRetenue(baseAfterFeesMillimes, sellerStatut, retenueRateBps);
  const netMillimes = baseAfterFeesMillimes - retenueMillimes;
  const generated = parcels.length > 0 && netMillimes > 0n;

  const carriedAmounts = ordered
    .filter((charge) => carriedChargeIds.includes(charge.chargeId))
    .map((charge) => charge.amountMillimes);

  if (!generated) {
    // Nothing is consumed: the parcels stay unpaid and every charge stays
    // EN_ATTENTE until a later bon can absorb it.
    return {
      generated: false,
      parcelIds: [],
      includedChargeIds: [],
      carriedChargeIds: ordered.map((charge) => charge.chargeId),
      totalCodMillimes,
      totalFeesMillimes: 0n,
      baseAfterFeesMillimes: totalCodMillimes,
      retenueRateBps,
      retenueMillimes: 0n,
      netMillimes: totalCodMillimes,
      soldeDebiteurMillimes: sumMillimes(ordered.map((charge) => charge.amountMillimes)),
    };
  }

  return {
    generated: true,
    parcelIds: parcels.map((parcel) => parcel.parcelId),
    includedChargeIds,
    carriedChargeIds,
    totalCodMillimes,
    totalFeesMillimes,
    baseAfterFeesMillimes,
    retenueRateBps,
    retenueMillimes,
    netMillimes,
    soldeDebiteurMillimes: sumMillimes(carriedAmounts),
  };
}

// ─────────────────────────────────────────────────────────────
// Caisse
// ─────────────────────────────────────────────────────────────

export interface CaisseCountInput {
  /** Sum of the COD of the parcels the courier scanned Livré on this day. */
  expectedDeliveryMillimes: Millimes;
  /** Bon cash he left with and has not handed to a seller. Admin 4.9. */
  expectedBonCashMillimes: Millimes;
  countedMillimes: Millimes;
}

export interface CaisseCountResult {
  expectedTotalMillimes: Millimes;
  ecartMillimes: Millimes;
  /** A shortfall becomes a courier debt. Admin rule 05. */
  debtMillimes: Millimes;
  /** A surplus is never absorbed silently; the admin checks it. Admin 4.9. */
  surplusMillimes: Millimes;
}

export function computeCaisseCount({
  expectedDeliveryMillimes,
  expectedBonCashMillimes,
  countedMillimes,
}: CaisseCountInput): CaisseCountResult {
  const expectedTotalMillimes = expectedDeliveryMillimes + expectedBonCashMillimes;
  const ecartMillimes = countedMillimes - expectedTotalMillimes;
  return {
    expectedTotalMillimes,
    ecartMillimes,
    debtMillimes: ecartMillimes < 0n ? -ecartMillimes : 0n,
    surplusMillimes: ecartMillimes > 0n ? ecartMillimes : 0n,
  };
}

// ─────────────────────────────────────────────────────────────
// Paie coursier (livreurs only)
// ─────────────────────────────────────────────────────────────

export interface PayslipParcelInput {
  parcelId: string;
  /** Frozen on the parcel at delivery, so a later rate change is harmless (A-15). */
  courierRateMillimes: Millimes;
}

export interface PayslipDebtInput {
  debtId: string;
  remainingMillimes: Millimes;
  createdAt: Date;
}

export interface PayslipDeductionLine {
  debtId: string;
  amountMillimes: Millimes;
}

export interface BuildPayslipResult {
  parcelCount: number;
  grossMillimes: Millimes;
  deductions: PayslipDeductionLine[];
  deductionsMillimes: Millimes;
  netMillimes: Millimes;
  /** Debt left after this pay slip; carries over to the next period. Admin 4.12. */
  carriedDebtMillimes: Millimes;
}

/**
 * Parcels livrés in the period times their frozen rate, minus debts, oldest
 * debt first. The net never goes below zero: what does not fit carries over
 * to the next period (Admin 4.12).
 */
export function buildPayslip(
  parcels: readonly PayslipParcelInput[],
  debts: readonly PayslipDebtInput[],
): BuildPayslipResult {
  const grossMillimes = sumMillimes(parcels.map((parcel) => parcel.courierRateMillimes));

  const ordered = [...debts].sort((a, b) => {
    const byDate = a.createdAt.getTime() - b.createdAt.getTime();
    return byDate !== 0 ? byDate : a.debtId.localeCompare(b.debtId);
  });

  const deductions: PayslipDeductionLine[] = [];
  let remainingPay = grossMillimes;
  let carriedDebtMillimes = 0n;

  for (const debt of ordered) {
    if (remainingPay <= 0n) {
      carriedDebtMillimes += debt.remainingMillimes;
      continue;
    }
    const taken = debt.remainingMillimes <= remainingPay ? debt.remainingMillimes : remainingPay;
    deductions.push({ debtId: debt.debtId, amountMillimes: taken });
    remainingPay -= taken;
    carriedDebtMillimes += debt.remainingMillimes - taken;
  }

  const deductionsMillimes = sumMillimes(deductions.map((line) => line.amountMillimes));

  return {
    parcelCount: parcels.length,
    grossMillimes,
    deductions,
    deductionsMillimes,
    netMillimes: grossMillimes - deductionsMillimes,
    carriedDebtMillimes,
  };
}

export interface PayPeriod {
  /** Inclusive, UTC midnight. */
  start: Date;
  /** Inclusive, UTC midnight. */
  end: Date;
}

/**
 * The period a pay slip covers (A-16).
 *
 * Hebdomadaire runs Monday to Sunday. A courier who changes plan keeps his
 * current period and the new plan applies from the next one, which the caller
 * enforces by reading the plan in force at `businessDate`.
 */
export function payPeriodFor(plan: PayPlan, businessDate: Date): PayPeriod {
  const year = businessDate.getUTCFullYear();
  const month = businessDate.getUTCMonth();
  const day = businessDate.getUTCDate();

  if (plan === PayPlan.JOURNALIER) {
    const start = new Date(Date.UTC(year, month, day));
    return { start, end: start };
  }

  if (plan === PayPlan.HEBDOMADAIRE) {
    const weekday = new Date(Date.UTC(year, month, day)).getUTCDay(); // 0 = Sunday
    const daysSinceMonday = (weekday + 6) % 7;
    const start = new Date(Date.UTC(year, month, day - daysSinceMonday));
    const end = new Date(Date.UTC(year, month, day - daysSinceMonday + 6));
    return { start, end };
  }

  return {
    start: new Date(Date.UTC(year, month, 1)),
    end: new Date(Date.UTC(year, month + 1, 0)),
  };
}
