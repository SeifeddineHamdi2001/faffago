import { ParcelEventType } from './parcel-state-machine.js';
import { TrackStepState } from './seller-parcels.js';
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
 * The steps of the public timeline (Q2): Commande enregistrée → Chez Faffa Go
 * → En cours de livraison → Changement de client → Livré / Retourné au
 * vendeur / Commande annulée, each with a date.
 */
export const PublicTimelineStep = {
  COMMANDE_ENREGISTREE: 'COMMANDE_ENREGISTREE',
  CHEZ_FAFFA_GO: 'CHEZ_FAFFA_GO',
  EN_COURS_DE_LIVRAISON: 'EN_COURS_DE_LIVRAISON',
  CHANGEMENT_DE_CLIENT: 'CHANGEMENT_DE_CLIENT',
  LIVRE: 'LIVRE',
  RETOURNE_AU_VENDEUR: 'RETOURNE_AU_VENDEUR',
  COMMANDE_ANNULEE: 'COMMANDE_ANNULEE',
} as const;
export type PublicTimelineStep = (typeof PublicTimelineStep)[keyof typeof PublicTimelineStep];

export const PUBLIC_TIMELINE_STEP_BY_EVENT: Partial<Record<ParcelEventType, PublicTimelineStep>> = {
  CREATION: PublicTimelineStep.COMMANDE_ENREGISTREE,
  // Picked up and arrived at the depot are one step to the customer: "no
  // depot scans" (Q2).
  RAMASSAGE: PublicTimelineStep.CHEZ_FAFFA_GO,
  ENTREE_DEPOT: PublicTimelineStep.CHEZ_FAFFA_GO,
  SORTIE_COURSIER: PublicTimelineStep.EN_COURS_DE_LIVRAISON,
  DECISION_CHANGER_CLIENT: PublicTimelineStep.CHANGEMENT_DE_CLIENT,
  LIVRAISON: PublicTimelineStep.LIVRE,
  DEPART_RETOUR: PublicTimelineStep.RETOURNE_AU_VENDEUR,
  RETOUR_RECU: PublicTimelineStep.RETOURNE_AU_VENDEUR,
  ANNULATION: PublicTimelineStep.COMMANDE_ANNULEE,
};

export const PUBLIC_TIMELINE_STEP_LABELS_FR: Record<PublicTimelineStep, string> = {
  COMMANDE_ENREGISTREE: 'Commande enregistrée',
  CHEZ_FAFFA_GO: 'Chez Faffa Go',
  EN_COURS_DE_LIVRAISON: 'En cours de livraison',
  CHANGEMENT_DE_CLIENT: 'Changement de client',
  LIVRE: 'Livré',
  RETOURNE_AU_VENDEUR: 'Retourné au vendeur',
  COMMANDE_ANNULEE: 'Commande annulée',
};

/**
 * The timeline as the customer reads it: each public event as its step, and
 * a step repeated in a row shown once, at its latest date. A second attempt
 * goes out again after a failure the customer never sees, so it reads as one
 * "En cours de livraison" dated from when it really left.
 */
export function publicTimelineSteps(
  timeline: ReadonlyArray<{ type: ParcelEventType; at: string }>,
): Array<{ step: PublicTimelineStep; at: string }> {
  const out: Array<{ step: PublicTimelineStep; at: string }> = [];
  for (const event of timeline) {
    const step = PUBLIC_TIMELINE_STEP_BY_EVENT[event.type];
    if (!step) continue;
    const last = out.at(-1);
    if (last?.step === step) last.at = event.at;
    else out.push({ step, at: event.at });
  }
  return out;
}

/**
 * The chevron track line of the tracking page (Landing 4.1): the delivery
 * flow, its last step swapped for Retourné au vendeur on a return. A
 * cancelled order reads Commande enregistrée › Commande annulée (D-31).
 * `postponed` marks the current step of a delivery that was put off.
 */
export function publicTrackLine(status: PublicStatus): {
  steps: Array<{ step: PublicTimelineStep; state: TrackStepState }>;
  postponed: boolean;
} {
  const S = PublicTimelineStep;
  if (status === PublicStatus.COMMANDE_ANNULEE) {
    return {
      steps: [
        { step: S.COMMANDE_ENREGISTREE, state: TrackStepState.FAIT },
        { step: S.COMMANDE_ANNULEE, state: TrackStepState.ACTUEL },
      ],
      postponed: false,
    };
  }
  const last = status === PublicStatus.RETOURNE_AU_VENDEUR ? S.RETOURNE_AU_VENDEUR : S.LIVRE;
  const flow = [S.COMMANDE_ENREGISTREE, S.CHEZ_FAFFA_GO, S.EN_COURS_DE_LIVRAISON, last];
  const current: Record<PublicStatus, number> = {
    COMMANDE_ENREGISTREE: 0,
    CHEZ_FAFFA_GO: 1,
    EN_COURS_DE_LIVRAISON: 2,
    LIVRAISON_REPORTEE: 2,
    LIVRAISON_REPORTEE_CLIENT: 2,
    LIVRE: 3,
    RETOURNE_AU_VENDEUR: 3,
    COMMANDE_ANNULEE: 1,
  };
  const at = current[status];
  // A delivered parcel has nothing left to wait for: every step is done.
  const finished = status === PublicStatus.LIVRE;
  return {
    steps: flow.map((step, index) => ({
      step,
      state:
        index < at || finished
          ? TrackStepState.FAIT
          : index === at
            ? TrackStepState.ACTUEL
            : TrackStepState.A_VENIR,
    })),
    postponed:
      status === PublicStatus.LIVRAISON_REPORTEE ||
      status === PublicStatus.LIVRAISON_REPORTEE_CLIENT,
  };
}

/**
 * The public label for a parcel.
 *
 * Relancé normally reads "le vendeur va vous contacter", which is wrong when it
 * is the customer who asked for another day: he is expecting the parcel, not a
 * call. That case gets its own label and the date he chose (D-9).
 *
 * A seller who cancels after pickup sends the parcel back as a return, but the
 * customer's order is simply cancelled: the page says so for the rest of the
 * parcel's life (D-28). `cancelledAt` is set by every ANNULATION event.
 */
export function publicStatusFor(parcel: {
  status: ParcelStatus;
  relaunchOrigin: RelaunchOrigin | null;
  cancelledAt: Date | null;
}): PublicStatus {
  if (parcel.cancelledAt) return PublicStatus.COMMANDE_ANNULEE;
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
/**
 * Rate limiting on the public tracking endpoint (Landing 4.4): "repeated wrong
 * codes are slowed down". Mirrors `LOGIN_THROTTLE` (D-6) — held in memory, no
 * permanent lockout, one VPS — but keyed on the visitor's IP alone: a wrong
 * code is not an account, so there is no separate per-identifier bucket.
 */
export const PUBLIC_TRACKING_THROTTLE = {
  /** Wrong codes an IP may try before it is slowed down. */
  freeFailuresPerIp: 10,
  /** Never blocks longer than this. */
  maxDelaySeconds: 60,
  /** An IP with no wrong code for this long is forgotten. */
  forgetAfterSeconds: 3600,
} as const;

/** Doubling backoff after the free failures, capped, like `loginBackoffSeconds`. */
export function trackingBackoffSeconds(failures: number): number {
  const over = failures - PUBLIC_TRACKING_THROTTLE.freeFailuresPerIp;
  if (over <= 0) return 0;
  if (over > 6) return PUBLIC_TRACKING_THROTTLE.maxDelaySeconds;
  return Math.min(2 ** (over - 1), PUBLIC_TRACKING_THROTTLE.maxDelaySeconds);
}

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
