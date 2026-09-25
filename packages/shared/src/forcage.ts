import { z } from 'zod';
import { ParcelCashStatus, ParcelLocation, ParcelStatus } from './statuses.js';

/**
 * Forcer un statut in phase 5 (Admin 4.3, 4.17, D-56): the admin corrects a
 * scanning mistake, with a reason, audited. No effect runs — no charge, no
 * 48-hour clock, the attempt count unchanged — so only the moves that never
 * involve money or a seller's decision are allowed. Phase 8 adds one money
 * move with its own reversal: undoing a Livré whose cash is still with the
 * courier (D-85).
 */

export interface ParcelState {
  status: ParcelStatus;
  location: ParcelLocation;
  /** Read for a Livré only: the undo of D-85 needs the cash still with the courier. */
  cashStatus?: ParcelCashStatus | null;
}

/** Where an undone Livré goes: back out with its livreur (D-85). */
export const UNDO_DELIVERY_TARGET: ParcelState = {
  status: ParcelStatus.EN_LIVRAISON,
  location: ParcelLocation.AVEC_LE_LIVREUR,
};

/** D-85: a Livré whose cash is still Chez le coursier can be undone, nothing else of money. */
export function isDeliveryUndo(current: ParcelState, target: ParcelState): boolean {
  return (
    current.status === ParcelStatus.LIVRE &&
    current.cashStatus === ParcelCashStatus.CHEZ_LE_COURSIER &&
    same(target, UNDO_DELIVERY_TARGET)
  );
}

/** The three states a parcel moves between freely, each at its own place. */
const FORCEABLE_STATES: readonly ParcelState[] = [
  { status: ParcelStatus.RAMASSE, location: ParcelLocation.AVEC_LE_RAMASSEUR },
  { status: ParcelStatus.AU_DEPOT, location: ParcelLocation.AU_DEPOT },
  { status: ParcelStatus.EN_LIVRAISON, location: ParcelLocation.AVEC_LE_LIVREUR },
];

/** Their place only: with the livreur or at the depot. The status is not the team's. */
const LOCATION_FIX_STATUSES: readonly ParcelStatus[] = [
  ParcelStatus.A_VERIFIER,
  ParcelStatus.RELANCE,
  ParcelStatus.RETOUR_AU_DEPOT,
];
const LOCATION_FIX_PLACES: readonly ParcelLocation[] = [
  ParcelLocation.AVEC_LE_LIVREUR,
  ParcelLocation.AU_DEPOT,
];

export const ForcageRefusal = {
  FORCAGE_NON_AUTORISE: 'FORCAGE_NON_AUTORISE',
  MEME_ETAT: 'MEME_ETAT',
  LIVREUR_INVALIDE: 'LIVREUR_INVALIDE',
} as const;
export type ForcageRefusal = (typeof ForcageRefusal)[keyof typeof ForcageRefusal];

export const FORCAGE_MESSAGES_FR: Record<ForcageRefusal, string> = {
  FORCAGE_NON_AUTORISE:
    'Cette correction n’est pas possible ici : seuls Ramassé, Au dépôt et En livraison, le lieu d’un colis À vérifier, Relancé ou Retour au dépôt, ou un Livré dont l’argent est encore chez le coursier, se corrigent.',
  MEME_ETAT: 'Le colis est déjà dans cet état.',
  LIVREUR_INVALIDE: 'Choisissez le livreur qui a le colis.',
};

function same(a: ParcelState, b: ParcelState): boolean {
  return a.status === b.status && a.location === b.location;
}

function isForceable(state: ParcelState): boolean {
  return FORCEABLE_STATES.some((s) => same(s, state));
}

/** Null when the admin may move the parcel from `current` to `target` (D-56). */
export function forcedStatusRefusal(
  current: ParcelState,
  target: ParcelState,
): ForcageRefusal | null {
  if (same(current, target)) return ForcageRefusal.MEME_ETAT;
  if (current.status === ParcelStatus.LIVRE) {
    return isDeliveryUndo(current, target) ? null : ForcageRefusal.FORCAGE_NON_AUTORISE;
  }
  if (LOCATION_FIX_STATUSES.includes(current.status)) {
    const placeOnly =
      target.status === current.status &&
      LOCATION_FIX_PLACES.includes(current.location) &&
      LOCATION_FIX_PLACES.includes(target.location);
    return placeOnly ? null : ForcageRefusal.FORCAGE_NON_AUTORISE;
  }
  return isForceable(current) && isForceable(target) ? null : ForcageRefusal.FORCAGE_NON_AUTORISE;
}

/** The targets the screen offers for a parcel as it is. */
export function forcedTargets(current: ParcelState): ParcelState[] {
  const candidates: ParcelState[] =
    current.status === ParcelStatus.LIVRE
      ? [UNDO_DELIVERY_TARGET]
      : LOCATION_FIX_STATUSES.includes(current.status)
        ? LOCATION_FIX_PLACES.map((location) => ({ status: current.status, location }))
        : [...FORCEABLE_STATES];
  return candidates.filter((target) => forcedStatusRefusal(current, target) === null);
}

/** Put with a livreur: the admin says which one has it. */
export function targetNeedsLivreur(target: ParcelState): boolean {
  return target.location === ParcelLocation.AVEC_LE_LIVREUR;
}

export const forcerStatutSchema = z
  .object({
    status: z.nativeEnum(ParcelStatus),
    location: z.nativeEnum(ParcelLocation),
    /** The livreur's account id, when the parcel is put with a livreur. */
    livreurId: z.string().uuid().optional(),
    reason: z.string().trim().min(5, 'Indiquez la raison de la correction').max(500),
  })
  .strict()
  .refine((value) => !targetNeedsLivreur(value) || value.livreurId !== undefined, {
    message: FORCAGE_MESSAGES_FR.LIVREUR_INVALIDE,
    path: ['livreurId'],
  });
export type ForcerStatutValues = z.output<typeof forcerStatutSchema>;

/** Cancelling a depot scan after its window is the admin's, with a reason (A-11, D-56). */
export const adminScanCancelSchema = z
  .object({ reason: z.string().trim().min(5, 'Indiquez la raison de la correction').max(500) })
  .strict();
export type AdminScanCancelValues = z.output<typeof adminScanCancelSchema>;
