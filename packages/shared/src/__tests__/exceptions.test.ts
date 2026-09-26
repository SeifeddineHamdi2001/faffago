import { describe, expect, it } from 'vitest';
import {
  DEPOT_WAIT_EXCEPTION_HOURS,
  EXCEPTION_KIND_LABELS_FR,
  ExceptionKind,
  MANUAL_ENTRY_EXCEPTION_DAYS,
  isPickupLate,
  waitedTooLongAtDepot,
} from '../exceptions.js';

describe('the first rows of Exceptions (Admin 4.7, D-50)', () => {
  it('has phase 5’s four rows, then the rest (phase 10, D-89), in the spec’s words', () => {
    expect(Object.values(ExceptionKind)).toEqual([
      'COLIS_AU_DEPOT_SANS_TOURNEE',
      'RAMASSAGE_NON_EFFECTUE',
      'DEMANDE_VENDEUR',
      'SAISIE_MANUELLE',
      'A_VERIFIER_LIMITE_PROCHE',
      'ARGENT_NON_REMIS',
      'BON_EN_ROUTE_NON_REMIS',
      'BON_SIGNE_NON_ARCHIVE',
      'CIN_MANQUANT',
    ]);
    expect(EXCEPTION_KIND_LABELS_FR).toMatchObject({
      COLIS_AU_DEPOT_SANS_TOURNEE: 'Colis au dépôt depuis plus de 48 h sans tournée',
      RAMASSAGE_NON_EFFECTUE: 'Ramassage planifié non effectué',
      DEMANDE_VENDEUR: 'Demande de modification du vendeur en attente',
      SAISIE_MANUELLE: 'Saisie manuelle du code',
    });
  });

  it('flags a parcel at the depot for more than 48 hours', () => {
    expect(DEPOT_WAIT_EXCEPTION_HOURS).toBe(48);
    const since = new Date('2026-09-23T08:00:00.000Z');
    expect(waitedTooLongAtDepot(since, new Date('2026-09-25T08:00:00.000Z'))).toBe(false);
    expect(waitedTooLongAtDepot(since, new Date('2026-09-25T08:00:01.000Z'))).toBe(true);
  });

  it('flags a pickup planned for a day that has passed, in Tunis', () => {
    expect(isPickupLate('2026-09-24', '2026-09-25')).toBe(true);
    expect(isPickupLate('2026-09-25', '2026-09-25')).toBe(false);
    expect(isPickupLate('2026-09-26', '2026-09-25')).toBe(false);
  });

  it('keeps a week of manual entries', () => {
    expect(MANUAL_ENTRY_EXCEPTION_DAYS).toBe(7);
  });
});
