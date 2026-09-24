import { describe, expect, it } from 'vitest';
import {
  ZoneAssignmentKind,
  canMarkAbsentOn,
  courierAbsenceSchema,
  coveringCourier,
  createZoneSchema,
  updateDelegationSchema,
  updateGouvernoratSchema,
  updateZoneSchema,
  zoneAssignmentsSchema,
} from '../zones.js';

const ALI = '3f1e4b6a-2c7d-4e8f-9a0b-1c2d3e4f5a6b';
const SAMI = '5d0c2a8e-1f3b-4c6d-9e7f-0a1b2c3d4e5f';

describe('who covers a zone on a day (Admin 4.5, D-52)', () => {
  const available =
    (...ids: string[]) =>
    (id: string) =>
      ids.includes(id);

  it('is the titular when he is available', () => {
    expect(coveringCourier({ titulaireId: ALI, backupId: SAMI }, available(ALI, SAMI))).toEqual({
      courierId: ALI,
      kind: ZoneAssignmentKind.TITULAIRE,
    });
  });

  it('switches to the backup when the titular is absent or takes no work', () => {
    expect(coveringCourier({ titulaireId: ALI, backupId: SAMI }, available(SAMI))).toEqual({
      courierId: SAMI,
      kind: ZoneAssignmentKind.BACKUP,
    });
  });

  it('is the backup when the zone has no titular', () => {
    expect(coveringCourier({ titulaireId: null, backupId: SAMI }, available(SAMI))).toEqual({
      courierId: SAMI,
      kind: ZoneAssignmentKind.BACKUP,
    });
  });

  it('is nobody when neither can work: the column reads Sans coursier', () => {
    expect(coveringCourier({ titulaireId: ALI, backupId: SAMI }, available())).toEqual({
      courierId: null,
      kind: null,
    });
    expect(coveringCourier({ titulaireId: null, backupId: null }, available(ALI))).toEqual({
      courierId: null,
      kind: null,
    });
  });
});

describe('the zone forms (D-51)', () => {
  it('takes a zone name, trimmed', () => {
    expect(createZoneSchema.parse({ name: '  Tunis Nord ' })).toEqual({ name: 'Tunis Nord' });
    expect(createZoneSchema.safeParse({ name: 'x' }).success).toBe(false);
    expect(createZoneSchema.safeParse({ name: 'Tunis', extra: 1 }).success).toBe(false);
  });

  it('renames or (de)activates, and refuses an empty change', () => {
    expect(updateZoneSchema.safeParse({ name: 'Centre-ville' }).success).toBe(true);
    expect(updateZoneSchema.safeParse({ isActive: false }).success).toBe(true);
    expect(updateZoneSchema.safeParse({}).success).toBe(false);
  });

  it('takes a titular and a backup per role, each optional', () => {
    const value = {
      LIVREUR: { titulaireId: ALI, backupId: null },
      RAMASSEUR: { titulaireId: null, backupId: SAMI },
    };
    expect(zoneAssignmentsSchema.parse(value)).toEqual(value);
  });

  it('refuses the same person as titular and backup of one role', () => {
    const result = zoneAssignmentsSchema.safeParse({
      LIVREUR: { titulaireId: ALI, backupId: ALI },
      RAMASSEUR: { titulaireId: null, backupId: null },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      'Le titulaire et le backup doivent être deux personnes différentes',
    );
  });

  it('needs both roles, even empty', () => {
    expect(
      zoneAssignmentsSchema.safeParse({ LIVREUR: { titulaireId: ALI, backupId: null } }).success,
    ).toBe(false);
  });
});

describe('renaming gouvernorats and délégations (D-51)', () => {
  it('takes the French and Arabic names, and a délégation’s zone', () => {
    expect(updateDelegationSchema.safeParse({ nameFr: 'Bab El Bhar' }).success).toBe(true);
    expect(updateDelegationSchema.safeParse({ nameAr: 'باب بحر' }).success).toBe(true);
    expect(updateDelegationSchema.safeParse({ zoneId: ALI }).success).toBe(true);
    expect(updateGouvernoratSchema.safeParse({ nameAr: 'منوبة' }).success).toBe(true);
  });

  it('lets a délégation leave every zone, with null', () => {
    expect(updateDelegationSchema.parse({ zoneId: null })).toEqual({ zoneId: null });
  });

  it('keeps the Arabic name required: gouvernorats and délégations carry both (A-18)', () => {
    expect(updateDelegationSchema.safeParse({ nameAr: '' }).success).toBe(false);
    expect(updateDelegationSchema.safeParse({ nameAr: null }).success).toBe(false);
    expect(updateGouvernoratSchema.safeParse({ nameAr: ' ' }).success).toBe(false);
  });

  it('never adds or deactivates (D-51)', () => {
    expect(updateDelegationSchema.safeParse({ isActive: false }).success).toBe(false);
    expect(updateGouvernoratSchema.safeParse({ isActive: false }).success).toBe(false);
    expect(updateDelegationSchema.safeParse({ code: 'TUN-NEW' }).success).toBe(false);
  });

  it('refuses an empty change', () => {
    expect(updateDelegationSchema.safeParse({}).success).toBe(false);
    expect(updateGouvernoratSchema.safeParse({}).success).toBe(false);
  });
});

describe('marking a courier absent (D-52)', () => {
  it('takes a day and an optional reason', () => {
    expect(courierAbsenceSchema.parse({ date: '2026-09-25' })).toEqual({ date: '2026-09-25' });
    expect(courierAbsenceSchema.parse({ date: '2026-09-25', reason: ' Malade ' })).toEqual({
      date: '2026-09-25',
      reason: 'Malade',
    });
    expect(courierAbsenceSchema.safeParse({ date: '2026-02-30' }).success).toBe(false);
    expect(courierAbsenceSchema.safeParse({ date: '25/09/2026' }).success).toBe(false);
  });

  it('is for today or a later day, never a past one', () => {
    expect(canMarkAbsentOn('2026-09-24', '2026-09-24')).toBe(true);
    expect(canMarkAbsentOn('2026-10-01', '2026-09-24')).toBe(true);
    expect(canMarkAbsentOn('2026-09-23', '2026-09-24')).toBe(false);
  });
});
