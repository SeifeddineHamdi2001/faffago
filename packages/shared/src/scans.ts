import { z } from 'zod';
import { ParcelAction } from './parcel-state-machine.js';
import type { ParcelLocation, ParcelStatus, RelaunchOrigin, RelaunchSlot } from './statuses.js';

/**
 * Scans (Admin 4.2, Coursier 4.9, tech-stack 2, D-53): the vocabulary shared
 * by the depot's scan station and, from phase 6, the courier app.
 */

/** Mirrored 1:1 by the `ScanAction` enum in schema.prisma. */
export const ScanAction = {
  RAMASSAGE: 'RAMASSAGE',
  ENTREE_DEPOT: 'ENTREE_DEPOT',
  SORTIE_COURSIER: 'SORTIE_COURSIER',
  LIVRE: 'LIVRE',
  ECHEC: 'ECHEC',
  RETOUR_DE_TOURNEE: 'RETOUR_DE_TOURNEE',
  PREPARATION_RETOURS: 'PREPARATION_RETOURS',
  RETOUR_RECU: 'RETOUR_RECU',
  BON_VERSEMENT_REMIS: 'BON_VERSEMENT_REMIS',
  ARCHIVAGE_BON: 'ARCHIVAGE_BON',
} as const;
export type ScanAction = (typeof ScanAction)[keyof typeof ScanAction];

/** Mirrored 1:1 by the `ScanSource` enum in schema.prisma. */
export const ScanSource = {
  APP_COURSIER: 'APP_COURSIER',
  WEB_CAMERA: 'WEB_CAMERA',
  WEB_DOUCHETTE: 'WEB_DOUCHETTE',
  /** A damaged label: allowed, flagged to the admin (Coursier rule 1, A-22). */
  SAISIE_MANUELLE: 'SAISIE_MANUELLE',
} as const;
export type ScanSource = (typeof ScanSource)[keyof typeof ScanSource];

// ── The depot's station ─────────────────────────────────────

/**
 * The three modes of phase 5 (D-50). Préparation retours and Archivage bons
 * need the bons and come with phase 8.
 */
export const DEPOT_SCAN_MODES = [
  ScanAction.ENTREE_DEPOT,
  ScanAction.SORTIE_COURSIER,
  ScanAction.RETOUR_DE_TOURNEE,
] as const;
export type DepotScanMode = (typeof DEPOT_SCAN_MODES)[number];

export const DEPOT_SCAN_MODE_LABELS_FR: Record<DepotScanMode, string> = {
  ENTREE_DEPOT: 'Entrée dépôt',
  SORTIE_COURSIER: 'Sortie coursier',
  RETOUR_DE_TOURNEE: 'Retour de tournée',
};

/**
 * Keyboard shortcuts for the modes (Admin 4.2). Function keys, because a
 * barcode gun types letters, digits and Enter into the same page.
 */
export const DEPOT_SCAN_MODE_SHORTCUTS: Record<DepotScanMode, 'F1' | 'F2' | 'F3'> = {
  ENTREE_DEPOT: 'F1',
  SORTIE_COURSIER: 'F2',
  RETOUR_DE_TOURNEE: 'F3',
};

export const PARCEL_ACTION_BY_DEPOT_MODE: Record<DepotScanMode, ParcelAction> = {
  ENTREE_DEPOT: ParcelAction.SCAN_ENTREE_DEPOT,
  SORTIE_COURSIER: ParcelAction.SCAN_SORTIE_COURSIER,
  RETOUR_DE_TOURNEE: ParcelAction.SCAN_RETOUR_DE_TOURNEE,
};

/** Sortie coursier and Retour de tournée: the courier is chosen first (Admin 4.2, D-53). */
export function depotModeNeedsCourier(mode: DepotScanMode): boolean {
  return mode !== ScanAction.ENTREE_DEPOT;
}

/**
 * One scan from the station. `clientScanId` is drawn by the browser for each
 * scan: the same id sent again returns the first result (tech-stack 2).
 * `courierId` is the chosen courier's account id.
 */
export const depotScanSchema = z
  .object({
    clientScanId: z.string().uuid(),
    mode: z.enum(DEPOT_SCAN_MODES),
    rawCode: z.string().trim().min(1, 'Code vide').max(300),
    source: z.enum([ScanSource.WEB_CAMERA, ScanSource.WEB_DOUCHETTE, ScanSource.SAISIE_MANUELLE]),
    courierId: z.string().uuid().nullable().optional(),
    /** The browser's clock, stored beside the server's (tech-stack 2, A-12). */
    deviceTime: z.string().datetime({ offset: true }),
  })
  .strict();
export type DepotScanValues = z.output<typeof depotScanSchema>;

/**
 * A barcode gun types a whole code in a few milliseconds per key; a person
 * types far slower. Mean gap between keys at or under this reads as the gun.
 */
export const GUN_MAX_MEAN_KEY_INTERVAL_MS = 35;

/**
 * Where a code typed into the station came from, from the times of its keys.
 * Anything that is not a burst — typed by hand, pasted — is manual entry,
 * flagged to the admin (A-22), so the flag cannot be bypassed by typing into
 * the gun's field.
 */
export function classifyKeyboardEntry(
  keyTimes: readonly number[],
): typeof ScanSource.WEB_DOUCHETTE | typeof ScanSource.SAISIE_MANUELLE {
  if (keyTimes.length < 2) return ScanSource.SAISIE_MANUELLE;
  const span = keyTimes[keyTimes.length - 1]! - keyTimes[0]!;
  const meanGap = span / (keyTimes.length - 1);
  return meanGap <= GUN_MAX_MEAN_KEY_INTERVAL_MS
    ? ScanSource.WEB_DOUCHETTE
    : ScanSource.SAISIE_MANUELLE;
}

/** The camera keeps reading a label in front of it; the same code is taken once in this window. */
export const CAMERA_REPEAT_WINDOW_MS = 3000;

export function isRepeatRead(
  last: { code: string; at: number } | null,
  code: string,
  now: number,
  windowMs: number = CAMERA_REPEAT_WINDOW_MS,
): boolean {
  return last !== null && last.code === code && now - last.at < windowMs;
}

/**
 * What a parcel was just before an accepted scan, stored on the scan so that
 * cancelling it puts the parcel back exactly (D-53, D-54): the columns a depot
 * scan changes, including the relance a Sortie coursier clears and the plan
 * of Tournées it consumes. Couriers by their courier id, days as `AAAA-MM-JJ`.
 */
export interface ParcelBefore {
  status: ParcelStatus;
  location: ParcelLocation;
  currentLivreurId: string | null;
  plannedLivreurId: string | null;
  relaunchDate: string | null;
  relaunchSlot: RelaunchSlot | null;
  relaunchOrigin: RelaunchOrigin | null;
}
