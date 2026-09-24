import { z } from 'zod';
import { isTunisDayKey } from './seller-dashboard.js';
import { ParcelCashStatus, ParcelStatus } from './statuses.js';

/**
 * Colis, the team's search (Admin 4.3): every parcel, searched by code,
 * customer name or phone, or shop; filtered by status, cash status, seller,
 * courier, zone and creation date.
 */

/** The zone filter's value for the parcels of a délégation in no zone (D-51). */
export const SANS_ZONE_FILTER = 'SANS_ZONE';

/** An empty field of the search form means no filter. */
function optional<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((value) => (value === '' ? undefined : value), schema.optional());
}

const day = z.string().refine(isTunisDayKey, 'Date au format AAAA-MM-JJ');

export const staffParcelQuerySchema = z
  .object({
    q: optional(z.string().trim().min(1).max(100)),
    status: optional(z.nativeEnum(ParcelStatus)),
    cashStatus: optional(z.nativeEnum(ParcelCashStatus)),
    sellerId: optional(z.string().uuid()),
    /** The livreur carrying the parcel now, by his account id. */
    courierId: optional(z.string().uuid()),
    zoneId: optional(z.union([z.string().uuid(), z.literal(SANS_ZONE_FILTER)])),
    from: optional(day),
    to: optional(day),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: 'La date de début doit précéder la date de fin',
    path: ['to'],
  });
export type StaffParcelQuery = z.output<typeof staffParcelQuerySchema>;
