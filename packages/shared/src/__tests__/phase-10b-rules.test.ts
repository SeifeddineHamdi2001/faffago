import { describe, expect, it } from 'vitest';
import {
  BON_ARCHIVE_EXCEPTION_HOURS,
  BON_EN_ROUTE_EXCEPTION_HOURS,
  EXCEPTION_KIND_LABELS_FR,
  ExceptionKind,
  cashLate,
  olderThanHours,
} from '../exceptions.js';
import {
  SettingKey,
  defaultSettingValues,
  parseSettingValue,
  readPlatformSettings,
} from '../settings.js';
import { changeSellerStatutSchema, createSellerSchema, setSellerCinSchema } from '../sellers.js';

/** Phase 10B (Admin 4.7, D-89): the rest of the Exceptions queue, Société, the CIN number. */

describe('the rest of the Exceptions queue', () => {
  const now = new Date('2026-09-26T10:00:00Z');

  it('flags a bon en route after 24 h and a signed bon not archived after 48 h', () => {
    expect(BON_EN_ROUTE_EXCEPTION_HOURS).toBe(24);
    expect(BON_ARCHIVE_EXCEPTION_HOURS).toBe(48);
    expect(olderThanHours(new Date('2026-09-25T09:59:00Z'), now, 24)).toBe(true);
    expect(olderThanHours(new Date('2026-09-25T10:00:00Z'), now, 24)).toBe(false);
  });

  it('flags cash of a day already over, never today’s', () => {
    expect(cashLate('2026-09-25', '2026-09-26')).toBe(true);
    expect(cashLate('2026-09-26', '2026-09-26')).toBe(false);
  });

  it('words each row as Admin 4.7 does', () => {
    expect(EXCEPTION_KIND_LABELS_FR[ExceptionKind.BON_SIGNE_NON_ARCHIVE]).toBe(
      'Bon signé non archivé après 48 h',
    );
    expect(EXCEPTION_KIND_LABELS_FR[ExceptionKind.CIN_MANQUANT]).toBe(
      'Vendeur CIN uniquement sans numéro de CIN',
    );
  });
});

describe('Paramètres › Société (D-89)', () => {
  it('starts empty and reads back what the admin saves', () => {
    expect(defaultSettingValues()[SettingKey.SOCIETE_MATRICULE_FISCAL]).toBe('');
    const { settings } = readPlatformSettings({
      [SettingKey.SOCIETE_RAISON_SOCIALE]: 'Faffa Go SARL',
      [SettingKey.SOCIETE_MATRICULE_FISCAL]: '1234567/A/M/000',
      [SettingKey.SOCIETE_ADRESSE]: 'Rue X, Tunis',
    });
    expect(settings).toMatchObject({
      societeRaisonSociale: 'Faffa Go SARL',
      societeMatriculeFiscal: '1234567/A/M/000',
      societeAdresse: 'Rue X, Tunis',
    });
    expect(parseSettingValue(SettingKey.SOCIETE_ADRESSE, 'x'.repeat(301)).ok).toBe(false);
  });
});

describe('the seller’s CIN number (D-89)', () => {
  const seller = {
    shopName: 'Chic',
    productCategory: 'MODE_VETEMENTS',
    contactFirstName: 'Amel',
    contactLastName: 'Ben Ali',
    contactPhone: '22000000',
    email: 'chic@boutique.tn',
  };

  it('is required to create a CIN uniquement seller, optional otherwise', () => {
    const missing = createSellerSchema.safeParse({
      ...seller,
      statut: 'CIN_UNIQUEMENT',
      cinNumber: '',
    });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0]).toMatchObject({
      path: ['cinNumber'],
      message: 'Numéro de CIN obligatoire pour le statut CIN uniquement',
    });
    expect(
      createSellerSchema.parse({ ...seller, statut: 'CIN_UNIQUEMENT', cinNumber: '01234567' })
        .cinNumber,
    ).toBe('01234567');
    expect(
      createSellerSchema.parse({ ...seller, statut: 'PATENTE', cinNumber: '' }).cinNumber,
    ).toBe(undefined);
  });

  it('may come with a change of statut, and is corrected on its own', () => {
    expect(
      changeSellerStatutSchema.parse({ statut: 'CIN_UNIQUEMENT', cinNumber: '01234567' }),
    ).toEqual({
      statut: 'CIN_UNIQUEMENT',
      cinNumber: '01234567',
    });
    expect(setSellerCinSchema.safeParse({ cinNumber: '123' }).success).toBe(false);
  });
});
