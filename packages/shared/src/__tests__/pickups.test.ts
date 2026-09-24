import { describe, expect, it } from 'vitest';
import {
  PICKUP_SLOT_LABELS_FR,
  canCancelPickup,
  canPlanPickup,
  pickupFeeRuleText,
  planPickupSchema,
  pickupRequestSchema,
} from '../pickups.js';
import { PickupStatus } from '../statuses.js';

const ADDRESS_ID = '3f1e4b6a-2c7d-4e8f-9a0b-1c2d3e4f5a6b';
const LOCALITE_ID = '5d0c2a8e-1f3b-4c6d-9e7f-0a1b2c3d4e5f';

describe('the request form (Vendeur 4.5, D-35)', () => {
  const base = { requestedSlot: 'MATIN', pickupAddressId: ADDRESS_ID };

  it('takes the parcels ready, or how many', () => {
    expect(pickupRequestSchema.safeParse({ ...base, parcelCodes: ['FG-8K2QX7AB'] }).success).toBe(
      true,
    );
    expect(pickupRequestSchema.parse({ ...base, declaredCount: '12' }).declaredCount).toBe(12);
  });

  it('refuses both, or neither', () => {
    expect(
      pickupRequestSchema.safeParse({ ...base, parcelCodes: ['FG-8K2QX7AB'], declaredCount: 3 })
        .success,
    ).toBe(false);
    expect(pickupRequestSchema.safeParse({ ...base, parcelCodes: [] }).success).toBe(false);
    expect(pickupRequestSchema.safeParse(base).success).toBe(false);
  });

  it('takes a saved address, or a new one on the first request', () => {
    const first = {
      requestedSlot: 'APRES_MIDI',
      declaredCount: 3,
      newAddress: { localiteId: LOCALITE_ID, address: '12 rue de Marseille' },
    };
    expect(pickupRequestSchema.safeParse(first).success).toBe(true);
    expect(pickupRequestSchema.safeParse({ ...first, pickupAddressId: ADDRESS_ID }).success).toBe(
      false,
    );
    expect(
      pickupRequestSchema.safeParse({ requestedSlot: 'MATIN', declaredCount: 3 }).success,
    ).toBe(false);
  });

  it('knows two windows only: Matin, Après-midi', () => {
    expect(Object.values(PICKUP_SLOT_LABELS_FR)).toEqual(['Matin', 'Après-midi']);
    expect(
      pickupRequestSchema.safeParse({ ...base, declaredCount: 1, requestedSlot: 'SOIR' }).success,
    ).toBe(false);
  });
});

describe('the fee rule shown before confirming (Vendeur 4.5)', () => {
  it('says it the way the spec words it, from Paramètres', () => {
    expect(pickupFeeRuleText(2000n, 5)).toBe('Moins de 5 colis : ramassage à 2,000 DT');
    expect(pickupFeeRuleText(2500n, 8)).toBe('Moins de 8 colis : ramassage à 2,500 DT');
  });

  it('says nothing when pickups are free', () => {
    expect(pickupFeeRuleText(0n, 5)).toBeNull();
  });
});

describe('cancelling (D-35)', () => {
  it('is possible while Demandé or Planifié only', () => {
    expect(Object.values(PickupStatus).filter(canCancelPickup)).toEqual(['DEMANDE', 'PLANIFIE']);
  });
});

describe('planning a pickup (Admin 4.4, D-58)', () => {
  const RAMASSEUR = '5d0c2a8e-1f3b-4c6d-9e7f-0a1b2c3d4e5f';

  it('takes the day, the window and the ramasseur', () => {
    const plan = { date: '2026-09-26', slot: 'APRES_MIDI', ramasseurId: RAMASSEUR };
    expect(planPickupSchema.parse(plan)).toEqual(plan);
    expect(planPickupSchema.safeParse({ ...plan, date: '26/09/2026' }).success).toBe(false);
    expect(planPickupSchema.safeParse({ ...plan, slot: 'SOIR' }).success).toBe(false);
    expect(planPickupSchema.safeParse({ ...plan, ramasseurId: undefined }).success).toBe(false);
  });

  it('plans a request, or plans it again while it is planned', () => {
    expect(canPlanPickup(PickupStatus.DEMANDE)).toBe(true);
    expect(canPlanPickup(PickupStatus.PLANIFIE)).toBe(true);
    expect(canPlanPickup(PickupStatus.EFFECTUE)).toBe(false);
    expect(canPlanPickup(PickupStatus.ANNULE)).toBe(false);
  });
});
