import { z } from 'zod';
import type { ParcelEventType } from './parcel-state-machine.js';
import { ParcelCashStatus, ParcelStatus } from './statuses.js';
import type { Millimes } from './money.js';

/**
 * Mes colis and Détail du colis (Vendeur 4.7, 4.8, D-38, D-40): the status
 * groups of the filters, the track line, the timeline as the seller reads
 * it, and the money block.
 */

// ── Status groups (Vendeur 4.7) ─────────────────────────────

/** In the order Mes colis shows them (D-46). */
export const ParcelGroup = {
  TOUS: 'TOUS',
  A_VERIFIER: 'A_VERIFIER',
  EN_COURS: 'EN_COURS',
  LIVRES: 'LIVRES',
  PAYES: 'PAYES',
  NON_PAYES: 'NON_PAYES',
  RETOURS: 'RETOURS',
} as const;
export type ParcelGroup = (typeof ParcelGroup)[keyof typeof ParcelGroup];

export const PARCEL_GROUP_LABELS_FR: Record<ParcelGroup, string> = {
  TOUS: 'Tous',
  A_VERIFIER: 'À vérifier',
  EN_COURS: 'En cours',
  LIVRES: 'Livrés',
  PAYES: 'Payés',
  NON_PAYES: 'Non payés',
  RETOURS: 'Retours',
};

/**
 * The groups of the first row (D-46). À vérifier comes first after Tous: the
 * seller has 48 hours to decide (D-9 excepted).
 */
export const PARCEL_TOP_GROUPS: readonly ParcelGroup[] = [
  ParcelGroup.TOUS,
  ParcelGroup.A_VERIFIER,
  ParcelGroup.EN_COURS,
  ParcelGroup.LIVRES,
  ParcelGroup.RETOURS,
];

/** Payés and Non payés are the two halves of Livrés (D-46). */
export const PARCEL_SUB_GROUPS: Partial<Record<ParcelGroup, readonly ParcelGroup[]>> = {
  LIVRES: [ParcelGroup.PAYES, ParcelGroup.NON_PAYES],
};

/** The first-row group a group belongs to: Livrés for Payés and Non payés. */
export function topGroupOf(group: ParcelGroup): ParcelGroup {
  for (const [top, subs] of Object.entries(PARCEL_SUB_GROUPS)) {
    if (subs?.includes(group)) return top as ParcelGroup;
  }
  return group;
}

/** À vérifier is highlighted as soon as a parcel waits for the seller's decision. */
export function groupNeedsAttention(group: ParcelGroup, count: number): boolean {
  return group === ParcelGroup.A_VERIFIER && count > 0;
}

/** Which parcels each group holds. Annulé is only under Tous. */
export const PARCEL_GROUP_FILTERS: Record<
  ParcelGroup,
  { statuses?: readonly ParcelStatus[]; cashStatuses?: readonly ParcelCashStatus[] }
> = {
  TOUS: {},
  A_VERIFIER: { statuses: [ParcelStatus.A_VERIFIER] },
  EN_COURS: {
    statuses: [
      ParcelStatus.CREE,
      ParcelStatus.RAMASSE,
      ParcelStatus.AU_DEPOT,
      ParcelStatus.EN_LIVRAISON,
      ParcelStatus.RELANCE,
    ],
  },
  LIVRES: { statuses: [ParcelStatus.LIVRE] },
  PAYES: { statuses: [ParcelStatus.LIVRE], cashStatuses: [ParcelCashStatus.PAYE] },
  NON_PAYES: {
    statuses: [ParcelStatus.LIVRE],
    cashStatuses: [ParcelCashStatus.CHEZ_LE_COURSIER, ParcelCashStatus.AU_DEPOT],
  },
  RETOURS: {
    statuses: [
      ParcelStatus.RETOUR_AU_DEPOT,
      ParcelStatus.RETOUR_EN_ROUTE,
      ParcelStatus.RETOUR_RECU,
    ],
  },
};

export function isInGroup(
  group: ParcelGroup,
  parcel: { status: ParcelStatus; cashStatus: ParcelCashStatus | null },
): boolean {
  const filter = PARCEL_GROUP_FILTERS[group];
  if (filter.statuses && !filter.statuses.includes(parcel.status)) return false;
  if (
    filter.cashStatuses &&
    !(parcel.cashStatus && filter.cashStatuses.includes(parcel.cashStatus))
  ) {
    return false;
  }
  return true;
}

export const PARCELS_PAGE_SIZE = 50;

/** At most this many rows in one Exporter (Vendeur 4.7): filter by date beyond. */
export const MAX_EXPORT_ROWS = 10_000;

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format AAAA-MM-JJ')
  .optional();

/** Mes colis: group, search (code, name or phone), date range, page. */
export const parcelListQuerySchema = z
  .object({
    group: z.nativeEnum(ParcelGroup).default(ParcelGroup.TOUS),
    q: z.string().trim().max(100).optional(),
    from: dateKey,
    to: dateKey,
    page: z.coerce.number().int().min(1).max(10_000).default(1),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'La date de début doit précéder la date de fin',
    path: ['to'],
  });
export type ParcelListQuery = z.output<typeof parcelListQuerySchema>;

// ── The track line (Vendeur 4.8, 4.12) ──────────────────────

export const TrackStepState = { FAIT: 'FAIT', ACTUEL: 'ACTUEL', A_VENIR: 'A_VENIR' } as const;
export type TrackStepState = (typeof TrackStepState)[keyof typeof TrackStepState];

export interface TrackLine {
  /** The delivery flow, or the return flow once the parcel is a return. */
  flow: 'LIVRAISON' | 'RETOUR';
  steps: { label: string; state: TrackStepState }[];
  /** A failure waiting for the seller, or a relance waiting for its day. */
  attention: boolean;
  cancelled: boolean;
}

/** "Créé › Ramassé › Au dépôt › En livraison › Livré" (Vendeur 4.8). */
export const DELIVERY_FLOW_LABELS_FR = ['Créé', 'Ramassé', 'Au dépôt', 'En livraison', 'Livré'];
/** "À vérifier › Retour au dépôt › En route › Reçu" (Vendeur 4.12). */
export const RETURN_FLOW_LABELS_FR = ['À vérifier', 'Retour au dépôt', 'En route', 'Reçu'];

function steps(labels: string[], current: number, done: boolean) {
  return labels.map((label, i) => ({
    label,
    state:
      i < current || (done && i === current)
        ? TrackStepState.FAIT
        : i === current
          ? TrackStepState.ACTUEL
          : TrackStepState.A_VENIR,
  }));
}

export function trackLineFor(status: ParcelStatus): TrackLine {
  const delivery = (current: number, extra: Partial<TrackLine> = {}): TrackLine => ({
    flow: 'LIVRAISON',
    steps: steps(DELIVERY_FLOW_LABELS_FR, current, status === ParcelStatus.LIVRE),
    attention: false,
    cancelled: false,
    ...extra,
  });
  const back = (current: number): TrackLine => ({
    flow: 'RETOUR',
    steps: steps(RETURN_FLOW_LABELS_FR, current, status === ParcelStatus.RETOUR_RECU),
    attention: false,
    cancelled: false,
  });
  switch (status) {
    case ParcelStatus.CREE:
      return delivery(0);
    case ParcelStatus.RAMASSE:
      return delivery(1);
    case ParcelStatus.AU_DEPOT:
      return delivery(2);
    case ParcelStatus.EN_LIVRAISON:
      return delivery(3);
    case ParcelStatus.LIVRE:
      return delivery(4);
    case ParcelStatus.A_VERIFIER:
    case ParcelStatus.RELANCE:
      return delivery(3, { attention: true });
    case ParcelStatus.RETOUR_AU_DEPOT:
      return back(1);
    case ParcelStatus.RETOUR_EN_ROUTE:
      return back(2);
    case ParcelStatus.RETOUR_RECU:
      return back(3);
    case ParcelStatus.ANNULE:
      return delivery(0, { cancelled: true });
  }
}

// ── The timeline (Vendeur 4.8, D-38) ────────────────────────

export const PARCEL_EVENT_LABELS_FR: Record<ParcelEventType, string> = {
  CREATION: 'Colis créé',
  MODIFICATION_VENDEUR: 'Colis modifié',
  ANNULATION: 'Colis annulé',
  RAMASSAGE: 'Ramassé',
  ENTREE_DEPOT: 'Arrivé au dépôt',
  SORTIE_COURSIER: 'Parti en livraison',
  AFFECTATION_LIVREUR: 'Livreur assigné',
  LIVRAISON: 'Livré',
  ECHEC_LIVRAISON: 'Échec de livraison',
  RETOUR_DE_TOURNEE: 'Revenu au dépôt',
  DECISION_RELANCER: 'Relancé',
  DECISION_RETOURNER: 'Retour demandé',
  DECISION_CHANGER_CLIENT: 'Changement de client',
  RETOUR_AUTO_48H: 'Retour automatique : 48 h sans décision',
  RETOUR_AUTO_3E_TENTATIVE: 'Retour automatique : 3e tentative',
  PREPARATION_RETOUR: 'Retour préparé',
  DEPART_RETOUR: 'Retour en route',
  RETOUR_RECU: 'Retour reçu',
  ENCAISSEMENT_DEPOT: 'Argent remis au dépôt',
  PAIEMENT_VENDEUR: 'Payé',
  ARTICLE_ECHANGE_RECUPERE: 'Ancien article récupéré',
  FORCAGE_STATUT: 'Statut corrigé par Faffa Go',
  ANNULATION_SCAN: 'Scan annulé',
  MODIFICATION_APPLIQUEE: 'Modification appliquée',
};

/**
 * Who, as the seller reads it (D-38): himself, a courier by first name only,
 * or "Faffa Go" for the team and the automatic rules.
 */
export type TimelineActor =
  { kind: 'VOUS' } | { kind: 'FAFFA_GO' } | { kind: 'COURSIER'; firstName: string };

export function timelineActorLabel(actor: TimelineActor): string {
  if (actor.kind === 'VOUS') return 'Vous';
  if (actor.kind === 'COURSIER') return actor.firstName;
  return 'Faffa Go';
}

// ── The money block (D-40) ──────────────────────────────────

const RETURN_STATUSES: readonly ParcelStatus[] = [
  ParcelStatus.RETOUR_AU_DEPOT,
  ParcelStatus.RETOUR_EN_ROUTE,
  ParcelStatus.RETOUR_RECU,
];

export type ParcelMoney =
  | { kind: 'LIVRAISON'; cod: Millimes; deliveryFee: Millimes; estimatedNet: Millimes }
  | { kind: 'RETOUR'; cod: Millimes; returnFee: Millimes }
  | { kind: 'ANNULE'; cod: Millimes };

/**
 * Net = COD − the delivery fee frozen on the parcel, an estimate before
 * retenue; a returned parcel shows its return fee instead (D-40). The bon de
 * versement stays the only real figure.
 */
export function parcelMoneyFor(parcel: {
  status: ParcelStatus;
  codAmountMillimes: Millimes;
  deliveryFeeMillimes: Millimes;
  returnFeeMillimes: Millimes;
}): ParcelMoney {
  if (RETURN_STATUSES.includes(parcel.status)) {
    return { kind: 'RETOUR', cod: parcel.codAmountMillimes, returnFee: parcel.returnFeeMillimes };
  }
  if (parcel.status === ParcelStatus.ANNULE)
    return { kind: 'ANNULE', cod: parcel.codAmountMillimes };
  return {
    kind: 'LIVRAISON',
    cod: parcel.codAmountMillimes,
    deliveryFee: parcel.deliveryFeeMillimes,
    estimatedNet: parcel.codAmountMillimes - parcel.deliveryFeeMillimes,
  };
}
