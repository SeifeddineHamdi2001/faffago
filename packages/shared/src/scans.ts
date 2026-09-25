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

/** Every scan action, as the team reads it in logs and Exceptions. */
export const SCAN_ACTION_LABELS_FR: Record<ScanAction, string> = {
  RAMASSAGE: 'Ramassage',
  ENTREE_DEPOT: 'Entrée dépôt',
  SORTIE_COURSIER: 'Sortie coursier',
  LIVRE: 'Livré',
  ECHEC: 'Échec',
  RETOUR_DE_TOURNEE: 'Retour de tournée',
  PREPARATION_RETOURS: 'Préparation retours',
  RETOUR_RECU: 'Retour reçu',
  BON_VERSEMENT_REMIS: 'Bon de versement remis',
  ARCHIVAGE_BON: 'Archivage bon',
};

export const SCAN_SOURCE_LABELS_FR: Record<ScanSource, string> = {
  APP_COURSIER: 'Application coursier',
  WEB_CAMERA: 'Caméra',
  WEB_DOUCHETTE: 'Douchette',
  SAISIE_MANUELLE: 'Saisie manuelle',
};

// ── The depot's station ─────────────────────────────────────

/**
 * The five modes of Admin 4.2: the three of phase 5, and Préparation retours
 * and Archivage bons, which came with the bons in phase 8 (D-50, D-80, D-81).
 */
export const DEPOT_SCAN_MODES = [
  ScanAction.ENTREE_DEPOT,
  ScanAction.SORTIE_COURSIER,
  ScanAction.RETOUR_DE_TOURNEE,
  ScanAction.PREPARATION_RETOURS,
  ScanAction.ARCHIVAGE_BON,
] as const;
export type DepotScanMode = (typeof DEPOT_SCAN_MODES)[number];

export const DEPOT_SCAN_MODE_LABELS_FR: Record<DepotScanMode, string> = {
  ENTREE_DEPOT: 'Entrée dépôt',
  SORTIE_COURSIER: 'Sortie coursier',
  RETOUR_DE_TOURNEE: 'Retour de tournée',
  PREPARATION_RETOURS: 'Préparation retours',
  ARCHIVAGE_BON: 'Archivage bons',
};

/**
 * Keyboard shortcuts for the modes (Admin 4.2). Function keys, because a
 * barcode gun types letters, digits and Enter into the same page.
 */
export const DEPOT_SCAN_MODE_SHORTCUTS: Record<DepotScanMode, 'F1' | 'F2' | 'F3' | 'F4' | 'F5'> = {
  ENTREE_DEPOT: 'F1',
  SORTIE_COURSIER: 'F2',
  RETOUR_DE_TOURNEE: 'F3',
  PREPARATION_RETOURS: 'F4',
  ARCHIVAGE_BON: 'F5',
};

/** Null for Archivage bons: it scans a bon's QR, not a parcel. */
export const PARCEL_ACTION_BY_DEPOT_MODE: Record<DepotScanMode, ParcelAction | null> = {
  ENTREE_DEPOT: ParcelAction.SCAN_ENTREE_DEPOT,
  SORTIE_COURSIER: ParcelAction.SCAN_SORTIE_COURSIER,
  RETOUR_DE_TOURNEE: ParcelAction.SCAN_RETOUR_DE_TOURNEE,
  PREPARATION_RETOURS: ParcelAction.SCAN_PREPARATION_RETOURS,
  ARCHIVAGE_BON: null,
};

/** Sortie coursier and Retour de tournée: the courier is chosen first (Admin 4.2, D-53). */
export function depotModeNeedsCourier(mode: DepotScanMode): boolean {
  return mode === ScanAction.SORTIE_COURSIER || mode === ScanAction.RETOUR_DE_TOURNEE;
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

// ── Annuler le dernier scan (A-11, D-54) ────────────────────

export const ScanCancelRefusal = {
  SCAN_INTROUVABLE: 'SCAN_INTROUVABLE',
  ANNULATION_SCAN_REFUSE: 'ANNULATION_SCAN_REFUSE',
  ANNULATION_AUTRE_PERSONNE: 'ANNULATION_AUTRE_PERSONNE',
  ANNULATION_PAS_DERNIER: 'ANNULATION_PAS_DERNIER',
  ANNULATION_HORS_DELAI: 'ANNULATION_HORS_DELAI',
  ANNULATION_COLIS_MODIFIE: 'ANNULATION_COLIS_MODIFIE',
  /** A pickup scan once Terminer le ramassage has counted it (A-13, D-61). */
  ANNULATION_RAMASSAGE_TERMINE: 'ANNULATION_RAMASSAGE_TERMINE',
  /** The courier's caisse session of that day is Clôturée (A-11, D-79). */
  ANNULATION_CAISSE_CLOTUREE: 'ANNULATION_CAISSE_CLOTUREE',
  /** A bon scan (Remis, Archivage) is corrected by the admin, not undone (D-84). */
  ANNULATION_BON: 'ANNULATION_BON',
} as const;
export type ScanCancelRefusal = (typeof ScanCancelRefusal)[keyof typeof ScanCancelRefusal];

export const SCAN_CANCEL_REFUSAL_MESSAGES_FR: Record<ScanCancelRefusal, string> = {
  SCAN_INTROUVABLE: 'Scan introuvable',
  ANNULATION_SCAN_REFUSE: 'Ce scan a été refusé : il n’a rien changé',
  ANNULATION_AUTRE_PERSONNE: 'Seule la personne qui a scanné peut annuler ce scan',
  ANNULATION_PAS_DERNIER: 'Seul votre dernier scan peut être annulé',
  ANNULATION_HORS_DELAI: 'Délai d’annulation dépassé : seul l’admin peut corriger',
  ANNULATION_COLIS_MODIFIE: 'Le colis a changé depuis ce scan : il ne peut plus être annulé',
  ANNULATION_RAMASSAGE_TERMINE: 'Ramassage terminé : ce scan ne peut plus être annulé',
  ANNULATION_CAISSE_CLOTUREE: 'Caisse clôturée : seul l’admin peut corriger',
  ANNULATION_BON: 'Un scan de bon ne s’annule pas : l’admin corrige',
};

export interface DepotScanCancelFacts {
  accepted: boolean;
  /** The person asking is the one who scanned. */
  byActor: boolean;
  /** No later accepted, not cancelled scan of his. */
  isLatestOfActor: boolean;
  /** When the server received the scan. */
  receivedAt: Date;
  /** The server clock: a web scan is online by nature (D-54). */
  now: Date;
  /** `scan_cancel_window_seconds` in Paramètres (60). */
  windowSeconds: number;
  /** The scan's event is still the parcel's last one. */
  parcelUnchangedSince: boolean;
}

/**
 * Whether a depot scan can be cancelled (A-11, D-54): the scanner's own last
 * accepted scan, within the window, while nothing else has happened to the
 * parcel. Null when it can. After the window only the admin corrects (D-56).
 */
export function depotScanCancelRefusal(facts: DepotScanCancelFacts): ScanCancelRefusal | null {
  if (!facts.accepted) return ScanCancelRefusal.ANNULATION_SCAN_REFUSE;
  if (!facts.byActor) return ScanCancelRefusal.ANNULATION_AUTRE_PERSONNE;
  if (!facts.isLatestOfActor) return ScanCancelRefusal.ANNULATION_PAS_DERNIER;
  if (facts.now.getTime() - facts.receivedAt.getTime() > facts.windowSeconds * 1000) {
    return ScanCancelRefusal.ANNULATION_HORS_DELAI;
  }
  if (!facts.parcelUnchangedSince) return ScanCancelRefusal.ANNULATION_COLIS_MODIFIE;
  return null;
}
