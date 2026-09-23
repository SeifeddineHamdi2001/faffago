/**
 * Désactiver un coursier (Admin 4.15, D-12).
 *
 * The account stops receiving work at once; the deactivation itself waits
 * until nothing is open. Each blocker is counted and shown to the admin, so
 * he knows what to settle first.
 */

export const CourierBlockerType = {
  /** Parcels with the livreur, or picked up and carried by the ramasseur. */
  COLIS_EN_MAIN: 'COLIS_EN_MAIN',
  /** Delivered parcels whose cash is still CHEZ_LE_COURSIER. */
  ARGENT_CHEZ_LE_COURSIER: 'ARGENT_CHEZ_LE_COURSIER',
  BON_VERSEMENT_EN_ROUTE: 'BON_VERSEMENT_EN_ROUTE',
  BON_RETOUR_EN_ROUTE: 'BON_RETOUR_EN_ROUTE',
  // Checked from phase 8, with the Caisse and the pay.
  CAISSE_NON_CLOTUREE: 'CAISSE_NON_CLOTUREE',
  FICHE_DE_PAIE_A_PAYER: 'FICHE_DE_PAIE_A_PAYER',
  DETTE_EN_COURS: 'DETTE_EN_COURS',
} as const;
export type CourierBlockerType = (typeof CourierBlockerType)[keyof typeof CourierBlockerType];

export interface CourierBlocker {
  type: CourierBlockerType;
  count: number;
  label: string;
}

const LABELS: Record<CourierBlockerType, (n: number, s: string) => string> = {
  COLIS_EN_MAIN: (n) => `${n} colis en main`,
  ARGENT_CHEZ_LE_COURSIER: (n, s) => `${n} colis livré${s} dont l'argent n'est pas remis`,
  BON_VERSEMENT_EN_ROUTE: (n, s) => `${n} bon${s} de versement en route`,
  BON_RETOUR_EN_ROUTE: (n, s) => `${n} bon${s} de retour en route`,
  CAISSE_NON_CLOTUREE: (n, s) => `${n} session${s} de caisse non clôturée${s}`,
  FICHE_DE_PAIE_A_PAYER: (n, s) => `${n} fiche${s} de paie à payer`,
  DETTE_EN_COURS: (n, s) => `${n} dette${s} en cours`,
};

export function courierBlocker(type: CourierBlockerType, count: number): CourierBlocker {
  return { type, count, label: LABELS[type](count, count > 1 ? 's' : '') };
}

export const COURIER_DEACTIVATION_REFUSED =
  "Désactivation impossible tant que ce coursier a du travail ou de l'argent en cours.";
