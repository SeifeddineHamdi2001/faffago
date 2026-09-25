import { describe, expect, it } from 'vitest';
import {
  CaisseLineOrigin,
  CaisseRefusal,
  caisseCloseOutcome,
  caisseCountSchema,
  caisseDayStatus,
  caisseLineOrigin,
  closeRefusal,
  countRefusal,
  expectedBonCash,
} from '../caisse.js';
import { CaisseSessionStatus } from '../statuses.js';
import { Role } from '../roles.js';

describe('caisseLineOrigin — which Livré a session expects (D-79, A-12)', () => {
  it('takes a delivery of the session’s own business day', () => {
    expect(
      caisseLineOrigin({
        scanDay: '2026-09-25',
        sessionDay: '2026-09-25',
        scanDaySessionClosed: false,
      }),
    ).toBe(CaisseLineOrigin.JOUR);
  });

  it('takes a delivery synced after its own day was closed, as a scan tardif', () => {
    expect(
      caisseLineOrigin({
        scanDay: '2026-09-24',
        sessionDay: '2026-09-25',
        scanDaySessionClosed: true,
      }),
    ).toBe(CaisseLineOrigin.TARDIF);
  });

  it('leaves an earlier day never closed to that day’s own session', () => {
    expect(
      caisseLineOrigin({
        scanDay: '2026-09-24',
        sessionDay: '2026-09-25',
        scanDaySessionClosed: false,
      }),
    ).toBeNull();
  });

  it('never takes a delivery of a later day', () => {
    expect(
      caisseLineOrigin({
        scanDay: '2026-09-26',
        sessionDay: '2026-09-25',
        scanDaySessionClosed: true,
      }),
    ).toBeNull();
  });
});

describe('expectedBonCash — a ramasseur’s bon cash (Admin 4.9)', () => {
  it('is what he took out minus what he handed to sellers', () => {
    expect(
      expectedBonCash([
        { takenOutMillimes: 120_500n, remisMillimes: 120_500n },
        { takenOutMillimes: 88_000n, remisMillimes: 0n },
      ]),
    ).toBe(88_000n);
  });

  it('is zero with no bon', () => {
    expect(expectedBonCash([])).toBe(0n);
  });
});

describe('caisseCloseOutcome (D-79, Admin 4.9)', () => {
  it('reproduces the example of Admin 4.9: a livreur 5,000 DT short owes a debt', () => {
    const outcome = caisseCloseOutcome({
      role: Role.LIVREUR,
      expectedDeliveryMillimes: 468_000n,
      expectedBonCashMillimes: 0n,
      countedMillimes: 463_000n,
    });
    expect(outcome).toEqual({
      expectedTotalMillimes: 468_000n,
      ecartMillimes: -5_000n,
      debtMillimes: 5_000n,
      hrShortfallMillimes: 0n,
      flagged: false,
    });
  });

  it('never makes a ramasseur’s shortfall a debt: it is reported to HR', () => {
    const outcome = caisseCloseOutcome({
      role: Role.RAMASSEUR,
      expectedDeliveryMillimes: 0n,
      expectedBonCashMillimes: 200_000n,
      countedMillimes: 190_000n,
    });
    expect(outcome.debtMillimes).toBe(0n);
    expect(outcome.hrShortfallMillimes).toBe(10_000n);
    expect(outcome.ecartMillimes).toBe(-10_000n);
  });

  it('flags a surplus and credits nobody (answer 3)', () => {
    const outcome = caisseCloseOutcome({
      role: Role.LIVREUR,
      expectedDeliveryMillimes: 100_000n,
      expectedBonCashMillimes: 0n,
      countedMillimes: 101_500n,
    });
    expect(outcome).toMatchObject({ ecartMillimes: 1_500n, debtMillimes: 0n, flagged: true });
  });

  it('is conforme when the count matches', () => {
    const outcome = caisseCloseOutcome({
      role: Role.LIVREUR,
      expectedDeliveryMillimes: 85_000n,
      expectedBonCashMillimes: 0n,
      countedMillimes: 85_000n,
    });
    expect(outcome).toMatchObject({ ecartMillimes: 0n, debtMillimes: 0n, flagged: false });
  });
});

describe('countRefusal and closeRefusal', () => {
  it('lets a session be counted, and recounted, until it is closed', () => {
    expect(countRefusal(null)).toBeNull();
    expect(countRefusal(CaisseSessionStatus.OUVERTE)).toBeNull();
    expect(countRefusal(CaisseSessionStatus.COMPTEE)).toBeNull();
    expect(countRefusal(CaisseSessionStatus.CLOTUREE)).toBe(CaisseRefusal.SESSION_CLOTUREE);
  });

  it('closes only a counted session whose attendu has not moved', () => {
    expect(
      closeRefusal({
        status: CaisseSessionStatus.COMPTEE,
        countedExpectedMillimes: 85_000n,
        currentExpectedMillimes: 85_000n,
      }),
    ).toBeNull();
    expect(
      closeRefusal({
        status: CaisseSessionStatus.OUVERTE,
        countedExpectedMillimes: null,
        currentExpectedMillimes: 0n,
      }),
    ).toBe(CaisseRefusal.SESSION_NON_COMPTEE);
    expect(
      closeRefusal({
        status: CaisseSessionStatus.COMPTEE,
        countedExpectedMillimes: 85_000n,
        currentExpectedMillimes: 170_000n,
      }),
    ).toBe(CaisseRefusal.ATTENDU_MODIFIE);
    expect(
      closeRefusal({
        status: CaisseSessionStatus.CLOTUREE,
        countedExpectedMillimes: 85_000n,
        currentExpectedMillimes: 85_000n,
      }),
    ).toBe(CaisseRefusal.SESSION_CLOTUREE);
  });
});

describe('caisseDayStatus — the daily summary (answer 1)', () => {
  it('reads a courier with no session row as Ouverte', () => {
    expect(caisseDayStatus(null)).toBe(CaisseSessionStatus.OUVERTE);
    expect(caisseDayStatus(CaisseSessionStatus.COMPTEE)).toBe(CaisseSessionStatus.COMPTEE);
  });
});

describe('caisseCountSchema', () => {
  it('reads an amount typed with a comma into millimes', () => {
    expect(caisseCountSchema.parse({ counted: '463,000' })).toEqual({ countedMillimes: 463_000n });
    expect(caisseCountSchema.parse({ counted: '0' })).toEqual({ countedMillimes: 0n });
  });

  it('refuses a negative amount or a fraction of a millime', () => {
    expect(caisseCountSchema.safeParse({ counted: '-5' }).success).toBe(false);
    expect(caisseCountSchema.safeParse({ counted: '12,3456' }).success).toBe(false);
    expect(caisseCountSchema.safeParse({ counted: '' }).success).toBe(false);
  });
});
