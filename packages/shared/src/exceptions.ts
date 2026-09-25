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
} as const;
export type ExceptionKind = (typeof ExceptionKind)[keyof typeof ExceptionKind];

export const EXCEPTION_KIND_LABELS_FR: Record<ExceptionKind, string> = {
  COLIS_AU_DEPOT_SANS_TOURNEE: 'Colis au dépôt depuis plus de 48 h sans tournée',
  RAMASSAGE_NON_EFFECTUE: 'Ramassage planifié non effectué',
  DEMANDE_VENDEUR: 'Demande de modification du vendeur en attente',
  SAISIE_MANUELLE: 'Saisie manuelle du code',
};

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
