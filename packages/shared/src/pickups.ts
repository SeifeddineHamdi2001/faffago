import { z } from 'zod';
import { formatDT, type Millimes } from './money.js';
import { PickupStatus } from './statuses.js';

/**
 * Ramassages (Vendeur 4.5, D-35): the request form, the pickup addresses,
 * the fee rule shown before confirming, and what the seller may cancel.
 */

/** A closed list (D-35). */
export const PickupSlot = {
  MATIN: 'MATIN',
  APRES_MIDI: 'APRES_MIDI',
} as const;
export type PickupSlot = (typeof PickupSlot)[keyof typeof PickupSlot];

export const PICKUP_SLOT_LABELS_FR: Record<PickupSlot, string> = {
  MATIN: 'Matin',
  APRES_MIDI: 'Après-midi',
};

/** At most this many parcels in one request: an Import CSV at most. */
export const MAX_PARCELS_PER_PICKUP = 500;

/**
 * A pickup address (Vendeur 4.5): gouvernorat, délégation, localité, address,
 * landmark. The délégation always comes from the localité (D-17).
 */
export const pickupAddressSchema = z.object({
  label: z.string().trim().max(60, '60 caractères maximum').optional().nullable(),
  localiteId: z.string().uuid('Localité obligatoire'),
  address: z.string().trim().min(5, 'Adresse obligatoire').max(500),
  landmark: z.string().trim().max(200).optional().nullable(),
});
export type PickupAddressValues = z.output<typeof pickupAddressSchema>;

export const createPickupAddressSchema = pickupAddressSchema.extend({
  isDefault: z.boolean().optional(),
});
export type CreatePickupAddressValues = z.output<typeof createPickupAddressSchema>;

/**
 * Demander un ramassage (Vendeur 4.5): the parcels ready, or how many; the
 * time window; a note. The address is one already saved, or a new one, which
 * is how the first request fills it.
 */
export const pickupRequestSchema = z
  .object({
    clientRequestId: z.string().uuid().optional(),
    pickupAddressId: z.string().uuid().optional(),
    newAddress: pickupAddressSchema.optional(),
    parcelCodes: z
      .array(z.string().trim().min(1))
      .max(MAX_PARCELS_PER_PICKUP, `${MAX_PARCELS_PER_PICKUP} colis au maximum`)
      .optional(),
    declaredCount: z.coerce
      .number()
      .int('Nombre entier')
      .min(1, 'Au moins 1 colis')
      .max(MAX_PARCELS_PER_PICKUP, `${MAX_PARCELS_PER_PICKUP} colis au maximum`)
      .optional(),
    requestedSlot: z.nativeEnum(PickupSlot, {
      errorMap: () => ({ message: 'Choisissez un créneau' }),
    }),
    note: z.string().trim().max(300, '300 caractères maximum').optional().nullable(),
  })
  .refine((v) => (v.pickupAddressId ? 1 : 0) + (v.newAddress ? 1 : 0) === 1, {
    message: 'Choisissez une adresse de ramassage',
    path: ['pickupAddressId'],
  })
  .refine((v) => (v.parcelCodes?.length ? 1 : 0) + (v.declaredCount ? 1 : 0) === 1, {
    message: 'Choisissez les colis à ramasser, ou indiquez leur nombre',
    path: ['parcelCodes'],
  });
export type PickupRequestValues = z.output<typeof pickupRequestSchema>;

/**
 * The line shown before confirming (Vendeur 4.5): "Moins de 5 colis :
 * ramassage à 2,000 DT", from Paramètres. Null when pickups are free.
 */
export function pickupFeeRuleText(feeMillimes: Millimes, freeThreshold: number): string | null {
  if (feeMillimes <= 0n) return null;
  return `Moins de ${freeThreshold} colis : ramassage à ${formatDT(feeMillimes)}`;
}

/** The seller may cancel while Demandé or Planifié, at no cost (D-35, A-13). */
export function canCancelPickup(status: PickupStatus): boolean {
  return status === PickupStatus.DEMANDE || status === PickupStatus.PLANIFIE;
}

export const PickupErrorCode = {
  RAMASSAGE_INTROUVABLE: 'RAMASSAGE_INTROUVABLE',
  ADRESSE_INTROUVABLE: 'ADRESSE_INTROUVABLE',
  ADRESSE_INACTIVE: 'ADRESSE_INACTIVE',
  RAMASSAGE_EN_COURS: 'RAMASSAGE_EN_COURS',
  COLIS_NON_DISPONIBLE: 'COLIS_NON_DISPONIBLE',
  ANNULATION_IMPOSSIBLE: 'ANNULATION_RAMASSAGE_IMPOSSIBLE',
  COMPTE_SUSPENDU: 'COMPTE_SUSPENDU',
} as const;
export type PickupErrorCode = (typeof PickupErrorCode)[keyof typeof PickupErrorCode];

export const PICKUP_MESSAGES = {
  ramassageIntrouvable: 'Ramassage introuvable.',
  adresseIntrouvable: 'Adresse introuvable.',
  adresseInactive: 'Cette adresse a été remplacée : choisissez-en une autre.',
  ramassageEnCours:
    'Un ramassage est déjà demandé à cette adresse : attendez qu’il soit effectué, ou annulez-le.',
  colisNonDisponible: (codes: readonly string[]) =>
    `Colis déjà ramassé, annulé, inconnu ou déjà dans un ramassage : ${codes.join(', ')}`,
  annulationImpossible: 'Ce ramassage ne peut plus être annulé.',
  compteSuspendu: 'Votre compte est suspendu : vous ne pouvez pas demander de ramassage.',
} as const;
