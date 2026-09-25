import { describe, expect, it } from 'vitest';
import { ParcelAction, SCAN_REFUSAL_MESSAGES_FR, ScanRefusal } from '../parcel-state-machine.js';
import {
  CAMERA_REPEAT_WINDOW_MS,
  DEPOT_SCAN_MODES,
  DEPOT_SCAN_MODE_LABELS_FR,
  DEPOT_SCAN_MODE_SHORTCUTS,
  PARCEL_ACTION_BY_DEPOT_MODE,
  SCAN_CANCEL_REFUSAL_MESSAGES_FR,
  ScanCancelRefusal,
  ScanSource,
  classifyKeyboardEntry,
  depotModeNeedsCourier,
  depotScanCancelRefusal,
  depotScanSchema,
  isRepeatRead,
} from '../scans.js';

const SCAN_ID = '3f1e4b6a-2c7d-4e8f-9a0b-1c2d3e4f5a6b';
const COURIER_ID = '5d0c2a8e-1f3b-4c6d-9e7f-0a1b2c3d4e5f';

describe('the depot scan modes (Admin 4.2, D-50)', () => {
  it('ships the five modes of the spec, in its order (D-50, phase 8)', () => {
    expect(DEPOT_SCAN_MODES).toEqual([
      'ENTREE_DEPOT',
      'SORTIE_COURSIER',
      'RETOUR_DE_TOURNEE',
      'PREPARATION_RETOURS',
      'ARCHIVAGE_BON',
    ]);
    expect(DEPOT_SCAN_MODES.map((mode) => DEPOT_SCAN_MODE_LABELS_FR[mode])).toEqual([
      'Entrée dépôt',
      'Sortie coursier',
      'Retour de tournée',
      'Préparation retours',
      'Archivage bons',
    ]);
  });

  it('gives each mode its keyboard shortcut, out of the way of a barcode gun', () => {
    expect(DEPOT_SCAN_MODES.map((mode) => DEPOT_SCAN_MODE_SHORTCUTS[mode])).toEqual([
      'F1',
      'F2',
      'F3',
      'F4',
      'F5',
    ]);
  });

  it('maps each mode to its action of the state machine', () => {
    expect(PARCEL_ACTION_BY_DEPOT_MODE).toEqual({
      ENTREE_DEPOT: ParcelAction.SCAN_ENTREE_DEPOT,
      SORTIE_COURSIER: ParcelAction.SCAN_SORTIE_COURSIER,
      RETOUR_DE_TOURNEE: ParcelAction.SCAN_RETOUR_DE_TOURNEE,
      PREPARATION_RETOURS: ParcelAction.SCAN_PREPARATION_RETOURS,
      // Archivage scans a bon's QR, not a parcel.
      ARCHIVAGE_BON: null,
    });
  });

  it('asks for the courier first on Sortie coursier and Retour de tournée (D-53)', () => {
    expect(depotModeNeedsCourier('ENTREE_DEPOT')).toBe(false);
    expect(depotModeNeedsCourier('SORTIE_COURSIER')).toBe(true);
    expect(depotModeNeedsCourier('RETOUR_DE_TOURNEE')).toBe(true);
    expect(depotModeNeedsCourier('PREPARATION_RETOURS')).toBe(false);
    expect(depotModeNeedsCourier('ARCHIVAGE_BON')).toBe(false);
  });
});

describe('the scan the station sends (D-53)', () => {
  const scan = {
    clientScanId: SCAN_ID,
    mode: 'SORTIE_COURSIER',
    rawCode: ' FG-8K2QX7AB ',
    source: ScanSource.WEB_DOUCHETTE,
    courierId: COURIER_ID,
    deviceTime: '2026-09-25T09:00:00.000+01:00',
  };

  it('carries the browser’s UUID, the code as read, the source and the device time', () => {
    expect(depotScanSchema.parse(scan)).toEqual({ ...scan, rawCode: 'FG-8K2QX7AB' });
  });

  it('takes Entrée dépôt without a courier', () => {
    const { courierId: _, ...entree } = scan;
    expect(depotScanSchema.safeParse({ ...entree, mode: 'ENTREE_DEPOT' }).success).toBe(true);
  });

  it('refuses a scan without its UUID, a courier’s action, or the courier app as source', () => {
    expect(depotScanSchema.safeParse({ ...scan, clientScanId: 'abc' }).success).toBe(false);
    expect(depotScanSchema.safeParse({ ...scan, mode: 'LIVRE' }).success).toBe(false);
    expect(depotScanSchema.safeParse({ ...scan, mode: 'ARCHIVAGE_BON' }).success).toBe(true);
    expect(depotScanSchema.safeParse({ ...scan, source: 'APP_COURSIER' }).success).toBe(false);
    expect(depotScanSchema.safeParse({ ...scan, deviceTime: 'hier' }).success).toBe(false);
    expect(depotScanSchema.safeParse({ ...scan, rawCode: '  ' }).success).toBe(false);
  });
});

describe('a barcode gun or a person typing (Coursier rule 1, A-22)', () => {
  it('reads a burst of keys as the gun', () => {
    const times = [0, 8, 15, 24, 31, 40, 47, 55, 63, 70, 78];
    expect(classifyKeyboardEntry(times)).toBe(ScanSource.WEB_DOUCHETTE);
  });

  it('reads anything slower as manual entry, which is flagged', () => {
    const times = [0, 180, 350, 520, 700, 910, 1100, 1260, 1400, 1580, 1750];
    expect(classifyKeyboardEntry(times)).toBe(ScanSource.SAISIE_MANUELLE);
  });

  it('reads a pasted code, or a single key, as manual entry', () => {
    expect(classifyKeyboardEntry([])).toBe(ScanSource.SAISIE_MANUELLE);
    expect(classifyKeyboardEntry([0])).toBe(ScanSource.SAISIE_MANUELLE);
  });
});

describe('the camera reading the same label again', () => {
  it('ignores the same code within the window, and takes it again after', () => {
    const last = { code: 'FG-8K2QX7AB', at: 1_000 };
    expect(isRepeatRead(last, 'FG-8K2QX7AB', 1_000 + CAMERA_REPEAT_WINDOW_MS - 1)).toBe(true);
    expect(isRepeatRead(last, 'FG-8K2QX7AB', 1_000 + CAMERA_REPEAT_WINDOW_MS)).toBe(false);
  });

  it('takes another code at once', () => {
    expect(isRepeatRead({ code: 'FG-8K2QX7AB', at: 1_000 }, 'FG-3M9TW2CD', 1_010)).toBe(false);
    expect(isRepeatRead(null, 'FG-8K2QX7AB', 1_000)).toBe(false);
  });
});

describe('the two refusals added by D-53', () => {
  it('have their message', () => {
    expect(SCAN_REFUSAL_MESSAGES_FR[ScanRefusal.COURSIER_INDISPONIBLE]).toBe(
      'Coursier indisponible : absent, inactif ou ne reçoit plus de travail',
    );
    expect(SCAN_REFUSAL_MESSAGES_FR[ScanRefusal.SCAN_ID_REUTILISE]).toBe(
      'Identifiant de scan déjà utilisé pour un autre scan',
    );
  });
});

describe('Annuler le dernier scan (A-11, D-54)', () => {
  const at = new Date('2026-09-25T08:00:00.000Z');
  const ok = {
    accepted: true,
    byActor: true,
    isLatestOfActor: true,
    receivedAt: at,
    now: new Date(at.getTime() + 30_000),
    windowSeconds: 60,
    parcelUnchangedSince: true,
  };

  it('allows the scanner’s own last accepted scan, within the window, parcel untouched', () => {
    expect(depotScanCancelRefusal(ok)).toBeNull();
  });

  it('measures the window on the server clock, its last second included', () => {
    expect(depotScanCancelRefusal({ ...ok, now: new Date(at.getTime() + 60_000) })).toBeNull();
    expect(depotScanCancelRefusal({ ...ok, now: new Date(at.getTime() + 60_001) })).toBe(
      ScanCancelRefusal.ANNULATION_HORS_DELAI,
    );
  });

  it('refuses a refused scan, someone else’s scan, and an older scan of his', () => {
    expect(depotScanCancelRefusal({ ...ok, accepted: false })).toBe(
      ScanCancelRefusal.ANNULATION_SCAN_REFUSE,
    );
    expect(depotScanCancelRefusal({ ...ok, byActor: false })).toBe(
      ScanCancelRefusal.ANNULATION_AUTRE_PERSONNE,
    );
    expect(depotScanCancelRefusal({ ...ok, isLatestOfActor: false })).toBe(
      ScanCancelRefusal.ANNULATION_PAS_DERNIER,
    );
  });

  it('refuses once something else has happened to the parcel', () => {
    expect(depotScanCancelRefusal({ ...ok, parcelUnchangedSince: false })).toBe(
      ScanCancelRefusal.ANNULATION_COLIS_MODIFIE,
    );
  });

  it('gives each refusal its message', () => {
    expect(SCAN_CANCEL_REFUSAL_MESSAGES_FR).toEqual({
      SCAN_INTROUVABLE: 'Scan introuvable',
      ANNULATION_SCAN_REFUSE: 'Ce scan a été refusé : il n’a rien changé',
      ANNULATION_AUTRE_PERSONNE: 'Seule la personne qui a scanné peut annuler ce scan',
      ANNULATION_PAS_DERNIER: 'Seul votre dernier scan peut être annulé',
      ANNULATION_HORS_DELAI: 'Délai d’annulation dépassé : seul l’admin peut corriger',
      ANNULATION_COLIS_MODIFIE: 'Le colis a changé depuis ce scan : il ne peut plus être annulé',
      ANNULATION_RAMASSAGE_TERMINE: 'Ramassage terminé : ce scan ne peut plus être annulé',
      ANNULATION_CAISSE_CLOTUREE: 'Caisse clôturée : seul l’admin peut corriger',
      ANNULATION_BON: 'Un scan de bon ne s’annule pas : l’admin corrige',
    });
  });
});
