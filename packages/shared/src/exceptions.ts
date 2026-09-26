/**
 * Exceptions (Admin 4.7, D-50): everything that is stuck, in one queue, each
 * with its action. Phase 5 has the rows whose data exists; À vérifier (phase
 * 7), the Caisse and the bons (phase 8) join with their phases, and phase 10
 * completes the queue.
 */

export const ExceptionKind = {
  COLIS_AU_DEPOT_SANS_TOURNEE: 'COLIS_AU_DEPOT_SANS_TOURNEE',
  RAMASSAGE_NON_EFFECTUE: 'RAMASSAGE_NON_EFFECTUE',
  DEMANDE_VENDEUR: 'DEMANDE_VENDEUR',
  /** A-22: a code typed by hand, allowed but flagged to the admin. */
  SAISIE_MANUELLE: 'SAISIE_MANUELLE',
  // ── Phase 10 (Admin 4.7, D-89) ──
  A_VERIFIER_LIMITE_PROCHE: 'A_VERIFIER_LIMITE_PROCHE',
  ARGENT_NON_REMIS: 'ARGENT_NON_REMIS',
  BON_EN_ROUTE_NON_REMIS: 'BON_EN_ROUTE_NON_REMIS',
  BON_SIGNE_NON_ARCHIVE: 'BON_SIGNE_NON_ARCHIVE',
  /** D-89: a CIN uniquement seller whose CIN number is missing: no bon for him. */
  CIN_MANQUANT: 'CIN_MANQUANT',
} as const;
export type ExceptionKind = (typeof ExceptionKind)[keyof typeof ExceptionKind];

export const EXCEPTION_KIND_LABELS_FR: Record<ExceptionKind, string> = {
  COLIS_AU_DEPOT_SANS_TOURNEE: 'Colis au dépôt depuis plus de 48 h sans tournée',
  RAMASSAGE_NON_EFFECTUE: 'Ramassage planifié non effectué',
  DEMANDE_VENDEUR: 'Demande de modification du vendeur en attente',
  SAISIE_MANUELLE: 'Saisie manuelle du code',
  A_VERIFIER_LIMITE_PROCHE: 'Colis proche de la limite À vérifier',
  ARGENT_NON_REMIS: 'Coursier n’ayant pas remis son argent',
  BON_EN_ROUTE_NON_REMIS: 'Bon en route non remis après 24 h',
  BON_SIGNE_NON_ARCHIVE: 'Bon signé non archivé après 48 h',
  CIN_MANQUANT: 'Vendeur CIN uniquement sans numéro de CIN',
};

/** Admin 4.7: "Bon en route not marked Remis after 24 h". */
export const BON_EN_ROUTE_EXCEPTION_HOURS = 24;

/** Admin 4.7: "Signed bon not archived after 48 h". */
export const BON_ARCHIVE_EXCEPTION_HOURS = 48;

/** Past `hours` since `since`? */
export function olderThanHours(since: Date, now: Date, hours: number): boolean {
  return now.getTime() - since.getTime() > hours * 3_600_000;
}

/**
 * Admin 4.7: "Courier has not handed over his cash today". Cash of a day
 * already over is waiting at the courier's: his caisse of that day was never
 * closed. Today's cash is not late until the day ends (D-89).
 */
export function cashLate(dayKey: string, todayKey: string): boolean {
  return dayKey < todayKey;
}

/** Admin 4.7: "Parcel at the depot more than 48 h without a tour". */
export const DEPOT_WAIT_EXCEPTION_HOURS = 48;

/**
 * The spec names no "seen" action for a manual entry, so the queue shows
 * those of the last days. One constant to change.
 */
export const MANUAL_ENTRY_EXCEPTION_DAYS = 7;

/** At the depot since `since`, waiting for a tour: past the limit? */
export function waitedTooLongAtDepot(since: Date, now: Date): boolean {
  return now.getTime() - since.getTime() > DEPOT_WAIT_EXCEPTION_HOURS * 3_600_000;
}

export const ManualEntryTreatRefusal = {
  SCAN_INTROUVABLE: 'SCAN_INTROUVABLE',
  PAS_UNE_SAISIE_MANUELLE: 'PAS_UNE_SAISIE_MANUELLE',
} as const;
export type ManualEntryTreatRefusal =
  (typeof ManualEntryTreatRefusal)[keyof typeof ManualEntryTreatRefusal];

export const MANUAL_ENTRY_TREAT_REFUSAL_MESSAGES_FR: Record<ManualEntryTreatRefusal, string> = {
  SCAN_INTROUVABLE: 'Scan introuvable',
  PAS_UNE_SAISIE_MANUELLE: "Ce scan n'est pas une saisie manuelle",
};

/** Planned for a Tunis day before today and still not done. */
export function isPickupLate(plannedDayKey: string, todayKey: string): boolean {
  return plannedDayKey < todayKey;
}
