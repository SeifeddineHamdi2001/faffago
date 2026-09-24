import { Role, SYSTEM_ACTOR, type Actor } from './roles.js';
import {
  FailureReason,
  ParcelCashStatus,
  ParcelLocation,
  ParcelStatus,
  RelaunchOrigin,
  type RelaunchSlot,
} from './statuses.js';

/**
 * The parcel state machine.
 *
 * Every status change in the platform goes through this function. It is pure:
 * it takes the parcel as it is now plus one action, and returns either a
 * refusal with a reason in French, or the new state together with the events
 * to append. The API's parcel event service writes those events inside one
 * transaction and never touches a status column directly (CLAUDE.md).
 *
 * The courier app runs the same function offline to decide whether to queue a
 * scan, which is why it lives in packages/shared and depends on nothing.
 */

// ─────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────

/** Mirrored 1:1 by the `ParcelEventType` enum in schema.prisma. */
export const ParcelEventType = {
  CREATION: 'CREATION',
  MODIFICATION_VENDEUR: 'MODIFICATION_VENDEUR',
  ANNULATION: 'ANNULATION',
  RAMASSAGE: 'RAMASSAGE',
  ENTREE_DEPOT: 'ENTREE_DEPOT',
  SORTIE_COURSIER: 'SORTIE_COURSIER',
  AFFECTATION_LIVREUR: 'AFFECTATION_LIVREUR',
  LIVRAISON: 'LIVRAISON',
  ECHEC_LIVRAISON: 'ECHEC_LIVRAISON',
  RETOUR_DE_TOURNEE: 'RETOUR_DE_TOURNEE',
  DECISION_RELANCER: 'DECISION_RELANCER',
  DECISION_RETOURNER: 'DECISION_RETOURNER',
  DECISION_CHANGER_CLIENT: 'DECISION_CHANGER_CLIENT',
  RETOUR_AUTO_48H: 'RETOUR_AUTO_48H',
  RETOUR_AUTO_3E_TENTATIVE: 'RETOUR_AUTO_3E_TENTATIVE',
  PREPARATION_RETOUR: 'PREPARATION_RETOUR',
  DEPART_RETOUR: 'DEPART_RETOUR',
  RETOUR_RECU: 'RETOUR_RECU',
  ENCAISSEMENT_DEPOT: 'ENCAISSEMENT_DEPOT',
  PAIEMENT_VENDEUR: 'PAIEMENT_VENDEUR',
  ARTICLE_ECHANGE_RECUPERE: 'ARTICLE_ECHANGE_RECUPERE',
  FORCAGE_STATUT: 'FORCAGE_STATUT',
  ANNULATION_SCAN: 'ANNULATION_SCAN',
} as const;
export type ParcelEventType = (typeof ParcelEventType)[keyof typeof ParcelEventType];

/** What a person or a job can ask of a parcel. */
export const ParcelAction = {
  MODIFIER: 'MODIFIER',
  ANNULER: 'ANNULER',
  SCAN_RAMASSAGE: 'SCAN_RAMASSAGE',
  SCAN_ENTREE_DEPOT: 'SCAN_ENTREE_DEPOT',
  SCAN_SORTIE_COURSIER: 'SCAN_SORTIE_COURSIER',
  SCAN_LIVRE: 'SCAN_LIVRE',
  SCAN_ECHEC: 'SCAN_ECHEC',
  SCAN_RETOUR_DE_TOURNEE: 'SCAN_RETOUR_DE_TOURNEE',
  SCAN_PREPARATION_RETOURS: 'SCAN_PREPARATION_RETOURS',
  SCAN_RETOUR_RECU: 'SCAN_RETOUR_RECU',
  DECISION_RELANCER: 'DECISION_RELANCER',
  DECISION_RETOURNER: 'DECISION_RETOURNER',
  DECISION_CHANGER_CLIENT: 'DECISION_CHANGER_CLIENT',
  /** The seller moves the date of an already planned relance (D-9). */
  DECISION_CHANGER_DATE: 'DECISION_CHANGER_DATE',
  DEPART_RETOUR: 'DEPART_RETOUR',
  AUTO_RETOUR_48H: 'AUTO_RETOUR_48H',
} as const;
export type ParcelAction = (typeof ParcelAction)[keyof typeof ParcelAction];

/**
 * A customer postponement is planned for tomorrow at the earliest and a week
 * ahead at the latest (D-9). Beyond that the seller should decide what
 * to do with the parcel rather than let it sit in the depot.
 */
export const POSTPONEMENT_MIN_DAYS = 1;
export const POSTPONEMENT_MAX_DAYS = 7;

/** Compares two dates by their day, ignoring the time of day. */
function daysBetween(from: Date, to: Date): number {
  const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000);
}

export function isValidPostponementDate(postponedTo: Date, today: Date): boolean {
  const offset = daysBetween(today, postponedTo);
  return offset >= POSTPONEMENT_MIN_DAYS && offset <= POSTPONEMENT_MAX_DAYS;
}

/** Side effects the caller must perform in the same transaction. */
export const ParcelEffect = {
  CREER_FRAIS_LIVRAISON: 'CREER_FRAIS_LIVRAISON',
  CREER_FRAIS_RETOUR: 'CREER_FRAIS_RETOUR',
  CREER_FRAIS_CHANGEMENT_CLIENT: 'CREER_FRAIS_CHANGEMENT_CLIENT',
  FIGER_TARIF_COURSIER: 'FIGER_TARIF_COURSIER',
  DEMARRER_DELAI_VERIFICATION: 'DEMARRER_DELAI_VERIFICATION',
  ARRETER_DELAI_VERIFICATION: 'ARRETER_DELAI_VERIFICATION',
  REINITIALISER_TENTATIVES: 'REINITIALISER_TENTATIVES',
  /** Record the date and slot, and tell the seller the customer postponed. */
  PLANIFIER_RELANCE: 'PLANIFIER_RELANCE',
  ARTICLE_ECHANGE_A_RECUPERER: 'ARTICLE_ECHANGE_A_RECUPERER',
  /** Create the thread, or reopen it with the livreur who just took the parcel. */
  OUVRIR_CHAT: 'OUVRIR_CHAT',
  /** Read-only for the seller and couriers; Faffa Go still replies (Q15). */
  VERROUILLER_CHAT: 'VERROUILLER_CHAT',
  /** Closed for good. */
  CLOTURER_CHAT: 'CLOTURER_CHAT',
} as const;
export type ParcelEffect = (typeof ParcelEffect)[keyof typeof ParcelEffect];

/** Refusal codes, with the message the scanner screen shows (Admin 4.2). */
export const ScanRefusal = {
  CODE_INCONNU: 'CODE_INCONNU',
  MAUVAIS_MODE: 'MAUVAIS_MODE',
  COLIS_DEJA_LIVRE: 'COLIS_DEJA_LIVRE',
  COLIS_ANNULE: 'COLIS_ANNULE',
  COLIS_CLOTURE: 'COLIS_CLOTURE',
  COLIS_AUTRE_COURSIER: 'COLIS_AUTRE_COURSIER',
  COLIS_PAS_AU_DEPOT: 'COLIS_PAS_AU_DEPOT',
  MOTIF_ECHEC_REQUIS: 'MOTIF_ECHEC_REQUIS',
  ROLE_NON_AUTORISE: 'ROLE_NON_AUTORISE',
  TENTATIVES_EPUISEES: 'TENTATIVES_EPUISEES',
  CHANGEMENT_CLIENT_DEJA_UTILISE: 'CHANGEMENT_CLIENT_DEJA_UTILISE',
  COURSIER_NON_PRECISE: 'COURSIER_NON_PRECISE',
  DATE_REPORT_REQUISE: 'DATE_REPORT_REQUISE',
  DATE_REPORT_INVALIDE: 'DATE_REPORT_INVALIDE',
  /** The seller's Relancer carries its date (D-9, D-29). */
  DATE_RELANCE_REQUISE: 'DATE_RELANCE_REQUISE',
} as const;
export type ScanRefusal = (typeof ScanRefusal)[keyof typeof ScanRefusal];

export const SCAN_REFUSAL_MESSAGES_FR: Record<ScanRefusal, string> = {
  CODE_INCONNU: 'Code inconnu',
  MAUVAIS_MODE: 'Mauvais mode',
  COLIS_DEJA_LIVRE: 'Colis déjà livré',
  COLIS_ANNULE: 'Colis annulé',
  COLIS_CLOTURE: 'Colis clôturé',
  COLIS_AUTRE_COURSIER: "Colis d'un autre coursier",
  COLIS_PAS_AU_DEPOT: "Le colis n'est pas au dépôt",
  MOTIF_ECHEC_REQUIS: "Motif d'échec obligatoire",
  ROLE_NON_AUTORISE: 'Action non autorisée pour ce rôle',
  TENTATIVES_EPUISEES: 'Nombre maximum de tentatives atteint',
  CHANGEMENT_CLIENT_DEJA_UTILISE: 'Changement de client déjà utilisé pour ce colis',
  COURSIER_NON_PRECISE: 'Choisissez un coursier avant de scanner',
  DATE_REPORT_REQUISE: 'Choisissez la date de report demandée par le client',
  DATE_REPORT_INVALIDE: 'La date doit être comprise entre demain et 7 jours',
  // Neutral on purpose: the seller's wording comes with the phase 7 screen (D-29).
  DATE_RELANCE_REQUISE: 'Date de relance obligatoire',
};

// ─────────────────────────────────────────────────────────────
// Shapes
// ─────────────────────────────────────────────────────────────

/** The part of a parcel the machine reads. */
export interface ParcelSnapshot {
  status: ParcelStatus;
  location: ParcelLocation;
  cashStatus: ParcelCashStatus | null;
  attemptCount: number;
  changeClientCount: number;
  currentLivreurId: string | null;
  isExchange: boolean;
  /** Set while the parcel is RELANCE: the day it should go out again. */
  relaunchDate: Date | null;
  /** Who asked for that date: the seller, or the customer (D-9). */
  relaunchOrigin: RelaunchOrigin | null;
  relaunchSlot: RelaunchSlot | null;
}

export interface ParcelActionCommand {
  action: ParcelAction;
  actor: Actor;
  /** The courier's id when a courier acts, used to refuse another courier's parcel. */
  actorCourierId?: string | null;
  /** Sortie coursier: the livreur chosen on the scan screen before scanning. */
  assignToCourierId?: string | null;
  failureReason?: FailureReason;
  /**
   * Required when the reason is REPORTE_PAR_LE_CLIENT, and when the seller
   * moves an existing date. Between tomorrow and seven days out.
   */
  postponedTo?: Date | null;
  relaunchSlot?: RelaunchSlot | null;
  /** The business day the action happens on, used to validate that window. */
  today?: Date;
  maxAttempts: number;
  maxClientChanges: number;
}

export interface ParcelTransitionEvent {
  type: ParcelEventType;
  previousStatus: ParcelStatus;
  newStatus: ParcelStatus;
  previousLocation: ParcelLocation;
  newLocation: ParcelLocation;
  effects: ParcelEffect[];
  /** Stored on the event, so the history says why when the type alone does not. */
  metadata?: Record<string, string>;
}

/**
 * Written on the ANNULATION event of a cancellation after pickup (D-28), which
 * sends the parcel back like Retourner rather than closing it.
 */
export const CANCELLATION_AFTER_PICKUP = 'APRES_RAMASSAGE';
export const CANCELLATION_AFTER_PICKUP_LABEL_FR = 'Après ramassage';

/** Where the seller can still cancel after pickup (D-28). */
const CANCELLABLE_AFTER_PICKUP: readonly ParcelStatus[] = [
  ParcelStatus.RAMASSE,
  ParcelStatus.AU_DEPOT,
  ParcelStatus.EN_LIVRAISON,
  ParcelStatus.A_VERIFIER,
  ParcelStatus.RELANCE,
];

export type ParcelTransition =
  | { ok: true; next: ParcelSnapshot; events: ParcelTransitionEvent[] }
  | { ok: false; refusal: ScanRefusal; message: string };

const ALLOWED_ACTORS: Record<ParcelAction, readonly Actor[]> = {
  MODIFIER: [Role.VENDEUR],
  ANNULER: [Role.VENDEUR],
  SCAN_RAMASSAGE: [Role.RAMASSEUR],
  SCAN_ENTREE_DEPOT: [Role.ADMIN, Role.DEPOT],
  SCAN_SORTIE_COURSIER: [Role.ADMIN, Role.DEPOT],
  SCAN_LIVRE: [Role.LIVREUR],
  SCAN_ECHEC: [Role.LIVREUR],
  SCAN_RETOUR_DE_TOURNEE: [Role.ADMIN, Role.DEPOT],
  SCAN_PREPARATION_RETOURS: [Role.ADMIN, Role.DEPOT],
  SCAN_RETOUR_RECU: [Role.RAMASSEUR],
  // Only the seller decides. The team follows up but never decides a return
  // (Admin rule 13, Vendeur decision 13).
  DECISION_RELANCER: [Role.VENDEUR],
  DECISION_RETOURNER: [Role.VENDEUR],
  DECISION_CHANGER_CLIENT: [Role.VENDEUR],
  DECISION_CHANGER_DATE: [Role.VENDEUR],
  DEPART_RETOUR: [Role.ADMIN, Role.DEPOT],
  AUTO_RETOUR_48H: [SYSTEM_ACTOR],
};

function refuse(refusal: ScanRefusal): ParcelTransition {
  return { ok: false, refusal, message: SCAN_REFUSAL_MESSAGES_FR[refusal] };
}

function event(
  type: ParcelEventType,
  from: ParcelSnapshot,
  newStatus: ParcelStatus,
  newLocation: ParcelLocation,
  effects: ParcelEffect[] = [],
): ParcelTransitionEvent {
  return {
    type,
    previousStatus: from.status,
    newStatus,
    previousLocation: from.location,
    newLocation,
    effects,
  };
}

/**
 * Why a generic refusal is a "mauvais mode": at the depot every refusal the
 * team can act on is either a wrong scanning mode or a parcel that has already
 * left the flow, and the specs give those exact four messages.
 */
function refuseByStatus(parcel: ParcelSnapshot): ParcelTransition {
  if (parcel.status === ParcelStatus.LIVRE) return refuse(ScanRefusal.COLIS_DEJA_LIVRE);
  if (parcel.status === ParcelStatus.ANNULE) return refuse(ScanRefusal.COLIS_ANNULE);
  if (parcel.status === ParcelStatus.RETOUR_RECU) return refuse(ScanRefusal.COLIS_CLOTURE);
  return refuse(ScanRefusal.MAUVAIS_MODE);
}

// ─────────────────────────────────────────────────────────────
// The machine
// ─────────────────────────────────────────────────────────────

export function applyParcelAction(
  parcel: ParcelSnapshot,
  command: ParcelActionCommand,
): ParcelTransition {
  const { action, actor } = command;

  if (!ALLOWED_ACTORS[action].includes(actor)) {
    return refuse(ScanRefusal.ROLE_NON_AUTORISE);
  }

  switch (action) {
    // ── Before pickup ────────────────────────────────────────
    case ParcelAction.MODIFIER: {
      // Free edit only before pickup; afterwards the seller files a change
      // request instead (Vendeur 4.6). No status change.
      if (parcel.status !== ParcelStatus.CREE) return refuseByStatus(parcel);
      return {
        ok: true,
        next: parcel,
        events: [
          event(ParcelEventType.MODIFICATION_VENDEUR, parcel, parcel.status, parcel.location),
        ],
      };
    }

    case ParcelAction.ANNULER: {
      if (parcel.status === ParcelStatus.CREE) {
        return {
          ok: true,
          next: { ...parcel, status: ParcelStatus.ANNULE },
          events: [
            event(ParcelEventType.ANNULATION, parcel, ParcelStatus.ANNULE, parcel.location, [
              ParcelEffect.CLOTURER_CHAT,
            ]),
          ],
        };
      }
      if (!CANCELLABLE_AFTER_PICKUP.includes(parcel.status)) return refuseByStatus(parcel);

      // After pickup a cancellation is a return the seller asks for (Vendeur
      // 4.6): exactly Retourner, return fee included, and the parcel stays
      // where it is until it is scanned back (A-7). Only the event type and its
      // metadata tell the two apart in the history (D-28).
      return {
        ok: true,
        next: { ...parcel, status: ParcelStatus.RETOUR_AU_DEPOT },
        events: [
          {
            ...event(
              ParcelEventType.ANNULATION,
              parcel,
              ParcelStatus.RETOUR_AU_DEPOT,
              parcel.location,
              [ParcelEffect.ARRETER_DELAI_VERIFICATION, ParcelEffect.CREER_FRAIS_RETOUR],
            ),
            metadata: { annulation: CANCELLATION_AFTER_PICKUP },
          },
        ],
      };
    }

    // ── Pickup and depot ─────────────────────────────────────
    case ParcelAction.SCAN_RAMASSAGE: {
      if (parcel.status !== ParcelStatus.CREE) return refuseByStatus(parcel);
      return {
        ok: true,
        next: {
          ...parcel,
          status: ParcelStatus.RAMASSE,
          location: ParcelLocation.AVEC_LE_RAMASSEUR,
        },
        events: [
          event(
            ParcelEventType.RAMASSAGE,
            parcel,
            ParcelStatus.RAMASSE,
            ParcelLocation.AVEC_LE_RAMASSEUR,
          ),
        ],
      };
    }

    case ParcelAction.SCAN_ENTREE_DEPOT: {
      // A parcel cancelled while the ramasseur carried it is already a return
      // (D-28). Entrée dépôt takes it in without touching the status, the way
      // Retour de tournée does for a livreur's parcel.
      if (
        parcel.status === ParcelStatus.RETOUR_AU_DEPOT &&
        parcel.location === ParcelLocation.AVEC_LE_RAMASSEUR
      ) {
        return {
          ok: true,
          next: { ...parcel, location: ParcelLocation.AU_DEPOT },
          events: [
            event(ParcelEventType.ENTREE_DEPOT, parcel, parcel.status, ParcelLocation.AU_DEPOT),
          ],
        };
      }
      if (parcel.status !== ParcelStatus.RAMASSE) return refuseByStatus(parcel);
      return {
        ok: true,
        next: {
          ...parcel,
          status: ParcelStatus.AU_DEPOT,
          location: ParcelLocation.AU_DEPOT,
        },
        events: [
          event(
            ParcelEventType.ENTREE_DEPOT,
            parcel,
            ParcelStatus.AU_DEPOT,
            ParcelLocation.AU_DEPOT,
          ),
        ],
      };
    }

    // ── Dispatch ─────────────────────────────────────────────
    case ParcelAction.SCAN_SORTIE_COURSIER: {
      const dispatchable: readonly ParcelStatus[] = [ParcelStatus.AU_DEPOT, ParcelStatus.RELANCE];
      if (!dispatchable.includes(parcel.status)) return refuseByStatus(parcel);
      if (parcel.location !== ParcelLocation.AU_DEPOT) {
        return refuse(ScanRefusal.COLIS_PAS_AU_DEPOT);
      }
      if (!command.assignToCourierId) return refuse(ScanRefusal.COURSIER_NON_PRECISE);

      return {
        ok: true,
        next: {
          ...parcel,
          status: ParcelStatus.EN_LIVRAISON,
          location: ParcelLocation.AVEC_LE_LIVREUR,
          currentLivreurId: command.assignToCourierId,
          // The planned date has been acted on; the parcel is out.
          relaunchDate: null,
          relaunchSlot: null,
          relaunchOrigin: null,
        },
        events: [
          event(
            ParcelEventType.SORTIE_COURSIER,
            parcel,
            ParcelStatus.EN_LIVRAISON,
            ParcelLocation.AVEC_LE_LIVREUR,
            // The chat opens when a livreur actually takes the parcel out, not
            // when the Tournées screen pre-fills his column (Q14). On a second
            // trip after Relancer or Changer de client this reopens the same
            // thread, and the new livreur reads the whole history (Q15).
            [ParcelEffect.OUVRIR_CHAT],
          ),
        ],
      };
    }

    // ── At the customer ──────────────────────────────────────
    case ParcelAction.SCAN_LIVRE: {
      if (parcel.status !== ParcelStatus.EN_LIVRAISON) return refuseByStatus(parcel);
      if (parcel.currentLivreurId && parcel.currentLivreurId !== command.actorCourierId) {
        return refuse(ScanRefusal.COLIS_AUTRE_COURSIER);
      }

      const effects: ParcelEffect[] = [
        // The delivery fee is charged only on a delivered parcel (A-1).
        ParcelEffect.CREER_FRAIS_LIVRAISON,
        // The livreur's rate is frozen here, so a later rate change cannot
        // move pay he has already earned (A-15).
        ParcelEffect.FIGER_TARIF_COURSIER,
      ];
      if (parcel.isExchange) effects.push(ParcelEffect.ARTICLE_ECHANGE_A_RECUPERER);

      return {
        ok: true,
        next: {
          ...parcel,
          status: ParcelStatus.LIVRE,
          location: ParcelLocation.CHEZ_LE_CLIENT,
          cashStatus: ParcelCashStatus.CHEZ_LE_COURSIER,
          attemptCount: parcel.attemptCount + 1,
        },
        events: [
          event(
            ParcelEventType.LIVRAISON,
            parcel,
            ParcelStatus.LIVRE,
            ParcelLocation.CHEZ_LE_CLIENT,
            effects,
          ),
        ],
      };
    }

    case ParcelAction.SCAN_ECHEC: {
      if (parcel.status !== ParcelStatus.EN_LIVRAISON) return refuseByStatus(parcel);
      if (parcel.currentLivreurId && parcel.currentLivreurId !== command.actorCourierId) {
        return refuse(ScanRefusal.COLIS_AUTRE_COURSIER);
      }
      if (!command.failureReason) return refuse(ScanRefusal.MOTIF_ECHEC_REQUIS);

      const attemptCount = parcel.attemptCount + 1;
      const exhausted = attemptCount >= command.maxAttempts;
      const isPostponement = command.failureReason === FailureReason.REPORTE_PAR_LE_CLIENT;

      // A postponement carries the date the customer asked for. It is checked
      // even on the last attempt, so the courier gets the same message
      // whatever the attempt number rather than a confusing silent return.
      if (isPostponement) {
        if (!command.postponedTo) return refuse(ScanRefusal.DATE_REPORT_REQUISE);
        if (!command.today || !isValidPostponementDate(command.postponedTo, command.today)) {
          return refuse(ScanRefusal.DATE_REPORT_INVALIDE);
        }
      }

      // A customer postponement is planned, not verified: the parcel goes
      // straight to Relancé with its date and never enters À vérifier, so no
      // 48-hour clock starts and the seller has nothing to decide (D-9).
      // The three-attempt rule still wins on the last attempt.
      if (isPostponement && !exhausted) {
        return {
          ok: true,
          next: {
            ...parcel,
            status: ParcelStatus.RELANCE,
            location: ParcelLocation.AVEC_LE_LIVREUR,
            attemptCount,
            relaunchDate: command.postponedTo ?? null,
            relaunchSlot: command.relaunchSlot ?? null,
            relaunchOrigin: RelaunchOrigin.CLIENT,
          },
          events: [
            {
              type: ParcelEventType.ECHEC_LIVRAISON,
              previousStatus: parcel.status,
              newStatus: ParcelStatus.RELANCE,
              previousLocation: parcel.location,
              newLocation: ParcelLocation.AVEC_LE_LIVREUR,
              effects: [ParcelEffect.PLANIFIER_RELANCE],
            },
          ],
        };
      }

      // A failed delivery always goes to À vérifier first (CLAUDE.md), even
      // when it is the last attempt, so the timeline records the failure and
      // its reason before the automatic return.
      const failure = event(
        ParcelEventType.ECHEC_LIVRAISON,
        parcel,
        ParcelStatus.A_VERIFIER,
        ParcelLocation.AVEC_LE_LIVREUR,
        exhausted ? [] : [ParcelEffect.DEMARRER_DELAI_VERIFICATION],
      );

      if (!exhausted) {
        return {
          ok: true,
          next: {
            ...parcel,
            status: ParcelStatus.A_VERIFIER,
            location: ParcelLocation.AVEC_LE_LIVREUR,
            attemptCount,
          },
          events: [failure],
        };
      }

      // Third failed attempt: automatic return, no seller decision (A-6).
      const autoReturn: ParcelTransitionEvent = {
        type: ParcelEventType.RETOUR_AUTO_3E_TENTATIVE,
        previousStatus: ParcelStatus.A_VERIFIER,
        newStatus: ParcelStatus.RETOUR_AU_DEPOT,
        previousLocation: ParcelLocation.AVEC_LE_LIVREUR,
        newLocation: ParcelLocation.AVEC_LE_LIVREUR,
        effects: [ParcelEffect.CREER_FRAIS_RETOUR],
      };

      return {
        ok: true,
        next: {
          ...parcel,
          status: ParcelStatus.RETOUR_AU_DEPOT,
          location: ParcelLocation.AVEC_LE_LIVREUR,
          attemptCount,
        },
        events: [failure, autoReturn],
      };
    }

    // ── Back at the depot ────────────────────────────────────
    case ParcelAction.SCAN_RETOUR_DE_TOURNEE: {
      if (parcel.location !== ParcelLocation.AVEC_LE_LIVREUR) {
        return refuseByStatus(parcel);
      }

      // A parcel that went out and was never attempted comes back to the
      // depot as if it had never left, attempt counter untouched (A-8).
      if (parcel.status === ParcelStatus.EN_LIVRAISON) {
        return {
          ok: true,
          next: {
            ...parcel,
            status: ParcelStatus.AU_DEPOT,
            location: ParcelLocation.AU_DEPOT,
            currentLivreurId: null,
          },
          events: [
            event(
              ParcelEventType.RETOUR_DE_TOURNEE,
              parcel,
              ParcelStatus.AU_DEPOT,
              ParcelLocation.AU_DEPOT,
              [ParcelEffect.VERROUILLER_CHAT],
            ),
          ],
        };
      }

      const returnable: readonly ParcelStatus[] = [
        ParcelStatus.A_VERIFIER,
        ParcelStatus.RELANCE,
        ParcelStatus.RETOUR_AU_DEPOT,
      ];
      if (!returnable.includes(parcel.status)) return refuseByStatus(parcel);

      // The status does not move. Only the location does, and that is what
      // unlocks Changer de client (Admin 4.2). No livreur holds the parcel any
      // more, so the chat goes read-only until it goes out again (Q15).
      return {
        ok: true,
        next: { ...parcel, location: ParcelLocation.AU_DEPOT },
        events: [
          event(ParcelEventType.RETOUR_DE_TOURNEE, parcel, parcel.status, ParcelLocation.AU_DEPOT, [
            ParcelEffect.VERROUILLER_CHAT,
          ]),
        ],
      };
    }

    // ── Seller decisions ─────────────────────────────────────
    case ParcelAction.DECISION_RELANCER: {
      if (parcel.status !== ParcelStatus.A_VERIFIER) return refuseByStatus(parcel);
      if (parcel.attemptCount >= command.maxAttempts) {
        return refuse(ScanRefusal.TENTATIVES_EPUISEES);
      }
      // The seller picks a date and a slot (Vendeur 4.9), validated in the same
      // window as a customer postponement so the two cannot diverge. The date
      // is required: the database stores a relance with its date or not at all
      // (D-9, D-29).
      if (!command.postponedTo) return refuse(ScanRefusal.DATE_RELANCE_REQUISE);
      if (!command.today || !isValidPostponementDate(command.postponedTo, command.today)) {
        return refuse(ScanRefusal.DATE_REPORT_INVALIDE);
      }
      // Relancer is free and gives one new attempt. It can be chosen while the
      // courier still has the parcel, so the location does not move.
      return {
        ok: true,
        next: {
          ...parcel,
          status: ParcelStatus.RELANCE,
          relaunchDate: command.postponedTo,
          relaunchSlot: command.relaunchSlot ?? null,
          relaunchOrigin: RelaunchOrigin.VENDEUR,
        },
        events: [
          event(ParcelEventType.DECISION_RELANCER, parcel, ParcelStatus.RELANCE, parcel.location, [
            ParcelEffect.ARRETER_DELAI_VERIFICATION,
            ParcelEffect.PLANIFIER_RELANCE,
          ]),
        ],
      };
    }

    case ParcelAction.DECISION_CHANGER_DATE: {
      // Only while the parcel is still waiting: once it is out with a livreur
      // again, the date has been acted on (D-9).
      if (parcel.status !== ParcelStatus.RELANCE) return refuseByStatus(parcel);
      if (!command.postponedTo) return refuse(ScanRefusal.DATE_REPORT_REQUISE);
      if (!command.today || !isValidPostponementDate(command.postponedTo, command.today)) {
        return refuse(ScanRefusal.DATE_REPORT_INVALIDE);
      }
      // The origin does not change: a date the customer asked for stays shown
      // as "Reporté" even after the seller moves it.
      return {
        ok: true,
        next: {
          ...parcel,
          relaunchDate: command.postponedTo,
          relaunchSlot: command.relaunchSlot ?? parcel.relaunchSlot,
        },
        events: [
          event(ParcelEventType.DECISION_RELANCER, parcel, parcel.status, parcel.location, [
            ParcelEffect.PLANIFIER_RELANCE,
          ]),
        ],
      };
    }

    case ParcelAction.DECISION_RETOURNER: {
      // Also from Relancé: a seller who sees a postponement he does not believe
      // in can return the parcel without waiting for it to fail again.
      if (parcel.status !== ParcelStatus.A_VERIFIER && parcel.status !== ParcelStatus.RELANCE) {
        return refuseByStatus(parcel);
      }
      // The status flips on the decision; the parcel may still be in the
      // courier's bag until the Retour de tournée scan (A-7).
      return {
        ok: true,
        next: { ...parcel, status: ParcelStatus.RETOUR_AU_DEPOT },
        events: [
          event(
            ParcelEventType.DECISION_RETOURNER,
            parcel,
            ParcelStatus.RETOUR_AU_DEPOT,
            parcel.location,
            [ParcelEffect.ARRETER_DELAI_VERIFICATION, ParcelEffect.CREER_FRAIS_RETOUR],
          ),
        ],
      };
    }

    case ParcelAction.DECISION_CHANGER_CLIENT: {
      // Also from Relancé, once the parcel is back at the depot (D-9).
      if (parcel.status !== ParcelStatus.A_VERIFIER && parcel.status !== ParcelStatus.RELANCE) {
        return refuseByStatus(parcel);
      }
      // Never while the courier has it (Vendeur rule 14, Admin rule 12).
      if (parcel.location !== ParcelLocation.AU_DEPOT) {
        return refuse(ScanRefusal.COLIS_PAS_AU_DEPOT);
      }
      if (parcel.changeClientCount >= command.maxClientChanges) {
        return refuse(ScanRefusal.CHANGEMENT_CLIENT_DEJA_UTILISE);
      }

      // A fresh customer means a fresh parcel at the depot: the counter goes
      // back to zero and the parcel waits for the next tour (A-6).
      return {
        ok: true,
        next: {
          ...parcel,
          status: ParcelStatus.AU_DEPOT,
          attemptCount: 0,
          changeClientCount: parcel.changeClientCount + 1,
          // A new customer means any date planned for the old one is void.
          relaunchDate: null,
          relaunchSlot: null,
          relaunchOrigin: null,
        },
        events: [
          event(
            ParcelEventType.DECISION_CHANGER_CLIENT,
            parcel,
            ParcelStatus.AU_DEPOT,
            ParcelLocation.AU_DEPOT,
            [
              ParcelEffect.ARRETER_DELAI_VERIFICATION,
              ParcelEffect.REINITIALISER_TENTATIVES,
              ParcelEffect.CREER_FRAIS_CHANGEMENT_CLIENT,
            ],
          ),
        ],
      };
    }

    case ParcelAction.AUTO_RETOUR_48H: {
      if (parcel.status !== ParcelStatus.A_VERIFIER) return refuseByStatus(parcel);
      return {
        ok: true,
        next: { ...parcel, status: ParcelStatus.RETOUR_AU_DEPOT },
        events: [
          event(
            ParcelEventType.RETOUR_AUTO_48H,
            parcel,
            ParcelStatus.RETOUR_AU_DEPOT,
            parcel.location,
            [ParcelEffect.ARRETER_DELAI_VERIFICATION, ParcelEffect.CREER_FRAIS_RETOUR],
          ),
        ],
      };
    }

    // ── Returns ──────────────────────────────────────────────
    case ParcelAction.SCAN_PREPARATION_RETOURS: {
      if (parcel.status !== ParcelStatus.RETOUR_AU_DEPOT) return refuseByStatus(parcel);
      if (parcel.location !== ParcelLocation.AU_DEPOT) {
        return refuse(ScanRefusal.COLIS_PAS_AU_DEPOT);
      }
      // Grouping into the seller's bon de retour does not move the parcel.
      return {
        ok: true,
        next: parcel,
        events: [event(ParcelEventType.PREPARATION_RETOUR, parcel, parcel.status, parcel.location)],
      };
    }

    case ParcelAction.DEPART_RETOUR: {
      if (parcel.status !== ParcelStatus.RETOUR_AU_DEPOT) return refuseByStatus(parcel);
      return {
        ok: true,
        next: {
          ...parcel,
          status: ParcelStatus.RETOUR_EN_ROUTE,
          location: ParcelLocation.AVEC_LE_RAMASSEUR,
        },
        events: [
          event(
            ParcelEventType.DEPART_RETOUR,
            parcel,
            ParcelStatus.RETOUR_EN_ROUTE,
            ParcelLocation.AVEC_LE_RAMASSEUR,
          ),
        ],
      };
    }

    case ParcelAction.SCAN_RETOUR_RECU: {
      if (parcel.status !== ParcelStatus.RETOUR_EN_ROUTE) return refuseByStatus(parcel);
      // Faffa Go's responsibility ends here (Vendeur 4.12).
      return {
        ok: true,
        next: {
          ...parcel,
          status: ParcelStatus.RETOUR_RECU,
          location: ParcelLocation.RENDU_AU_VENDEUR,
        },
        events: [
          event(
            ParcelEventType.RETOUR_RECU,
            parcel,
            ParcelStatus.RETOUR_RECU,
            ParcelLocation.RENDU_AU_VENDEUR,
            [ParcelEffect.CLOTURER_CHAT],
          ),
        ],
      };
    }

    default: {
      const exhaustive: never = action;
      throw new Error(`Action inconnue : ${String(exhaustive)}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Cash
// ─────────────────────────────────────────────────────────────

export const CashTransition = {
  /** The courier's Caisse session is closed: the cash is now at the depot. */
  CLOTURE_CAISSE: 'CLOTURE_CAISSE',
  /** The seller signed the bon de versement and the ramasseur scanned its QR. */
  BON_REMIS: 'BON_REMIS',
  /** The admin cancelled a bon that never reached the seller (A-5b). */
  BON_ANNULE: 'BON_ANNULE',
} as const;
export type CashTransition = (typeof CashTransition)[keyof typeof CashTransition];

/**
 * The cash side of a parcel, which moves independently of the delivery status
 * once the parcel is Livré (Vendeur, "Delivered is not the same as paid").
 */
export function applyCashTransition(
  parcel: ParcelSnapshot,
  transition: CashTransition,
): ParcelCashStatus | null {
  if (parcel.status !== ParcelStatus.LIVRE) return parcel.cashStatus;

  switch (transition) {
    case CashTransition.CLOTURE_CAISSE:
      return parcel.cashStatus === ParcelCashStatus.CHEZ_LE_COURSIER
        ? ParcelCashStatus.AU_DEPOT
        : parcel.cashStatus;
    case CashTransition.BON_REMIS:
      return parcel.cashStatus === ParcelCashStatus.AU_DEPOT
        ? ParcelCashStatus.PAYE
        : parcel.cashStatus;
    case CashTransition.BON_ANNULE:
      return parcel.cashStatus === ParcelCashStatus.PAYE
        ? ParcelCashStatus.AU_DEPOT
        : parcel.cashStatus;
    default:
      return parcel.cashStatus;
  }
}

// ─────────────────────────────────────────────────────────────
// Helpers the interfaces use to enable or disable buttons
// ─────────────────────────────────────────────────────────────

/** Vendeur 4.9: the button shows "Disponible au retour au dépôt" until then. */
export function canChangeClient(parcel: ParcelSnapshot, maxClientChanges: number): boolean {
  return (
    parcel.status === ParcelStatus.A_VERIFIER &&
    parcel.location === ParcelLocation.AU_DEPOT &&
    parcel.changeClientCount < maxClientChanges
  );
}

export function canRelaunch(parcel: ParcelSnapshot, maxAttempts: number): boolean {
  return parcel.status === ParcelStatus.A_VERIFIER && parcel.attemptCount < maxAttempts;
}

/**
 * Whether the parcel belongs in today's Tournées list (Admin 4.5, D-9).
 *
 * A relancé or postponed parcel waits at the depot and only appears on the day
 * chosen for it. An overdue one keeps appearing rather than disappearing
 * quietly, so nothing is forgotten in a corner of the depot.
 */
export function isDueForTour(parcel: ParcelSnapshot, today: Date): boolean {
  if (parcel.location !== ParcelLocation.AU_DEPOT) return false;
  if (parcel.status === ParcelStatus.AU_DEPOT) return true;
  if (parcel.status !== ParcelStatus.RELANCE) return false;
  if (!parcel.relaunchDate) return true;
  return daysBetween(today, parcel.relaunchDate) <= 0;
}

/** True when the parcel is waiting on a date the customer asked for. */
export function isPostponedByCustomer(parcel: ParcelSnapshot): boolean {
  return parcel.status === ParcelStatus.RELANCE && parcel.relaunchOrigin === RelaunchOrigin.CLIENT;
}

/** Annuler: free before pickup, a charged return after it (Vendeur 4.6, D-28). */
export function canCancel(parcel: ParcelSnapshot): boolean {
  return canCancelStatus(parcel.status);
}

/** The same rule from the status alone, for a screen that has no full snapshot. */
export function canCancelStatus(status: ParcelStatus): boolean {
  return status === ParcelStatus.CREE || CANCELLABLE_AFTER_PICKUP.includes(status);
}

/** A parcel can be edited freely only before it is picked up (Vendeur 4.6). */
export function canEditFreely(parcel: ParcelSnapshot): boolean {
  return parcel.status === ParcelStatus.CREE;
}

/** Parcels the admin can select into a bon de versement (Vendeur rule 04). */
export function isPayableToSeller(parcel: ParcelSnapshot): boolean {
  return parcel.status === ParcelStatus.LIVRE && parcel.cashStatus === ParcelCashStatus.AU_DEPOT;
}
