import { describe, expect, it } from 'vitest';
import {
  RETENUE_CERTIFICATES,
  RetenueRefusal,
  cinNumberSchema,
  formatRetenueCertificateNumber,
  monthKeyOf,
  retenueLines,
  retenueTotals,
  societeComplete,
  yearKeyOf,
  type RetenueCertificateFacts,
} from '../retenue.js';
import { SellerStatut } from '../statuses.js';

/**
 * Retenue à la source certificates and the monthly report (D-89): the month
 * is the month of Remis; a correction never changes a past month, it shows
 * as a régularisation in the month it happens.
 */

function cert(overrides: Partial<RetenueCertificateFacts>): RetenueCertificateFacts {
  return {
    id: 'c1',
    number: 'RS-2026-0001',
    sellerId: 's1',
    bonVersementId: 'b1',
    // 10:00 in Tunis on 15 September.
    issuedAt: new Date('2026-09-15T09:00:00Z'),
    cancelledAt: null,
    baseMillimes: 151000n,
    rateBps: 300,
    amountMillimes: 4530n,
    ...overrides,
  };
}

describe('numbers and identity', () => {
  it('numbers a certificate RS-AAAA-NNNN, one sequence per year', () => {
    expect(formatRetenueCertificateNumber(2026, 1)).toBe('RS-2026-0001');
    expect(formatRetenueCertificateNumber(2027, 1234)).toBe('RS-2027-1234');
  });

  it('keeps both kinds of certificate on until the accountant chooses (TO CONFIRM)', () => {
    expect(RETENUE_CERTIFICATES).toEqual({ PAR_BON: true, ANNUEL: true });
  });

  it('reads a CIN number: 8 digits', () => {
    expect(cinNumberSchema.parse(' 01234567 ')).toBe('01234567');
    expect(cinNumberSchema.safeParse('1234567').success).toBe(false);
    expect(cinNumberSchema.safeParse('A1234567').success).toBe(false);
  });

  it('needs the whole Société block before any certificate', () => {
    const full = {
      raisonSociale: 'Faffa Go SARL',
      matriculeFiscal: '1234567/A/M/000',
      adresse: 'Tunis',
    };
    expect(societeComplete(full)).toBe(true);
    expect(societeComplete({ ...full, matriculeFiscal: '  ' })).toBe(false);
    expect(RetenueRefusal.SOCIETE_INCOMPLETE).toBe('SOCIETE_INCOMPLETE');
    expect(SellerStatut.CIN_UNIQUEMENT).toBe('CIN_UNIQUEMENT');
  });
});

describe('the month of a retenue (D-89)', () => {
  it('is the Tunis month of the Remis', () => {
    // 23:30 UTC on 30 September is already 1 October in Tunis.
    expect(monthKeyOf(new Date('2026-09-30T23:30:00Z'))).toBe('2026-10');
    expect(yearKeyOf(new Date('2026-12-31T23:30:00Z'))).toBe('2027');
  });

  it('counts a certificate in its month, with its base and amount', () => {
    const lines = retenueLines([cert({})], '2026-09', monthKeyOf);
    expect(lines).toEqual([
      expect.objectContaining({
        kind: 'RETENUE',
        number: 'RS-2026-0001',
        signedBaseMillimes: 151000n,
        signedAmountMillimes: 4530n,
      }),
    ]);
    expect(retenueLines([cert({})], '2026-10', monthKeyOf)).toEqual([]);
  });

  it('leaves a past month as it was when its bon is corrected later', () => {
    const corrected = cert({ cancelledAt: new Date('2026-10-02T09:00:00Z') });
    expect(retenueLines([corrected], '2026-09', monthKeyOf)).toEqual([
      expect.objectContaining({ kind: 'RETENUE', signedAmountMillimes: 4530n }),
    ]);
  });

  it('shows the correction as a régularisation in the month it happens', () => {
    const corrected = cert({ cancelledAt: new Date('2026-10-02T09:00:00Z') });
    const reissued = cert({
      id: 'c2',
      number: 'RS-2026-0007',
      issuedAt: new Date('2026-10-05T09:00:00Z'),
    });
    const october = retenueLines([corrected, reissued], '2026-10', monthKeyOf);
    expect(october.map((line) => [line.kind, line.number, line.signedAmountMillimes])).toEqual([
      ['REGULARISATION', 'RS-2026-0001', -4530n],
      ['RETENUE', 'RS-2026-0007', 4530n],
    ]);
    expect(retenueTotals(october)).toEqual({
      count: 1,
      baseMillimes: 0n,
      amountMillimes: 0n,
    });
  });

  it('drops a certificate issued and cancelled within the same month', () => {
    const sameMonth = cert({ cancelledAt: new Date('2026-09-20T09:00:00Z') });
    expect(retenueLines([sameMonth], '2026-09', monthKeyOf)).toEqual([]);
  });

  it('builds the yearly summary with the same rule', () => {
    const lastYear = cert({
      issuedAt: new Date('2025-12-20T09:00:00Z'),
      cancelledAt: new Date('2026-01-03T09:00:00Z'),
    });
    expect(retenueTotals(retenueLines([lastYear], '2025', yearKeyOf)).amountMillimes).toBe(4530n);
    expect(retenueTotals(retenueLines([lastYear], '2026', yearKeyOf)).amountMillimes).toBe(-4530n);
  });
});
