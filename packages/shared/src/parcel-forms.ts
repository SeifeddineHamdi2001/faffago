import { z } from 'zod';
import { createParcelSchema, tunisianPhone, type CreateParcelValues } from './schemas.js';
import { ParcelStatus } from './statuses.js';

/**
 * The seller's parcel forms beyond Créer un colis itself (Vendeur 4.2, 4.6):
 * the retry-safe creation request, Modifier before pickup, and Demander une
 * modification after it.
 */

/**
 * Créer un colis as sent by the screen. The form draws one UUID when it
 * opens, so a double click or a retry after a lost answer finds the parcel
 * already created instead of making a second one with a second label.
 */
export const createParcelRequestSchema = createParcelSchema.extend({
  clientRequestId: z.string().uuid().optional(),
});
export type CreateParcelRequestValues = z.output<typeof createParcelRequestSchema>;

/**
 * Modifier (Vendeur 4.6): any field of the form, while the parcel is Créé.
 * The fees frozen at creation never change, the COD included (D-41).
 */
export const updateParcelSchema = createParcelSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification');
export type UpdateParcelValues = z.output<typeof updateParcelSchema>;

/**
 * The fields printed on the label (Vendeur 4.4). Changing one of them makes
 * the printed label wrong, so the screen asks for a reprint (D-41).
 */
export const PARCEL_LABEL_FIELDS = [
  'recipientName',
  'recipientPhone',
  'localiteId',
  'address',
  'codAmountMillimes',
  'isExchange',
  'openingAllowed',
] as const satisfies readonly (keyof CreateParcelValues)[];

export function labelNeedsReprint(changedFields: readonly string[]): boolean {
  return changedFields.some((field) => (PARCEL_LABEL_FIELDS as readonly string[]).includes(field));
}

// ── Demander une modification (Vendeur 4.6) ─────────────────

/**
 * What the seller can ask for after pickup (Vendeur 4.6, D-44). Faffa Go
 * applies it in phase 5; a new localité only while the parcel is at the depot.
 */
export const CHANGE_REQUEST_FIELDS = [
  'recipientPhone',
  'recipientPhone2',
  'localiteId',
  'address',
  'landmark',
] as const;
export type ChangeRequestField = (typeof CHANGE_REQUEST_FIELDS)[number];

export const CHANGE_REQUEST_FIELD_LABELS_FR: Record<ChangeRequestField, string> = {
  recipientPhone: 'Téléphone',
  recipientPhone2: 'Téléphone 2',
  localiteId: 'Localité',
  address: 'Adresse',
  landmark: 'Repère',
};

export const ChangeRequestStatus = {
  EN_ATTENTE: 'EN_ATTENTE',
  APPLIQUEE: 'APPLIQUEE',
  REFUSEE: 'REFUSEE',
  /** Withdrawn by the seller while it waited (D-44). */
  RETIREE: 'RETIREE',
} as const;
export type ChangeRequestStatus = (typeof ChangeRequestStatus)[keyof typeof ChangeRequestStatus];

export const CHANGE_REQUEST_STATUS_LABELS_FR: Record<ChangeRequestStatus, string> = {
  EN_ATTENTE: 'En attente',
  APPLIQUEE: 'Appliquée',
  REFUSEE: 'Refusée',
  RETIREE: 'Retirée',
};

export const parcelChangeRequestSchema = z
  .object({
    recipientPhone: tunisianPhone.optional(),
    recipientPhone2: tunisianPhone.optional(),
    localiteId: z.string().uuid('Localité invalide').optional(),
    address: z.string().trim().min(5, 'Adresse trop courte').max(500).optional(),
    landmark: z.string().trim().min(1).max(200).optional(),
    note: z.string().trim().max(300).optional(),
  })
  .strict()
  .refine(
    (value) => CHANGE_REQUEST_FIELDS.some((field) => value[field] !== undefined),
    'Indiquez au moins une modification',
  );
export type ParcelChangeRequestValues = z.output<typeof parcelChangeRequestSchema>;

/**
 * After pickup and until the parcel's journey ends. Before pickup the seller
 * edits the parcel himself; once delivered, cancelled or on its way back,
 * there is nothing left for Faffa Go to change.
 */
const CHANGE_REQUEST_STATUSES: readonly ParcelStatus[] = [
  ParcelStatus.RAMASSE,
  ParcelStatus.AU_DEPOT,
  ParcelStatus.EN_LIVRAISON,
  ParcelStatus.A_VERIFIER,
  ParcelStatus.RELANCE,
];

export function canRequestChange(status: ParcelStatus): boolean {
  return CHANGE_REQUEST_STATUSES.includes(status);
}

// ── Refusals the seller reads ───────────────────────────────

export const ParcelErrorCode = {
  COLIS_INTROUVABLE: 'COLIS_INTROUVABLE',
  MODIFICATION_IMPOSSIBLE: 'MODIFICATION_IMPOSSIBLE',
  ANNULATION_IMPOSSIBLE: 'ANNULATION_IMPOSSIBLE',
  DEMANDE_IMPOSSIBLE: 'DEMANDE_IMPOSSIBLE',
  DEMANDE_AVANT_RAMASSAGE: 'DEMANDE_AVANT_RAMASSAGE',
  REQUETE_DEJA_UTILISEE: 'REQUETE_DEJA_UTILISEE',
  DEMANDE_EN_ATTENTE: 'DEMANDE_EN_ATTENTE',
  DEMANDE_INTROUVABLE: 'DEMANDE_INTROUVABLE',
  DEMANDE_CLOSE: 'DEMANDE_CLOSE',
} as const;
export type ParcelErrorCode = (typeof ParcelErrorCode)[keyof typeof ParcelErrorCode];

export const PARCEL_MESSAGES: Record<ParcelErrorCode, string> = {
  // The same answer as an unknown code: another seller's parcel does not exist (D-26).
  COLIS_INTROUVABLE: 'Code inconnu',
  MODIFICATION_IMPOSSIBLE:
    'Le colis a été ramassé : il ne se modifie plus directement. Demandez une modification.',
  ANNULATION_IMPOSSIBLE: 'Ce colis ne peut plus être annulé.',
  DEMANDE_IMPOSSIBLE: 'Ce colis ne peut plus être modifié.',
  DEMANDE_AVANT_RAMASSAGE: 'Le colis n’est pas encore ramassé : modifiez-le directement.',
  REQUETE_DEJA_UTILISEE: 'Cette demande a déjà été utilisée. Rechargez la page.',
  DEMANDE_EN_ATTENTE: 'Une demande attend déjà Faffa Go pour ce colis : modifiez-la ou retirez-la.',
  DEMANDE_INTROUVABLE: 'Demande introuvable.',
  DEMANDE_CLOSE: 'Cette demande a déjà été traitée ou retirée.',
};
