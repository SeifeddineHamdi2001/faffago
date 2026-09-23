import { ParcelEventType } from './parcel-state-machine.js';
import { ParcelStatus, RelaunchOrigin } from './statuses.js';

/**
 * Public parcel tracking (Landing 4).
 *
 * Anyone holding a code can call this, so everything here is deliberately
 * poor in information: the customer sees where the parcel is and nothing else.
 */

/** The simplified labels the customer sees. Landing 4.2. */
export const PublicStatus = {
  COMMANDE_ENREGISTREE: 'COMMANDE_ENREGISTREE',
  CHEZ_FAFFA_GO: 'CHEZ_FAFFA_GO',
  EN_COURS_DE_LIVRAISON: 'EN_COURS_DE_LIVRAISON',
  LIVRE: 'LIVRE',
  LIVRAISON_REPORTEE: 'LIVRAISON_REPORTEE',
  /** The customer himself asked for another day, so the page names it. */
  LIVRAISON_REPORTEE_CLIENT: 'LIVRAISON_REPORTEE_CLIENT',
  RETOURNE_AU_VENDEUR: 'RETOURNE_AU_VENDEUR',
  COMMANDE_ANNULEE: 'COMMANDE_ANNULEE',
} as const;
export type PublicStatus = (typeof PublicStatus)[keyof typeof PublicStatus];

export const PUBLIC_STATUS_BY_PARCEL_STATUS: Record<ParcelStatus, PublicStatus> = {
  CREE: PublicStatus.COMMANDE_ENREGISTREE,
  RAMASSE: PublicStatus.CHEZ_FAFFA_GO,
  AU_DEPOT: PublicStatus.CHEZ_FAFFA_GO,
  EN_LIVRAISON: PublicStatus.EN_COURS_DE_LIVRAISON,
  LIVRE: PublicStatus.LIVRE,
  A_VERIFIER: PublicStatus.LIVRAISON_REPORTEE,
  RELANCE: PublicStatus.LIVRAISON_REPORTEE,
  RETOUR_AU_DEPOT: PublicStatus.RETOURNE_AU_VENDEUR,
  RETOUR_EN_ROUTE: PublicStatus.RETOURNE_AU_VENDEUR,
  RETOUR_RECU: PublicStatus.RETOURNE_AU_VENDEUR,
  ANNULE: PublicStatus.COMMANDE_ANNULEE,
};

export const PUBLIC_STATUS_LABELS_FR: Record<PublicStatus, string> = {
  COMMANDE_ENREGISTREE: 'Commande enregistrée',
  CHEZ_FAFFA_GO: 'Chez Faffa Go',
  EN_COURS_DE_LIVRAISON: 'En cours de livraison',
  LIVRE: 'Livré',
  LIVRAISON_REPORTEE: 'Livraison reportée — le vendeur va vous contacter',
  LIVRAISON_REPORTEE_CLIENT: 'Livraison reportée',
  RETOURNE_AU_VENDEUR: 'Retourné au vendeur',
  COMMANDE_ANNULEE: 'Commande annulée',
};

/**
 * Arabic is written for Tunisian readers and reviewed by a native speaker,
 * never machine-translated (Landing 5). The Arabic labels therefore live in
 * the web app's `ar` message catalogue, keyed by these same names, and are
 * not filled in here.
 */
export const PUBLIC_STATUS_TRANSLATION_KEYS: Record<PublicStatus, string> = {
  COMMANDE_ENREGISTREE: 'tracking.status.commandeEnregistree',
  CHEZ_FAFFA_GO: 'tracking.status.chezFaffaGo',
  EN_COURS_DE_LIVRAISON: 'tracking.status.enCoursDeLivraison',
  LIVRE: 'tracking.status.livre',
  LIVRAISON_REPORTEE: 'tracking.status.livraisonReportee',
  LIVRAISON_REPORTEE_CLIENT: 'tracking.status.livraisonReporteeClient',
  RETOURNE_AU_VENDEUR: 'tracking.status.retourneAuVendeur',
  COMMANDE_ANNULEE: 'tracking.status.commandeAnnulee',
};

/**
 * The only events the public timeline may show (A-17, Q2).
 *
 * Failed attempts are deliberately absent: Landing 4.2 collapses À vérifier
 * and Relancé into one reassuring label, and listing three failures would
 * undo that. Depot handling and staff actions are absent for the same reason.
 */
export const PUBLIC_TIMELINE_EVENT_TYPES: readonly ParcelEventType[] = [
  ParcelEventType.CREATION,
  ParcelEventType.RAMASSAGE,
  ParcelEventType.ENTREE_DEPOT,
  ParcelEventType.SORTIE_COURSIER,
  ParcelEventType.DECISION_CHANGER_CLIENT,
  ParcelEventType.LIVRAISON,
  ParcelEventType.DEPART_RETOUR,
  ParcelEventType.RETOUR_RECU,
  ParcelEventType.ANNULATION,
];

export function isPublicTimelineEvent(type: ParcelEventType): boolean {
  return PUBLIC_TIMELINE_EVENT_TYPES.includes(type);
}

/**
 * The public label for a parcel.
 *
 * Relancé normally reads "le vendeur va vous contacter", which is wrong when it
 * is the customer who asked for another day: he is expecting the parcel, not a
 * call. That case gets its own label and the date he chose (D-9).
 */
export function publicStatusFor(parcel: {
  status: ParcelStatus;
  relaunchOrigin: RelaunchOrigin | null;
}): PublicStatus {
  if (parcel.status === ParcelStatus.RELANCE && parcel.relaunchOrigin === RelaunchOrigin.CLIENT) {
    return PublicStatus.LIVRAISON_REPORTEE_CLIENT;
  }
  return PUBLIC_STATUS_BY_PARCEL_STATUS[parcel.status];
}

/**
 * Exactly what the public endpoint may return (Landing 4.1).
 *
 * Never the customer's name, phone or address, never the failure reason, never
 * an internal note, never the livreur's phone (Landing 4.3). Only the livreur's
 * first name, as on the seller side.
 *
 * The amount to prepare in cash is shown on purpose: it is what the customer
 * needs in his hand when the courier knocks. After a Changer de client the page
 * shows the new delivery's amount and délégation, which say nothing about the
 * new customer (Q3).
 */
export interface PublicTrackingView {
  code: string;
  status: PublicStatus;
  lastUpdateAt: string;
  shopName: string;
  /** Resolved with `delegationNameFor` for the locale of the page (Q4). */
  delegationName: string;
  /** Millimes, as a decimal string. Formatted with `formatDT` in the page. */
  codAmountMillimes: string;
  livreurFirstName: string | null;
  /**
   * Set only when the customer asked to postpone: the day he chose. He asked
   * for it himself, so showing it back to him reveals nothing (D-9).
   */
  postponedTo: string | null;
  timeline: Array<{ type: ParcelEventType; at: string }>;
}
