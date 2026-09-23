import { describe, expect, it } from 'vitest';
import {
  buildBonVersement,
  buildPayslip,
  businessDateOf,
  computeCaisseCount,
  computePickupFee,
  computeRetenue,
  isClockSkewSuspect,
  payPeriodFor,
  type PayoutCharge,
} from '../fees.js';
import { ChargeType, PayPlan, SellerStatut } from '../statuses.js';

const RETENUE_BPS = 300;

function charge(
  chargeId: string,
  amountMillimes: bigint,
  createdAt: string,
  type: ChargeType = ChargeType.RETOUR,
): PayoutCharge {
  return { chargeId, type, amountMillimes, createdAt: new Date(createdAt) };
}

describe('computePickupFee', () => {
  const feeMillimes = 2000n;
  const freeThreshold = 5;

  it('is free from 5 parcels scanned (Vendeur rule 11)', () => {
    expect(computePickupFee({ scannedCount: 5, feeMillimes, freeThreshold })).toBe(0n);
    expect(computePickupFee({ scannedCount: 40, feeMillimes, freeThreshold })).toBe(0n);
  });

  it('costs 2,000 DT below 5 parcels', () => {
    expect(computePickupFee({ scannedCount: 1, feeMillimes, freeThreshold })).toBe(2000n);
    expect(computePickupFee({ scannedCount: 4, feeMillimes, freeThreshold })).toBe(2000n);
  });

  it('costs nothing when nothing was scanned (A-13)', () => {
    expect(computePickupFee({ scannedCount: 0, feeMillimes, freeThreshold })).toBe(0n);
  });
});

describe('computeRetenue', () => {
  it('applies only to sellers with statut CIN uniquement', () => {
    expect(computeRetenue(916_000n, SellerStatut.CIN_UNIQUEMENT, RETENUE_BPS)).toBe(27_480n);
    expect(computeRetenue(916_000n, SellerStatut.PATENTE, RETENUE_BPS)).toBe(0n);
    expect(computeRetenue(916_000n, SellerStatut.AUTO_ENTREPRENEUR, RETENUE_BPS)).toBe(0n);
  });

  it('is never withheld on a base that is zero or negative', () => {
    expect(computeRetenue(0n, SellerStatut.CIN_UNIQUEMENT, RETENUE_BPS)).toBe(0n);
    expect(computeRetenue(-10_000n, SellerStatut.CIN_UNIQUEMENT, RETENUE_BPS)).toBe(0n);
  });
});

describe('buildBonVersement', () => {
  it('reproduces the worked example of Vendeur 2.4', () => {
    const result = buildBonVersement({
      parcels: [
        { parcelId: 'p1', codMillimes: 600_000n },
        { parcelId: 'p2', codMillimes: 400_000n },
      ],
      pendingCharges: [charge('c1', 84_000n, '2026-09-20T08:00:00Z', ChargeType.LIVRAISON)],
      sellerStatut: SellerStatut.CIN_UNIQUEMENT,
      retenueRateBps: RETENUE_BPS,
    });

    expect(result.generated).toBe(true);
    expect(result.totalCodMillimes).toBe(1_000_000n);
    expect(result.totalFeesMillimes).toBe(84_000n);
    expect(result.baseAfterFeesMillimes).toBe(916_000n);
    expect(result.retenueMillimes).toBe(27_480n);
    expect(result.netMillimes).toBe(888_520n);
    expect(result.soldeDebiteurMillimes).toBe(0n);
  });

  it('withholds nothing for a seller with a patente', () => {
    const result = buildBonVersement({
      parcels: [{ parcelId: 'p1', codMillimes: 1_000_000n }],
      pendingCharges: [charge('c1', 84_000n, '2026-09-20T08:00:00Z', ChargeType.LIVRAISON)],
      sellerStatut: SellerStatut.PATENTE,
      retenueRateBps: RETENUE_BPS,
    });

    expect(result.retenueMillimes).toBe(0n);
    expect(result.netMillimes).toBe(916_000n);
  });

  it('deducts every kind of fee on its own line (Vendeur rule 10)', () => {
    const result = buildBonVersement({
      parcels: [{ parcelId: 'p1', codMillimes: 100_000n }],
      pendingCharges: [
        charge('livraison', 7000n, '2026-09-20T08:00:00Z', ChargeType.LIVRAISON),
        charge('retour', 5000n, '2026-09-20T09:00:00Z', ChargeType.RETOUR),
        charge('changement', 1000n, '2026-09-20T10:00:00Z', ChargeType.CHANGEMENT_CLIENT),
        charge('ramassage', 2000n, '2026-09-20T11:00:00Z', ChargeType.RAMASSAGE),
      ],
      sellerStatut: SellerStatut.PATENTE,
      retenueRateBps: RETENUE_BPS,
    });

    expect(result.includedChargeIds).toEqual(['livraison', 'retour', 'changement', 'ramassage']);
    expect(result.totalFeesMillimes).toBe(15_000n);
    expect(result.netMillimes).toBe(85_000n);
  });

  it('puts the pickup fee inside the retenue base (A-3a)', () => {
    const result = buildBonVersement({
      parcels: [{ parcelId: 'p1', codMillimes: 100_000n }],
      pendingCharges: [charge('ramassage', 2000n, '2026-09-20T08:00:00Z', ChargeType.RAMASSAGE)],
      sellerStatut: SellerStatut.CIN_UNIQUEMENT,
      retenueRateBps: RETENUE_BPS,
    });

    expect(result.baseAfterFeesMillimes).toBe(98_000n);
    expect(result.retenueMillimes).toBe(2940n); // 3 % of 98,000, not of 100,000
    expect(result.netMillimes).toBe(95_060n);
  });

  it('carries a charge bigger than the cash collected, and still pays the cash (A-2)', () => {
    const result = buildBonVersement({
      parcels: [{ parcelId: 'p1', codMillimes: 3000n }],
      pendingCharges: [charge('retour', 5000n, '2026-09-20T08:00:00Z')],
      sellerStatut: SellerStatut.PATENTE,
      retenueRateBps: RETENUE_BPS,
    });

    expect(result.generated).toBe(true);
    expect(result.netMillimes).toBe(3000n);
    expect(result.includedChargeIds).toEqual([]);
    expect(result.carriedChargeIds).toEqual(['retour']);
    expect(result.soldeDebiteurMillimes).toBe(5000n);
  });

  it('carries a charge that would land the net exactly on zero', () => {
    const result = buildBonVersement({
      parcels: [{ parcelId: 'p1', codMillimes: 5000n }],
      pendingCharges: [charge('retour', 5000n, '2026-09-20T08:00:00Z')],
      sellerStatut: SellerStatut.PATENTE,
      retenueRateBps: RETENUE_BPS,
    });

    expect(result.generated).toBe(true);
    expect(result.netMillimes).toBe(5000n);
    expect(result.soldeDebiteurMillimes).toBe(5000n);
  });

  it('generates no bon when there is no parcel to pay', () => {
    const result = buildBonVersement({
      parcels: [],
      pendingCharges: [charge('retour', 5000n, '2026-09-20T08:00:00Z')],
      sellerStatut: SellerStatut.PATENTE,
      retenueRateBps: RETENUE_BPS,
    });

    expect(result.generated).toBe(false);
  });

  it('takes charges oldest first and carries what does not fit (A-2)', () => {
    const result = buildBonVersement({
      parcels: [{ parcelId: 'p1', codMillimes: 10_000n }],
      pendingCharges: [
        charge('vieux', 4000n, '2026-09-18T08:00:00Z'),
        charge('moyen', 4000n, '2026-09-19T08:00:00Z'),
        charge('recent', 4000n, '2026-09-20T08:00:00Z'),
      ],
      sellerStatut: SellerStatut.PATENTE,
      retenueRateBps: RETENUE_BPS,
    });

    expect(result.generated).toBe(true);
    expect(result.includedChargeIds).toEqual(['vieux', 'moyen']);
    expect(result.carriedChargeIds).toEqual(['recent']);
    expect(result.netMillimes).toBe(2000n);
    expect(result.soldeDebiteurMillimes).toBe(4000n);
  });

  it('stops at the first charge that does not fit and carries the rest', () => {
    // The 9,000 charge cannot fit; the later 1,000 one is not slipped in
    // ahead of it, so two consecutive bons stay readable in order.
    const result = buildBonVersement({
      parcels: [{ parcelId: 'p1', codMillimes: 5000n }],
      pendingCharges: [
        charge('gros', 9000n, '2026-09-18T08:00:00Z'),
        charge('petit', 1000n, '2026-09-19T08:00:00Z'),
      ],
      sellerStatut: SellerStatut.PATENTE,
      retenueRateBps: RETENUE_BPS,
    });

    expect(result.generated).toBe(true);
    expect(result.includedChargeIds).toEqual([]);
    expect(result.carriedChargeIds).toEqual(['gros', 'petit']);
    expect(result.netMillimes).toBe(5000n);
    expect(result.soldeDebiteurMillimes).toBe(10_000n);
  });

  it('never produces a negative net, whatever the charges (A-2)', () => {
    const codAmounts = [0n, 1n, 3000n, 10_000n, 85_000n, 1_000_000n];
    const chargeAmounts = [1n, 2000n, 7000n, 50_000n, 2_000_000n];

    for (const cod of codAmounts) {
      for (const first of chargeAmounts) {
        for (const second of chargeAmounts) {
          for (const statut of [SellerStatut.PATENTE, SellerStatut.CIN_UNIQUEMENT]) {
            const result = buildBonVersement({
              parcels: [{ parcelId: 'p1', codMillimes: cod }],
              pendingCharges: [
                charge('c1', first, '2026-09-18T08:00:00Z'),
                charge('c2', second, '2026-09-19T08:00:00Z'),
              ],
              sellerStatut: statut,
              retenueRateBps: RETENUE_BPS,
            });
            expect(result.netMillimes >= 0n).toBe(true);
            if (result.generated) expect(result.netMillimes > 0n).toBe(true);
          }
        }
      }
    }
  });

  it('withholds a retenue that can never exceed what is left to pay', () => {
    // 3 % of a positive base is always smaller than the base, so the retenue
    // alone can never push a bon to zero. Only the fees can, and a fee that
    // would do that is carried instead.
    const result = buildBonVersement({
      parcels: [{ parcelId: 'p1', codMillimes: 1n }],
      pendingCharges: [],
      sellerStatut: SellerStatut.CIN_UNIQUEMENT,
      retenueRateBps: RETENUE_BPS,
    });

    expect(result.retenueMillimes).toBe(0n);
    expect(result.netMillimes).toBe(1n);
  });

  it('is deterministic when two charges share a timestamp', () => {
    const result = buildBonVersement({
      parcels: [{ parcelId: 'p1', codMillimes: 10_000n }],
      pendingCharges: [
        charge('b', 3000n, '2026-09-18T08:00:00Z'),
        charge('a', 3000n, '2026-09-18T08:00:00Z'),
      ],
      sellerStatut: SellerStatut.PATENTE,
      retenueRateBps: RETENUE_BPS,
    });

    expect(result.includedChargeIds).toEqual(['a', 'b']);
  });

  it('pays parcels whose COD is zero without charging anything', () => {
    const result = buildBonVersement({
      parcels: [{ parcelId: 'p1', codMillimes: 0n }],
      pendingCharges: [],
      sellerStatut: SellerStatut.PATENTE,
      retenueRateBps: RETENUE_BPS,
    });

    expect(result.generated).toBe(false);
    expect(result.netMillimes).toBe(0n);
  });
});

describe('computeCaisseCount', () => {
  it('reproduces the example of Admin 4.9', () => {
    const result = computeCaisseCount({
      expectedDeliveryMillimes: 468_000n,
      expectedBonCashMillimes: 0n,
      countedMillimes: 463_000n,
    });

    expect(result.ecartMillimes).toBe(-5000n);
    expect(result.debtMillimes).toBe(5000n);
    expect(result.surplusMillimes).toBe(0n);
  });

  it('records a surplus without absorbing it', () => {
    const result = computeCaisseCount({
      expectedDeliveryMillimes: 100_000n,
      expectedBonCashMillimes: 0n,
      countedMillimes: 103_000n,
    });

    expect(result.ecartMillimes).toBe(3000n);
    expect(result.surplusMillimes).toBe(3000n);
    expect(result.debtMillimes).toBe(0n);
  });

  it('counts the bon cash a ramasseur carries (Admin 4.9)', () => {
    const result = computeCaisseCount({
      expectedDeliveryMillimes: 0n,
      expectedBonCashMillimes: 250_000n,
      countedMillimes: 250_000n,
    });

    expect(result.expectedTotalMillimes).toBe(250_000n);
    expect(result.ecartMillimes).toBe(0n);
  });
});

describe('buildPayslip', () => {
  const parcels = [
    { parcelId: 'p1', courierRateMillimes: 1500n },
    { parcelId: 'p2', courierRateMillimes: 1500n },
    { parcelId: 'p3', courierRateMillimes: 1500n },
  ];

  it('pays parcels livrés at their frozen rate (A-15)', () => {
    const result = buildPayslip(parcels, []);
    expect(result.parcelCount).toBe(3);
    expect(result.grossMillimes).toBe(4500n);
    expect(result.netMillimes).toBe(4500n);
  });

  it('uses the rate frozen on each parcel, not one rate for all', () => {
    const result = buildPayslip(
      [
        { parcelId: 'p1', courierRateMillimes: 1500n },
        { parcelId: 'p2', courierRateMillimes: 1800n },
      ],
      [],
    );
    expect(result.grossMillimes).toBe(3300n);
  });

  it('deducts debts oldest first', () => {
    const result = buildPayslip(parcels, [
      { debtId: 'd2', remainingMillimes: 1000n, createdAt: new Date('2026-09-20T00:00:00Z') },
      { debtId: 'd1', remainingMillimes: 2000n, createdAt: new Date('2026-09-18T00:00:00Z') },
    ]);

    expect(result.deductions).toEqual([
      { debtId: 'd1', amountMillimes: 2000n },
      { debtId: 'd2', amountMillimes: 1000n },
    ]);
    expect(result.netMillimes).toBe(1500n);
    expect(result.carriedDebtMillimes).toBe(0n);
  });

  it('never pays a negative amount and carries the rest of the debt (Admin 4.12)', () => {
    const result = buildPayslip(parcels, [
      { debtId: 'd1', remainingMillimes: 7000n, createdAt: new Date('2026-09-18T00:00:00Z') },
    ]);

    expect(result.deductionsMillimes).toBe(4500n);
    expect(result.netMillimes).toBe(0n);
    expect(result.carriedDebtMillimes).toBe(2500n);
  });

  it('carries a whole debt when the pay is already exhausted', () => {
    const result = buildPayslip(parcels, [
      { debtId: 'd1', remainingMillimes: 4500n, createdAt: new Date('2026-09-18T00:00:00Z') },
      { debtId: 'd2', remainingMillimes: 3000n, createdAt: new Date('2026-09-19T00:00:00Z') },
    ]);

    expect(result.netMillimes).toBe(0n);
    expect(result.carriedDebtMillimes).toBe(3000n);
    expect(result.deductions).toEqual([{ debtId: 'd1', amountMillimes: 4500n }]);
  });

  it('pays nothing for a period without a delivery', () => {
    const result = buildPayslip([], [
      { debtId: 'd1', remainingMillimes: 3000n, createdAt: new Date('2026-09-18T00:00:00Z') },
    ]);

    expect(result.grossMillimes).toBe(0n);
    expect(result.netMillimes).toBe(0n);
    expect(result.carriedDebtMillimes).toBe(3000n);
  });
});

describe('payPeriodFor', () => {
  // 2026-09-23 is a Wednesday.
  const wednesday = new Date(Date.UTC(2026, 8, 23));

  it('covers one day for a journalier plan', () => {
    const period = payPeriodFor(PayPlan.JOURNALIER, wednesday);
    expect(period.start.toISOString()).toBe('2026-09-23T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-09-23T00:00:00.000Z');
  });

  it('runs Monday to Sunday for a hebdomadaire plan (A-16)', () => {
    const period = payPeriodFor(PayPlan.HEBDOMADAIRE, wednesday);
    expect(period.start.toISOString()).toBe('2026-09-21T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-09-27T00:00:00.000Z');
  });

  it('puts a Sunday in the week that started the Monday before', () => {
    const sunday = new Date(Date.UTC(2026, 8, 27));
    const period = payPeriodFor(PayPlan.HEBDOMADAIRE, sunday);
    expect(period.start.toISOString()).toBe('2026-09-21T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-09-27T00:00:00.000Z');
  });

  it('covers the calendar month for a mensuel plan', () => {
    const period = payPeriodFor(PayPlan.MENSUEL, wednesday);
    expect(period.start.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-09-30T00:00:00.000Z');
  });

  it('handles a month boundary that crosses the year', () => {
    const period = payPeriodFor(PayPlan.MENSUEL, new Date(Date.UTC(2026, 11, 15)));
    expect(period.start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(period.end.toISOString()).toBe('2026-12-31T00:00:00.000Z');
  });
});

describe('businessDateOf', () => {
  it('keeps a late evening scan on the day the courier worked (A-12)', () => {
    // 23:40 in Tunis is 22:40 UTC on the same day.
    expect(businessDateOf(new Date('2026-09-23T22:40:00Z')).toISOString()).toBe(
      '2026-09-23T00:00:00.000Z',
    );
  });

  it('rolls over at local midnight, not at UTC midnight', () => {
    // 23:30 UTC is already 00:30 the next day in Tunis.
    expect(businessDateOf(new Date('2026-09-23T23:30:00Z')).toISOString()).toBe(
      '2026-09-24T00:00:00.000Z',
    );
  });
});

describe('isClockSkewSuspect', () => {
  const server = new Date('2026-09-23T10:00:00Z');

  it('accepts a phone whose clock is close enough', () => {
    expect(isClockSkewSuspect(new Date('2026-09-23T10:14:00Z'), server, 15)).toBe(false);
    expect(isClockSkewSuspect(new Date('2026-09-23T09:46:00Z'), server, 15)).toBe(false);
  });

  it('flags a phone whose clock is off in either direction (A-12)', () => {
    expect(isClockSkewSuspect(new Date('2026-09-23T10:16:00Z'), server, 15)).toBe(true);
    expect(isClockSkewSuspect(new Date('2026-09-22T10:00:00Z'), server, 15)).toBe(true);
  });
});
