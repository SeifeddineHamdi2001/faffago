import { describe, expect, it } from 'vitest';
import { parcelWriteFor, type ParcelEffectContext } from '../parcel-effects.js';
import {
  applyParcelAction,
  ParcelAction,
  type ParcelActionCommand,
  type ParcelSnapshot,
  type ParcelTransition,
} from '../parcel-state-machine.js';
import { Role, SYSTEM_ACTOR } from '../roles.js';
import { DEFAULT_SETTINGS } from '../settings.js';
import {
  ChargeType,
  FailureReason,
  ParcelCashStatus,
  ParcelLocation,
  ParcelStatus,
  RelaunchSlot,
} from '../statuses.js';

const LIVREUR_ID = 'livreur-1';
const NOW = new Date('2026-09-24T09:30:00.000Z');
const TODAY = new Date('2026-09-24T00:00:00.000Z');

/**
 * Fees deliberately different from the current settings: a charge must copy
 * the parcel's frozen fee, never the rate in Paramètres today (CLAUDE.md).
 */
const FROZEN = {
  deliveryFeeMillimes: 7000n,
  returnFeeMillimes: 4500n,
  changeClientFeeMillimes: 1500n,
};

function ctx(overrides: Partial<ParcelEffectContext> = {}): ParcelEffectContext {
  return {
    now: NOW,
    verifyDeadlineHours: 48,
    courierRatePerParcelMillimes: 3500n,
    fees: FROZEN,
    failureReason: null,
    failureNote: null,
    ...overrides,
  };
}

function parcel(overrides: Partial<ParcelSnapshot> = {}): ParcelSnapshot {
  return {
    status: ParcelStatus.CREE,
    location: ParcelLocation.CHEZ_LE_VENDEUR,
    cashStatus: null,
    attemptCount: 0,
    changeClientCount: 0,
    currentLivreurId: null,
    isExchange: false,
    relaunchDate: null,
    relaunchOrigin: null,
    relaunchSlot: null,
    ...overrides,
  };
}

const outForDelivery = (overrides: Partial<ParcelSnapshot> = {}) =>
  parcel({
    status: ParcelStatus.EN_LIVRAISON,
    location: ParcelLocation.AVEC_LE_LIVREUR,
    currentLivreurId: LIVREUR_ID,
    ...overrides,
  });

function run(
  before: ParcelSnapshot,
  action: ParcelAction,
  overrides: Partial<ParcelActionCommand> = {},
) {
  const actors: Partial<Record<ParcelAction, ParcelActionCommand['actor']>> = {
    SCAN_RAMASSAGE: Role.RAMASSEUR,
    SCAN_ENTREE_DEPOT: Role.DEPOT,
    SCAN_SORTIE_COURSIER: Role.DEPOT,
    SCAN_LIVRE: Role.LIVREUR,
    SCAN_ECHEC: Role.LIVREUR,
    SCAN_RETOUR_DE_TOURNEE: Role.DEPOT,
    SCAN_RETOUR_RECU: Role.RAMASSEUR,
    DEPART_RETOUR: Role.DEPOT,
    AUTO_RETOUR_48H: SYSTEM_ACTOR,
  };
  const result: ParcelTransition = applyParcelAction(before, {
    action,
    actor: actors[action] ?? Role.VENDEUR,
    actorCourierId: LIVREUR_ID,
    today: TODAY,
    maxAttempts: 3,
    maxClientChanges: 1,
    ...overrides,
  });
  if (!result.ok) throw new Error(`Refusé : ${result.message}`);
  return result;
}

describe('the state columns come from the machine', () => {
  it('copies the next snapshot as it is', () => {
    const transition = run(
      parcel({ status: ParcelStatus.AU_DEPOT, location: ParcelLocation.AU_DEPOT }),
      ParcelAction.SCAN_SORTIE_COURSIER,
      {
        assignToCourierId: LIVREUR_ID,
      },
    );
    const { columns, charges } = parcelWriteFor(transition, ctx());
    expect(columns).toMatchObject({
      status: ParcelStatus.EN_LIVRAISON,
      location: ParcelLocation.AVEC_LE_LIVREUR,
      currentLivreurId: LIVREUR_ID,
      attemptCount: 0,
    });
    // Opening the chat writes nothing to the parcel (phase 10, Q15).
    expect(charges).toEqual([]);
    expect(columns.verifyDeadlineAt).toBeUndefined();
  });
});

describe('delivery (A-1, A-15)', () => {
  it('charges the parcel’s frozen delivery fee, not today’s setting', () => {
    const { columns, charges } = parcelWriteFor(
      run(outForDelivery(), ParcelAction.SCAN_LIVRE),
      ctx(),
    );
    expect(charges).toEqual([{ type: ChargeType.LIVRAISON, amountMillimes: 7000n }]);
    expect(charges[0]?.amountMillimes).not.toBe(DEFAULT_SETTINGS.deliveryFeeMillimes);
    expect(columns.cashStatus).toBe(ParcelCashStatus.CHEZ_LE_COURSIER);
    expect(columns.deliveredAt).toEqual(NOW);
  });

  it('freezes the livreur rate from the setting at the moment of delivery', () => {
    const { columns } = parcelWriteFor(
      run(outForDelivery(), ParcelAction.SCAN_LIVRE),
      ctx({ courierRatePerParcelMillimes: 4200n }),
    );
    expect(columns.courierRateMillimes).toBe(4200n);
  });

  it('does not close the parcel: that waits for the cash to be paid (D-24)', () => {
    const { columns } = parcelWriteFor(run(outForDelivery(), ParcelAction.SCAN_LIVRE), ctx());
    expect(columns.closedAt).toBeUndefined();
  });

  it('records the old item of an échange as a return in the livreur’s hands (D-23)', () => {
    const { columns, charges } = parcelWriteFor(
      run(outForDelivery({ isExchange: true }), ParcelAction.SCAN_LIVRE),
      ctx(),
    );
    expect(columns.exchangeItemCollected).toBe(true);
    expect(columns.exchangeItemStatus).toBe(ParcelStatus.RETOUR_AU_DEPOT);
    // One delivery fee and nothing for the recovered item (A-10).
    expect(charges).toEqual([{ type: ChargeType.LIVRAISON, amountMillimes: 7000n }]);
  });

  it('leaves the échange columns alone on an ordinary parcel', () => {
    const { columns } = parcelWriteFor(run(outForDelivery(), ParcelAction.SCAN_LIVRE), ctx());
    expect(columns.exchangeItemCollected).toBeUndefined();
    expect(columns.exchangeItemStatus).toBeUndefined();
  });
});

describe('a failed delivery', () => {
  it('starts the 48-hour clock from the time the failure is recorded', () => {
    const { columns, charges } = parcelWriteFor(
      run(outForDelivery(), ParcelAction.SCAN_ECHEC, {
        failureReason: FailureReason.NE_REPOND_PAS,
      }),
      ctx({ failureReason: FailureReason.NE_REPOND_PAS, failureNote: 'Sonné 3 fois' }),
    );
    expect(columns.status).toBe(ParcelStatus.A_VERIFIER);
    expect(columns.verifyDeadlineAt).toEqual(new Date('2026-09-26T09:30:00.000Z'));
    expect(columns.lastFailureReason).toBe(FailureReason.NE_REPOND_PAS);
    expect(columns.lastFailureNote).toBe('Sonné 3 fois');
    expect(charges).toEqual([]);
  });

  it('follows the deadline set in Paramètres', () => {
    const { columns } = parcelWriteFor(
      run(outForDelivery(), ParcelAction.SCAN_ECHEC, { failureReason: FailureReason.REFUSE }),
      ctx({ verifyDeadlineHours: 24, failureReason: FailureReason.REFUSE }),
    );
    expect(columns.verifyDeadlineAt).toEqual(new Date('2026-09-25T09:30:00.000Z'));
  });

  it('starts no clock for a customer postponement (D-9)', () => {
    const postponedTo = new Date('2026-09-26T00:00:00.000Z');
    const { columns } = parcelWriteFor(
      run(outForDelivery(), ParcelAction.SCAN_ECHEC, {
        failureReason: FailureReason.REPORTE_PAR_LE_CLIENT,
        postponedTo,
        relaunchSlot: RelaunchSlot.SOIR,
      }),
      ctx({ failureReason: FailureReason.REPORTE_PAR_LE_CLIENT }),
    );
    expect(columns.status).toBe(ParcelStatus.RELANCE);
    expect(columns.verifyDeadlineAt).toBeUndefined();
    expect(columns.relaunchDate).toEqual(postponedTo);
    expect(columns.relaunchSlot).toBe(RelaunchSlot.SOIR);
    expect(columns.lastFailureReason).toBe(FailureReason.REPORTE_PAR_LE_CLIENT);
  });

  it('on the third attempt, charges exactly one return fee and starts no clock', () => {
    const { columns, charges } = parcelWriteFor(
      run(outForDelivery({ attemptCount: 2 }), ParcelAction.SCAN_ECHEC, {
        failureReason: FailureReason.INJOIGNABLE,
      }),
      ctx({ failureReason: FailureReason.INJOIGNABLE }),
    );
    expect(columns.status).toBe(ParcelStatus.RETOUR_AU_DEPOT);
    expect(columns.verifyDeadlineAt).toBeUndefined();
    expect(charges).toEqual([{ type: ChargeType.RETOUR, amountMillimes: 4500n }]);
  });
});

describe('decisions and automatic returns', () => {
  const verifying = parcel({
    status: ParcelStatus.A_VERIFIER,
    location: ParcelLocation.AU_DEPOT,
    attemptCount: 1,
  });

  it('Relancer stops the clock and charges nothing', () => {
    const { columns, charges } = parcelWriteFor(
      run(verifying, ParcelAction.DECISION_RELANCER, {
        postponedTo: new Date('2026-09-25T00:00:00.000Z'),
      }),
      ctx(),
    );
    expect(columns.verifyDeadlineAt).toBeNull();
    expect(charges).toEqual([]);
  });

  it('Retourner stops the clock and charges the frozen return fee (A-7)', () => {
    const { columns, charges } = parcelWriteFor(
      run(verifying, ParcelAction.DECISION_RETOURNER),
      ctx(),
    );
    expect(columns.verifyDeadlineAt).toBeNull();
    expect(charges).toEqual([{ type: ChargeType.RETOUR, amountMillimes: 4500n }]);
  });

  it('the 48-hour return does the same', () => {
    const { columns, charges } = parcelWriteFor(
      run(verifying, ParcelAction.AUTO_RETOUR_48H),
      ctx(),
    );
    expect(columns.verifyDeadlineAt).toBeNull();
    expect(charges).toEqual([{ type: ChargeType.RETOUR, amountMillimes: 4500n }]);
  });

  it('Changer de client charges the frozen change-client fee and resets the attempts', () => {
    const { columns, charges } = parcelWriteFor(
      run(verifying, ParcelAction.DECISION_CHANGER_CLIENT),
      ctx(),
    );
    expect(columns.attemptCount).toBe(0);
    expect(columns.changeClientCount).toBe(1);
    expect(columns.verifyDeadlineAt).toBeNull();
    expect(charges).toEqual([{ type: ChargeType.CHANGEMENT_CLIENT, amountMillimes: 1500n }]);
  });
});

describe('timestamps', () => {
  it('stamps the pickup', () => {
    const { columns } = parcelWriteFor(run(parcel(), ParcelAction.SCAN_RAMASSAGE), ctx());
    expect(columns.pickedUpAt).toEqual(NOW);
  });

  it('closes a parcel cancelled before pickup, with no fee', () => {
    const { columns, charges } = parcelWriteFor(run(parcel(), ParcelAction.ANNULER), ctx());
    expect(columns.cancelledAt).toEqual(NOW);
    expect(columns.closedAt).toEqual(NOW);
    expect(charges).toEqual([]);
  });

  it('does not close a parcel cancelled after pickup: it still has to go back (D-24, D-28)', () => {
    const { columns, charges } = parcelWriteFor(
      run(
        parcel({ status: ParcelStatus.AU_DEPOT, location: ParcelLocation.AU_DEPOT }),
        ParcelAction.ANNULER,
      ),
      ctx(),
    );
    expect(columns.status).toBe(ParcelStatus.RETOUR_AU_DEPOT);
    expect(columns.cancelledAt).toEqual(NOW);
    expect(columns.closedAt).toBeUndefined();
    expect(columns.verifyDeadlineAt).toBeNull();
    expect(charges).toEqual([{ type: ChargeType.RETOUR, amountMillimes: 4500n }]);
  });

  it('closes the parcel when the return is received', () => {
    const { columns } = parcelWriteFor(
      run(
        parcel({
          status: ParcelStatus.RETOUR_EN_ROUTE,
          location: ParcelLocation.AVEC_LE_RAMASSEUR,
        }),
        ParcelAction.SCAN_RETOUR_RECU,
      ),
      ctx(),
    );
    expect(columns.closedAt).toEqual(NOW);
  });
});
