import { describe, expect, it } from 'vitest';
import {
  canLogCall,
  changerClientSchema,
  changerDateSchema,
  isVerifyDeadlineNear,
  isVerifyDeadlinePassed,
  logCallSchema,
  relancerSchema,
  relaunchDateFromKey,
  sellerDecisionsFor,
  timeLeftLabelFR,
  verifyTimeLeftMs,
} from '../a-verifier.js';
import {
  canChangeClient,
  SCAN_REFUSAL_MESSAGES_FR,
  type ParcelSnapshot,
} from '../parcel-state-machine.js';
import { ParcelLocation, ParcelStatus, RelaunchOrigin, RelaunchSlot } from '../statuses.js';

const HOUR = 3_600_000;
const NOW = new Date('2026-09-25T10:00:00.000Z');
const LIMITS = { maxAttempts: 3, maxClientChanges: 1 };

function parcel(overrides: Partial<ParcelSnapshot> = {}): ParcelSnapshot {
  return {
    status: ParcelStatus.A_VERIFIER,
    location: ParcelLocation.AVEC_LE_LIVREUR,
    cashStatus: null,
    attemptCount: 1,
    changeClientCount: 0,
    currentLivreurId: 'l-1',
    isExchange: false,
    relaunchDate: null,
    relaunchOrigin: null,
    relaunchSlot: null,
    ...overrides,
  };
}

describe('time left before the 48-hour return', () => {
  it('counts down to the deadline', () => {
    expect(verifyTimeLeftMs(new Date(NOW.getTime() + 5 * HOUR), NOW)).toBe(5 * HOUR);
  });

  it('flags a parcel under 24 hours, not one at exactly 24 or already due', () => {
    expect(isVerifyDeadlineNear(new Date(NOW.getTime() + 23 * HOUR), NOW)).toBe(true);
    expect(isVerifyDeadlineNear(new Date(NOW.getTime() + 24 * HOUR), NOW)).toBe(false);
    expect(isVerifyDeadlineNear(NOW, NOW)).toBe(false);
  });

  it('is due at the deadline itself (D-30)', () => {
    expect(isVerifyDeadlinePassed(NOW, NOW)).toBe(true);
    expect(isVerifyDeadlinePassed(new Date(NOW.getTime() + 1), NOW)).toBe(false);
  });

  it('reads in hours and minutes, rounded down', () => {
    expect(timeLeftLabelFR(31 * HOUR + 20 * 60_000 + 59_000)).toBe('31 h 20 min');
    expect(timeLeftLabelFR(5 * HOUR + 5 * 60_000)).toBe('5 h 05 min');
    expect(timeLeftLabelFR(2 * HOUR)).toBe('2 h');
    expect(timeLeftLabelFR(45 * 60_000)).toBe('45 min');
    expect(timeLeftLabelFR(30_000)).toBe('moins d’une minute');
    expect(timeLeftLabelFR(0)).toBe('retour en cours');
  });
});

describe('Relancer (Vendeur 4.9, D-29, D-70)', () => {
  it('needs a date', () => {
    expect(relancerSchema.safeParse({}).success).toBe(false);
    expect(relancerSchema.safeParse({ date: '2026-09-26' }).success).toBe(true);
  });

  it('takes the corrections, and an empty optional field clears it', () => {
    const parsed = relancerSchema.parse({
      date: '2026-09-26',
      slot: RelaunchSlot.SOIR,
      recipientPhone: '98 123 456',
      recipientPhone2: '',
      landmark: '',
      courierNote: 'Appeler avant',
    });
    expect(parsed).toMatchObject({
      recipientPhone: '98123456',
      recipientPhone2: null,
      landmark: null,
      courierNote: 'Appeler avant',
    });
  });

  it('never takes the localité: that stays a change request (D-44)', () => {
    expect(
      relancerSchema.safeParse({ date: '2026-09-26', localiteId: crypto.randomUUID() }).success,
    ).toBe(false);
  });

  it('refuses a wrong phone', () => {
    expect(relancerSchema.safeParse({ date: '2026-09-26', recipientPhone: '123' }).success).toBe(
      false,
    );
  });

  it('reads the day as the UTC midnight the state machine compares', () => {
    expect(relaunchDateFromKey('2026-09-26').toISOString()).toBe('2026-09-26T00:00:00.000Z');
  });

  it('tells the seller what is missing in words he reads (D-29)', () => {
    expect(SCAN_REFUSAL_MESSAGES_FR.DATE_RELANCE_REQUISE).toBe(
      'Choisissez le jour de la nouvelle tentative de livraison',
    );
  });

  it('Changer la date takes a date and a slot', () => {
    expect(changerDateSchema.safeParse({ date: '2026-09-27', slot: 'MATIN' }).success).toBe(true);
    expect(changerDateSchema.safeParse({ slot: 'MATIN' }).success).toBe(false);
  });
});

describe('Changer de client (Vendeur 4.9, A-17)', () => {
  const valid = {
    recipientName: 'Nouveau Client',
    recipientPhone: '22 333 444',
    localiteId: crypto.randomUUID(),
    address: 'Rue de la Liberté 12',
    codAmountMillimes: '90,500',
  };

  it('takes a whole new customer and a new COD in millimes', () => {
    const parsed = changerClientSchema.parse(valid);
    expect(parsed.codAmountMillimes).toBe(90_500n);
    expect(parsed.recipientPhone).toBe('22333444');
    expect(parsed.isExchange).toBe(false);
  });

  it('allows a COD of zero, like a new parcel', () => {
    expect(changerClientSchema.parse({ ...valid, codAmountMillimes: '0' }).codAmountMillimes).toBe(
      0n,
    );
  });

  it('refuses a negative COD and a missing name', () => {
    expect(changerClientSchema.safeParse({ ...valid, codAmountMillimes: '-1' }).success).toBe(
      false,
    );
    expect(changerClientSchema.safeParse({ ...valid, recipientName: '' }).success).toBe(false);
  });
});

describe('what the seller can decide', () => {
  it('with the courier: Relancer, Retourner, and Changer de client at the depot', () => {
    expect(sellerDecisionsFor(parcel(), LIMITS)).toEqual({
      relancer: true,
      retourner: true,
      changerDate: false,
      changerClient: 'AU_RETOUR_DEPOT',
    });
  });

  it('back at the depot: all three', () => {
    expect(
      sellerDecisionsFor(parcel({ location: ParcelLocation.AU_DEPOT }), LIMITS).changerClient,
    ).toBe('OUI');
  });

  it('no Changer de client once used (D-8)', () => {
    expect(
      sellerDecisionsFor(
        parcel({ location: ParcelLocation.AU_DEPOT, changeClientCount: 1 }),
        LIMITS,
      ).changerClient,
    ).toBe('NON');
    expect(sellerDecisionsFor(parcel({ changeClientCount: 1 }), LIMITS).changerClient).toBe('NON');
  });

  it('Relancé: change the date, Retourner, Changer de client once at the depot (D-9)', () => {
    const relance = parcel({
      status: ParcelStatus.RELANCE,
      location: ParcelLocation.AU_DEPOT,
      relaunchOrigin: RelaunchOrigin.CLIENT,
      relaunchDate: new Date('2026-09-27T00:00:00.000Z'),
    });
    expect(sellerDecisionsFor(relance, LIMITS)).toEqual({
      relancer: false,
      retourner: true,
      changerDate: true,
      changerClient: 'OUI',
    });
    expect(canChangeClient(relance, 1)).toBe(true);
  });

  it('nothing for a parcel that is not waiting on him', () => {
    for (const status of [
      ParcelStatus.AU_DEPOT,
      ParcelStatus.LIVRE,
      ParcelStatus.RETOUR_AU_DEPOT,
    ]) {
      expect(
        sellerDecisionsFor(parcel({ status, location: ParcelLocation.AU_DEPOT }), LIMITS),
      ).toEqual({ relancer: false, retourner: false, changerDate: false, changerClient: 'NON' });
    }
  });
});

describe('Appels Faffa Go (Admin 4.6)', () => {
  it('answered or not, with an optional note', () => {
    expect(logCallSchema.safeParse({ answered: true }).success).toBe(true);
    expect(logCallSchema.safeParse({ answered: false, note: 'Rappeler à 17 h' }).success).toBe(
      true,
    );
    expect(logCallSchema.safeParse({ note: 'x' }).success).toBe(false);
    expect(logCallSchema.safeParse({ answered: true, note: 'x'.repeat(301) }).success).toBe(false);
  });

  it('from pickup until the journey ends', () => {
    expect(canLogCall(ParcelStatus.CREE)).toBe(false);
    expect(canLogCall(ParcelStatus.A_VERIFIER)).toBe(true);
    expect(canLogCall(ParcelStatus.LIVRE)).toBe(true);
    expect(canLogCall(ParcelStatus.RETOUR_RECU)).toBe(false);
    expect(canLogCall(ParcelStatus.ANNULE)).toBe(false);
  });
});
