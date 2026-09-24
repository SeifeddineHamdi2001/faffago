import { describe, expect, it } from 'vitest';
import { ParcelEventType } from '../parcel-state-machine.js';
import { PUBLIC_TIMELINE_EVENT_TYPES } from '../public-tracking.js';
import {
  EVENT_TYPES_HIDDEN_FROM_SELLER,
  moveToCourierSchema,
  plannedLivreurFor,
  tourLoads,
} from '../tournees.js';

const ALI = '3f1e4b6a-2c7d-4e8f-9a0b-1c2d3e4f5a6b';
const SAMI = '5d0c2a8e-1f3b-4c6d-9e7f-0a1b2c3d4e5f';
const PARCEL = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

describe('who a parcel is planned for in Tournées (Admin 4.5, D-55)', () => {
  const zoneLivreur = new Map<string, string | null>([
    ['z-nord', ALI],
    ['z-vide', null],
  ]);
  const available = (id: string) => id === ALI || id === SAMI;

  it('is the livreur covering its zone today', () => {
    expect(
      plannedLivreurFor({ zoneId: 'z-nord', plannedLivreurId: null }, zoneLivreur, available),
    ).toEqual({
      courierId: ALI,
      moved: false,
    });
  });

  it('is the courier it was moved to, while he can work', () => {
    expect(
      plannedLivreurFor({ zoneId: 'z-nord', plannedLivreurId: SAMI }, zoneLivreur, available),
    ).toEqual({
      courierId: SAMI,
      moved: true,
    });
  });

  it('falls back to the zone when the courier it was moved to cannot work today', () => {
    expect(
      plannedLivreurFor(
        { zoneId: 'z-nord', plannedLivreurId: SAMI },
        zoneLivreur,
        (id) => id === ALI,
      ),
    ).toEqual({ courierId: ALI, moved: false });
  });

  it('is nobody in a zone without a courier, or in no zone', () => {
    expect(
      plannedLivreurFor({ zoneId: 'z-vide', plannedLivreurId: null }, zoneLivreur, available),
    ).toEqual({
      courierId: null,
      moved: false,
    });
    expect(
      plannedLivreurFor({ zoneId: null, plannedLivreurId: null }, zoneLivreur, available),
    ).toEqual({
      courierId: null,
      moved: false,
    });
  });

  it('can still be moved to someone when its zone has nobody', () => {
    expect(
      plannedLivreurFor({ zoneId: null, plannedLivreurId: SAMI }, zoneLivreur, available),
    ).toEqual({
      courierId: SAMI,
      moved: true,
    });
  });
});

describe('each courier’s load before dispatch (Admin 4.5)', () => {
  it('counts the parcels planned per courier, and those planned for nobody', () => {
    expect(tourLoads([ALI, SAMI, ALI, null, ALI])).toEqual({
      byCourier: new Map([
        [ALI, 3],
        [SAMI, 1],
      ]),
      withoutCourier: 1,
    });
  });
});

describe('moving parcels to another courier (D-55)', () => {
  it('takes the parcels and a courier, or null to go back to the zone', () => {
    expect(moveToCourierSchema.parse({ parcelIds: [PARCEL], courierId: SAMI })).toEqual({
      parcelIds: [PARCEL],
      courierId: SAMI,
    });
    expect(
      moveToCourierSchema.parse({ parcelIds: [PARCEL], courierId: null }).courierId,
    ).toBeNull();
  });

  it('needs at least one parcel, 500 at most, each once', () => {
    expect(moveToCourierSchema.safeParse({ parcelIds: [], courierId: SAMI }).success).toBe(false);
    expect(
      moveToCourierSchema.safeParse({ parcelIds: [PARCEL, PARCEL], courierId: SAMI }).success,
    ).toBe(false);
    expect(
      moveToCourierSchema.safeParse({
        parcelIds: Array.from(
          { length: 501 },
          (_, i) => `7a1b2c3d-4e5f-4a6b-8c7d-${String(i).padStart(12, '0')}`,
        ),
        courierId: SAMI,
      }).success,
    ).toBe(false);
  });
});

describe('what the seller never reads (D-55)', () => {
  it('keeps the Tournées planning off the seller’s timeline and off public tracking', () => {
    expect(EVENT_TYPES_HIDDEN_FROM_SELLER).toEqual([ParcelEventType.AFFECTATION_LIVREUR]);
    expect(PUBLIC_TIMELINE_EVENT_TYPES).not.toContain(ParcelEventType.AFFECTATION_LIVREUR);
  });
});
