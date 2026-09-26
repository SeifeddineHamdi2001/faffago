import { describe, expect, it } from 'vitest';
import { aRecevoirOf, deliveryRateBps, formatDeliveryRate } from '../seller-money.js';
import { ChargeType, ParcelCashStatus } from '../statuses.js';

describe('aRecevoirOf — À recevoir (Vendeur 4.1, D-83)', () => {
  it('is COD minus the frozen delivery fee, split chez les coursiers / au dépôt', () => {
    const result = aRecevoirOf(
      [
        {
          cashStatus: ParcelCashStatus.CHEZ_LE_COURSIER,
          codAmountMillimes: 85_000n,
          deliveryFeeMillimes: 7_000n,
        },
        {
          cashStatus: ParcelCashStatus.AU_DEPOT,
          codAmountMillimes: 40_000n,
          deliveryFeeMillimes: 5_500n,
        },
      ],
      [
        { type: ChargeType.RAMASSAGE, amountMillimes: 2_000n },
        { type: ChargeType.CHANGEMENT_CLIENT, amountMillimes: 1_000n },
      ],
    );
    expect(result).toEqual({
      parcelCount: 2,
      chezLesCoursiersMillimes: 78_000n,
      auDepotMillimes: 34_500n,
      totalMillimes: 112_500n,
      fraisADeduireMillimes: 3_000n,
      codMillimes: 125_000n,
      fraisLivraisonMillimes: 12_500n,
      fraisRetourMillimes: 0n,
      fraisChangementClientMillimes: 1_000n,
      fraisRamassageMillimes: 2_000n,
      netMillimes: 109_500n,
    });
  });

  it('takes every waiting fee off the net, by type', () => {
    const result = aRecevoirOf(
      [
        {
          cashStatus: ParcelCashStatus.AU_DEPOT,
          codAmountMillimes: 50_000n,
          deliveryFeeMillimes: 7_000n,
        },
      ],
      [
        { type: ChargeType.RETOUR, amountMillimes: 4_000n },
        { type: ChargeType.RETOUR, amountMillimes: 4_000n },
        { type: ChargeType.RAMASSAGE, amountMillimes: 2_000n },
      ],
    );
    expect(result.codMillimes).toBe(50_000n);
    expect(result.fraisLivraisonMillimes).toBe(7_000n);
    expect(result.fraisRetourMillimes).toBe(8_000n);
    expect(result.fraisRamassageMillimes).toBe(2_000n);
    expect(result.fraisChangementClientMillimes).toBe(0n);
    expect(result.netMillimes).toBe(33_000n);
  });

  it('can go below zero when the fees are more than the cash', () => {
    const result = aRecevoirOf([], [{ type: ChargeType.RETOUR, amountMillimes: 4_000n }]);
    expect(result.netMillimes).toBe(-4_000n);
  });

  it('leaves paid parcels out', () => {
    const result = aRecevoirOf(
      [
        {
          cashStatus: ParcelCashStatus.PAYE,
          codAmountMillimes: 85_000n,
          deliveryFeeMillimes: 7_000n,
        },
      ],
      [],
    );
    expect(result.totalMillimes).toBe(0n);
    expect(result.parcelCount).toBe(0);
  });
});

describe('deliveryRateBps — Taux de livraison (Vendeur 4.1, D-24, D-83)', () => {
  it('is livrés ÷ (livrés + retournés), in basis points rounded half up', () => {
    expect(deliveryRateBps(9, 1)).toBe(9000);
    expect(deliveryRateBps(2, 1)).toBe(6667);
    expect(deliveryRateBps(1, 2)).toBe(3333);
    expect(deliveryRateBps(5, 0)).toBe(10_000);
  });

  it('has nothing to show without an outcome', () => {
    expect(deliveryRateBps(0, 0)).toBeNull();
    expect(formatDeliveryRate(null)).toBe('—');
  });

  it('reads as a percentage with the comma', () => {
    expect(formatDeliveryRate(6667)).toBe('66,67 %');
    expect(formatDeliveryRate(9000)).toBe('90 %');
  });
});
