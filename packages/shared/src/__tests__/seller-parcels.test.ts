import { describe, expect, it } from 'vitest';
import { ParcelEventType } from '../parcel-state-machine.js';
import {
  PARCEL_EVENT_LABELS_FR,
  PARCEL_GROUP_LABELS_FR,
  PARCEL_SUB_GROUPS,
  PARCEL_TOP_GROUPS,
  ParcelGroup,
  groupNeedsAttention,
  isInGroup,
  topGroupOf,
  parcelListQuerySchema,
  parcelMoneyFor,
  sellerTimelineTime,
  timelineActorLabel,
  trackLineFor,
} from '../seller-parcels.js';
import { ParcelCashStatus, ParcelStatus } from '../statuses.js';

describe('status groups (Vendeur 4.7)', () => {
  const every = Object.values(ParcelStatus);

  it('puts each status in its group, Annulé under Tous only', () => {
    const groupsOf = (status: ParcelStatus, cash: ParcelCashStatus | null = null) =>
      Object.values(ParcelGroup).filter((g) => isInGroup(g, { status, cashStatus: cash }));
    expect(groupsOf('A_VERIFIER')).toEqual(['TOUS', 'A_VERIFIER']);
    expect(groupsOf('CREE')).toEqual(['TOUS', 'EN_COURS']);
    expect(groupsOf('RELANCE')).toEqual(['TOUS', 'EN_COURS']);
    expect(groupsOf('LIVRE', 'CHEZ_LE_COURSIER')).toEqual(['TOUS', 'LIVRES', 'NON_PAYES']);
    expect(groupsOf('LIVRE', 'AU_DEPOT')).toEqual(['TOUS', 'LIVRES', 'NON_PAYES']);
    expect(groupsOf('LIVRE', 'PAYE')).toEqual(['TOUS', 'LIVRES', 'PAYES']);
    expect(groupsOf('RETOUR_EN_ROUTE')).toEqual(['TOUS', 'RETOURS']);
    expect(groupsOf('ANNULE')).toEqual(['TOUS']);
  });

  it('shows Tous, À vérifier, En cours, Livrés, Retours, in that order (D-46)', () => {
    expect(PARCEL_TOP_GROUPS.map((g) => PARCEL_GROUP_LABELS_FR[g])).toEqual([
      'Tous',
      'À vérifier',
      'En cours',
      'Livrés',
      'Retours',
    ]);
  });

  it('splits Livrés into Payés and Non payés, which together make all of it', () => {
    expect(PARCEL_SUB_GROUPS.LIVRES).toEqual(['PAYES', 'NON_PAYES']);
    expect(topGroupOf('PAYES')).toBe('LIVRES');
    expect(topGroupOf('NON_PAYES')).toBe('LIVRES');
    expect(topGroupOf('RETOURS')).toBe('RETOURS');
    for (const cash of Object.values(ParcelCashStatus)) {
      const inSubs = PARCEL_SUB_GROUPS.LIVRES!.filter((g) =>
        isInGroup(g, { status: 'LIVRE', cashStatus: cash }),
      );
      expect(inSubs).toHaveLength(1);
    }
  });

  it('highlights À vérifier only when a parcel waits for a decision', () => {
    expect(groupNeedsAttention('A_VERIFIER', 2)).toBe(true);
    expect(groupNeedsAttention('A_VERIFIER', 0)).toBe(false);
    expect(groupNeedsAttention('EN_COURS', 5)).toBe(false);
  });

  it('leaves no status out of Tous', () => {
    for (const status of every) expect(isInGroup('TOUS', { status, cashStatus: null })).toBe(true);
  });
});

describe('the list query', () => {
  it('defaults to Tous, page 1', () => {
    expect(parcelListQuerySchema.parse({})).toEqual({ group: 'TOUS', page: 1 });
  });

  it('refuses a range that ends before it starts, and a malformed date', () => {
    expect(parcelListQuerySchema.safeParse({ from: '2026-09-24', to: '2026-09-01' }).success).toBe(
      false,
    );
    expect(parcelListQuerySchema.safeParse({ from: '24/09/2026' }).success).toBe(false);
    expect(parcelListQuerySchema.safeParse({ group: 'PERDUS' }).success).toBe(false);
  });
});

describe('the track line (Vendeur 4.8, 4.12)', () => {
  const states = (status: ParcelStatus) => trackLineFor(status).steps.map((s) => s.state);

  it('follows the delivery flow', () => {
    expect(trackLineFor('CREE').steps.map((s) => s.label)).toEqual([
      'Créé',
      'Ramassé',
      'Au dépôt',
      'En livraison',
      'Livré',
    ]);
    expect(states('AU_DEPOT')).toEqual(['FAIT', 'FAIT', 'ACTUEL', 'A_VENIR', 'A_VENIR']);
    expect(states('LIVRE')).toEqual(['FAIT', 'FAIT', 'FAIT', 'FAIT', 'FAIT']);
  });

  it('flags a failure or a relance at En livraison', () => {
    expect(trackLineFor('A_VERIFIER')).toMatchObject({ flow: 'LIVRAISON', attention: true });
    expect(states('RELANCE')[3]).toBe('ACTUEL');
  });

  it('switches to the return flow once the parcel is a return', () => {
    expect(trackLineFor('RETOUR_EN_ROUTE')).toMatchObject({ flow: 'RETOUR' });
    expect(states('RETOUR_EN_ROUTE')).toEqual(['FAIT', 'FAIT', 'ACTUEL', 'A_VENIR']);
    expect(states('RETOUR_RECU')).toEqual(['FAIT', 'FAIT', 'FAIT', 'FAIT']);
  });

  it('marks a cancellation before pickup', () => {
    expect(trackLineFor('ANNULE')).toMatchObject({ cancelled: true });
  });

  it('draws a line for every status', () => {
    for (const status of Object.values(ParcelStatus)) {
      expect(trackLineFor(status).steps.length).toBeGreaterThan(0);
    }
  });
});

describe('the timeline (D-38)', () => {
  it('words every event type', () => {
    for (const type of Object.values(ParcelEventType)) {
      expect(PARCEL_EVENT_LABELS_FR[type]).toBeTruthy();
    }
  });

  it('names the seller "Vous", a courier by first name, and the team "Faffa Go"', () => {
    expect(timelineActorLabel({ kind: 'VOUS' })).toBe('Vous');
    expect(timelineActorLabel({ kind: 'COURSIER', firstName: 'Oussama' })).toBe('Oussama');
    expect(timelineActorLabel({ kind: 'FAFFA_GO' })).toBe('Faffa Go');
  });
});

describe('the money block (D-40)', () => {
  const parcel = {
    codAmountMillimes: 85000n,
    deliveryFeeMillimes: 5500n,
    returnFeeMillimes: 2000n,
  };

  it('estimates the net as COD − the frozen delivery fee', () => {
    expect(parcelMoneyFor({ ...parcel, status: 'EN_LIVRAISON' })).toEqual({
      kind: 'LIVRAISON',
      cod: 85000n,
      deliveryFee: 5500n,
      estimatedNet: 79500n,
    });
  });

  it('goes below zero for a parcel already paid by the customer', () => {
    const money = parcelMoneyFor({ ...parcel, codAmountMillimes: 0n, status: 'LIVRE' });
    expect(money).toMatchObject({ estimatedNet: -5500n });
  });

  it('shows the return fee instead for a return', () => {
    expect(parcelMoneyFor({ ...parcel, status: 'RETOUR_AU_DEPOT' })).toEqual({
      kind: 'RETOUR',
      cod: 85000n,
      returnFee: 2000n,
    });
  });

  it('shows no fee for a parcel cancelled before pickup', () => {
    expect(parcelMoneyFor({ ...parcel, status: 'ANNULE' })).toEqual({
      kind: 'ANNULE',
      cod: 85000n,
    });
  });
});

describe('sellerTimelineTime (open question, closed)', () => {
  const deviceTime = new Date('2026-09-25T08:00:00Z');
  const serverTime = new Date('2026-09-25T08:05:00Z');

  it('shows the phone time when it happened', () => {
    expect(sellerTimelineTime({ deviceTime, serverTime, clockSkewFlagged: false })).toBe(
      deviceTime,
    );
  });

  it('shows the server time once the scan is flagged for clock skew', () => {
    expect(sellerTimelineTime({ deviceTime, serverTime, clockSkewFlagged: true })).toBe(
      serverTime,
    );
  });

  it('falls back to the server time with no device time (a staff or seller action)', () => {
    expect(
      sellerTimelineTime({ deviceTime: null, serverTime, clockSkewFlagged: false }),
    ).toBe(serverTime);
  });
});
