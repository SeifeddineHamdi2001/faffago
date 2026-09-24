import { z } from 'zod';
import { ParcelEventType } from './parcel-state-machine.js';

/**
 * Tournées (Admin 4.5, D-55): the parcels due today, each in its zone's
 * column under the livreur covering that zone today (D-52), unless the team
 * moved it to another courier. The assignment itself is the Sortie coursier
 * scan; this is only the plan.
 */

/** Events the seller's timeline leaves out: the team's planning (D-55). */
export const EVENT_TYPES_HIDDEN_FROM_SELLER: readonly ParcelEventType[] = [
  ParcelEventType.AFFECTATION_LIVREUR,
];

export interface PlannedLivreur {
  courierId: string | null;
  /** Planned for someone else than the zone's livreur by a manual move. */
  moved: boolean;
}

/**
 * Who a parcel is planned for: the courier it was moved to while he can work
 * today, else the livreur covering its zone, else nobody (Sans coursier).
 */
export function plannedLivreurFor(
  parcel: { zoneId: string | null; plannedLivreurId: string | null },
  zoneLivreur: ReadonlyMap<string, string | null>,
  isAvailable: (courierId: string) => boolean,
): PlannedLivreur {
  if (parcel.plannedLivreurId && isAvailable(parcel.plannedLivreurId)) {
    return { courierId: parcel.plannedLivreurId, moved: true };
  }
  const courierId = parcel.zoneId ? (zoneLivreur.get(parcel.zoneId) ?? null) : null;
  return { courierId, moved: false };
}

/** Each courier's load before dispatch (Admin 4.5), from each parcel's planned courier. */
export function tourLoads(plannedCourierIds: readonly (string | null)[]): {
  byCourier: Map<string, number>;
  withoutCourier: number;
} {
  const byCourier = new Map<string, number>();
  let withoutCourier = 0;
  for (const id of plannedCourierIds) {
    if (id === null) withoutCourier += 1;
    else byCourier.set(id, (byCourier.get(id) ?? 0) + 1);
  }
  return { byCourier, withoutCourier };
}

/** At most this many parcels moved at once: a full day of one zone and more. */
export const MAX_PARCELS_PER_MOVE = 500;

/**
 * Move parcels to another courier (D-55), by his account id; null puts them
 * back under their zone's livreur.
 */
export const moveToCourierSchema = z
  .object({
    parcelIds: z
      .array(z.string().uuid())
      .min(1, 'Choisissez au moins un colis')
      .max(MAX_PARCELS_PER_MOVE, `${MAX_PARCELS_PER_MOVE} colis au maximum`)
      .refine((ids) => new Set(ids).size === ids.length, 'Un colis figure deux fois'),
    courierId: z.string().uuid().nullable(),
  })
  .strict();
export type MoveToCourierValues = z.output<typeof moveToCourierSchema>;
