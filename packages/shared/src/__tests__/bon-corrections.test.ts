import { describe, expect, it } from 'vitest';
import {
  BON_CORRECTION_LABEL_FR,
  BonCorrectionRefusal,
  bonRetourLineCorrection,
  bonVersementCorrection,
  correctBonSchema,
} from '../bons.js';
import { parcelWriteFor } from '../parcel-effects.js';
import {
  applyCashTransition,
  applyParcelAction,
  CashTransition,
  ParcelAction,
  ParcelEventType,
  type ParcelActionCommand,
  type ParcelSnapshot,
} from '../parcel-state-machine.js';
import { can, Permission } from '../permissions.js';
import { Role } from '../roles.js';
import { PARCEL_EVENT_LABELS_FR } from '../seller-parcels.js';
import { BonStatus, ParcelCashStatus, ParcelLocation, ParcelStatus } from '../statuses.js';

/**
 * Correcting a bon scanned Remis, or a return scanned Retour reçu, by mistake
 * (D-88): admin only, a reason, one transaction; refused once Archivé; no fee
 * changes. A bon de versement whose ramasseur's caisse is already closed is
 * explained by his surplus, and what the surplus does not cover is his
 * shortfall, for HR.
 */

describe('a bon de versement scanned Remis by mistake', () => {
  const base = {
    status: BonStatus.REMIS,
    netMillimes: 78000n,
    surplusMillimes: 0n,
    surplusAlreadyExplainedMillimes: 0n,
  };

  it('goes back En route with him while his caisse is open: nothing covered, nothing missing', () => {
    expect(bonVersementCorrection({ ...base, caisseClosed: false })).toEqual({
      ok: true,
      bonStatusAfter: BonStatus.EN_ROUTE,
      coveredBySurplusMillimes: 0n,
      shortfallMillimes: 0n,
      surplusExplained: false,
    });
  });

  it('goes back Préparé once his caisse is closed, explained by a surplus of the same amount', () => {
    expect(
      bonVersementCorrection({ ...base, caisseClosed: true, surplusMillimes: 78000n }),
    ).toEqual({
      ok: true,
      bonStatusAfter: BonStatus.PREPARE,
      coveredBySurplusMillimes: 78000n,
      shortfallMillimes: 0n,
      surplusExplained: true,
    });
  });

  it('records the whole net as his shortfall when the closed caisse had no surplus', () => {
    expect(bonVersementCorrection({ ...base, caisseClosed: true })).toMatchObject({
      ok: true,
      bonStatusAfter: BonStatus.PREPARE,
      coveredBySurplusMillimes: 0n,
      shortfallMillimes: 78000n,
      surplusExplained: false,
    });
  });

  it('records only what a smaller surplus does not cover', () => {
    expect(
      bonVersementCorrection({ ...base, caisseClosed: true, surplusMillimes: 50000n }),
    ).toMatchObject({
      coveredBySurplusMillimes: 50000n,
      shortfallMillimes: 28000n,
      surplusExplained: true,
    });
  });

  it('leaves the rest of a larger surplus unexplained, for the admin to check', () => {
    expect(
      bonVersementCorrection({ ...base, caisseClosed: true, surplusMillimes: 100000n }),
    ).toMatchObject({
      coveredBySurplusMillimes: 78000n,
      shortfallMillimes: 0n,
      surplusExplained: false,
    });
  });

  it('never uses the same surplus twice for two bons of the same caisse', () => {
    expect(
      bonVersementCorrection({
        ...base,
        caisseClosed: true,
        surplusMillimes: 100000n,
        surplusAlreadyExplainedMillimes: 78000n,
      }),
    ).toMatchObject({
      coveredBySurplusMillimes: 22000n,
      shortfallMillimes: 56000n,
      surplusExplained: true,
    });
  });

  it('is refused once Archivé: the signed copy proves the seller received it', () => {
    expect(
      bonVersementCorrection({ ...base, status: BonStatus.ARCHIVE, caisseClosed: true }),
    ).toEqual({ ok: false, refusal: BonCorrectionRefusal.BON_ARCHIVE });
  });

  it('is refused for a bon that was never Remis', () => {
    for (const status of [BonStatus.PREPARE, BonStatus.EN_ROUTE, BonStatus.ANNULE]) {
      expect(bonVersementCorrection({ ...base, status, caisseClosed: false })).toEqual({
        ok: false,
        refusal: BonCorrectionRefusal.BON_NON_REMIS,
      });
    }
  });
});

describe('a return line scanned Retour reçu by mistake', () => {
  const base = { lineReceived: true, sameCarrier: true };

  it('goes back with the ramasseur, the bon En route, while his caisse is open', () => {
    for (const status of [BonStatus.REMIS, BonStatus.EN_ROUTE]) {
      expect(bonRetourLineCorrection({ ...base, bonStatus: status, caisseClosed: false })).toEqual({
        ok: true,
        parcelTo: 'RAMASSEUR',
        bonStatusAfter: BonStatus.EN_ROUTE,
      });
    }
  });

  it('goes back to the depot, the bon Préparé, once his caisse is closed', () => {
    for (const status of [BonStatus.REMIS, BonStatus.PREPARE]) {
      expect(bonRetourLineCorrection({ ...base, bonStatus: status, caisseClosed: true })).toEqual({
        ok: true,
        parcelTo: 'DEPOT',
        bonStatusAfter: BonStatus.PREPARE,
      });
    }
  });

  it('is refused while the bon is out again on another trip', () => {
    expect(
      bonRetourLineCorrection({
        ...base,
        bonStatus: BonStatus.EN_ROUTE,
        caisseClosed: true,
      }),
    ).toEqual({ ok: false, refusal: BonCorrectionRefusal.BON_REPARTI });
    expect(
      bonRetourLineCorrection({
        ...base,
        bonStatus: BonStatus.EN_ROUTE,
        caisseClosed: false,
        sameCarrier: false,
      }),
    ).toEqual({ ok: false, refusal: BonCorrectionRefusal.BON_REPARTI });
  });

  it('is refused once Archivé, and for a line never received', () => {
    expect(
      bonRetourLineCorrection({ ...base, bonStatus: BonStatus.ARCHIVE, caisseClosed: true }),
    ).toEqual({ ok: false, refusal: BonCorrectionRefusal.BON_ARCHIVE });
    expect(
      bonRetourLineCorrection({
        ...base,
        lineReceived: false,
        bonStatus: BonStatus.EN_ROUTE,
        caisseClosed: false,
      }),
    ).toEqual({ ok: false, refusal: BonCorrectionRefusal.LIGNE_NON_RECUE });
  });
});

describe('the parcel of a corrected return (the transition out of Retour reçu)', () => {
  const received: ParcelSnapshot = {
    status: ParcelStatus.RETOUR_RECU,
    location: ParcelLocation.RENDU_AU_VENDEUR,
    cashStatus: null,
    attemptCount: 1,
    changeClientCount: 0,
    currentLivreurId: null,
    isExchange: false,
    relaunchDate: null,
    relaunchOrigin: null,
    relaunchSlot: null,
  };
  const command = (overrides: Partial<ParcelActionCommand> = {}): ParcelActionCommand => ({
    action: ParcelAction.CORRECTION_RETOUR_RECU,
    actor: Role.ADMIN,
    correctionTo: 'RAMASSEUR',
    maxAttempts: 3,
    maxClientChanges: 1,
    ...overrides,
  });

  it('goes back Retour en route with the ramasseur, one CORRECTION_BON event, no effect', () => {
    const result = applyParcelAction(received, command());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.next).toMatchObject({
      status: ParcelStatus.RETOUR_EN_ROUTE,
      location: ParcelLocation.AVEC_LE_RAMASSEUR,
    });
    expect(result.events).toEqual([
      expect.objectContaining({
        type: ParcelEventType.CORRECTION_BON,
        previousStatus: ParcelStatus.RETOUR_RECU,
        newStatus: ParcelStatus.RETOUR_EN_ROUTE,
        effects: [],
      }),
    ]);
    // Reopened, and no fee: the return fee was charged when the return was decided.
    const write = parcelWriteFor(result, {
      now: new Date('2026-09-25T10:00:00Z'),
      verifyDeadlineHours: 48,
      courierRatePerParcelMillimes: 3500n,
      fees: {
        deliveryFeeMillimes: 7000n,
        returnFeeMillimes: 4500n,
        changeClientFeeMillimes: 1000n,
      },
      failureReason: null,
      failureNote: null,
    });
    expect(write.columns.closedAt).toBeNull();
    expect(write.charges).toEqual([]);
  });

  it('goes back Retour au dépôt, at the depot, when his caisse is closed', () => {
    const result = applyParcelAction(received, command({ correctionTo: 'DEPOT' }));
    expect(result.ok && result.next).toMatchObject({
      status: ParcelStatus.RETOUR_AU_DEPOT,
      location: ParcelLocation.AU_DEPOT,
    });
  });

  it('is the admin’s alone, and only out of Retour reçu, with a destination', () => {
    for (const actor of [Role.DEPOT, Role.RAMASSEUR, Role.VENDEUR, Role.SERVICE_CLIENT]) {
      expect(applyParcelAction(received, command({ actor })).ok).toBe(false);
    }
    const enRoute = {
      ...received,
      status: ParcelStatus.RETOUR_EN_ROUTE,
      location: ParcelLocation.AVEC_LE_RAMASSEUR,
    };
    expect(applyParcelAction(enRoute, command()).ok).toBe(false);
    expect(applyParcelAction(received, command({ correctionTo: undefined })).ok).toBe(false);
  });
});

describe('the cash of a corrected bon de versement', () => {
  it('goes from Payé back to Au dépôt', () => {
    const paid: ParcelSnapshot = {
      status: ParcelStatus.LIVRE,
      location: ParcelLocation.CHEZ_LE_CLIENT,
      cashStatus: ParcelCashStatus.PAYE,
      attemptCount: 1,
      changeClientCount: 0,
      currentLivreurId: null,
      isExchange: false,
      relaunchDate: null,
      relaunchOrigin: null,
      relaunchSlot: null,
    };
    expect(applyCashTransition(paid, CashTransition.BON_CORRIGE)).toBe(ParcelCashStatus.AU_DEPOT);
    expect(
      applyCashTransition(
        { ...paid, cashStatus: ParcelCashStatus.AU_DEPOT },
        CashTransition.BON_CORRIGE,
      ),
    ).toBe(ParcelCashStatus.AU_DEPOT);
  });
});

describe('who corrects, why, and what the seller reads', () => {
  it('is the admin alone', () => {
    expect(can(Role.ADMIN, Permission.CORRIGER_BON)).toBe(true);
    for (const role of [Role.DEPOT, Role.SERVICE_CLIENT, Role.VENDEUR, Role.RAMASSEUR]) {
      expect(can(role, Permission.CORRIGER_BON)).toBe(false);
    }
  });

  it('requires a reason', () => {
    expect(correctBonSchema.safeParse({ reason: '' }).success).toBe(false);
    expect(correctBonSchema.safeParse({ reason: '  ok ' }).success).toBe(false);
    expect(correctBonSchema.parse({ reason: '  Vendeur absent, scan par erreur ' })).toEqual({
      reason: 'Vendeur absent, scan par erreur',
    });
  });

  it('shows the seller "Correction Faffa Go", on his bon and his parcel’s timeline', () => {
    expect(BON_CORRECTION_LABEL_FR).toBe('Correction Faffa Go');
    expect(PARCEL_EVENT_LABELS_FR.CORRECTION_BON).toBe('Correction Faffa Go');
  });
});
