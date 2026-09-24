import { z } from 'zod';
import { isTunisDayKey } from './seller-dashboard.js';

/**
 * Zones (Admin 4.5, 4.16, D-51, D-52): groups of délégations, each covered by
 * a livreur and a ramasseur, each with a titular and a backup. Who covers a
 * zone on a given day is worked out when read, never stored.
 */

/** Mirrored 1:1 by the `ZoneAssignmentKind` enum in schema.prisma. */
export const ZoneAssignmentKind = {
  TITULAIRE: 'TITULAIRE',
  BACKUP: 'BACKUP',
} as const;
export type ZoneAssignmentKind = (typeof ZoneAssignmentKind)[keyof typeof ZoneAssignmentKind];

export const ZONE_ASSIGNMENT_KIND_LABELS_FR: Record<ZoneAssignmentKind, string> = {
  TITULAIRE: 'Titulaire',
  BACKUP: 'Backup',
};

/** The two roles a zone assigns (Admin rule 17). */
export const ZONE_ROLES = ['LIVREUR', 'RAMASSEUR'] as const;
export type ZoneRole = (typeof ZONE_ROLES)[number];

/** Tournées columns that must not be missed (D-51, D-52). */
export const SANS_ZONE_LABEL = 'Sans zone';
export const SANS_COURSIER_LABEL = 'Sans coursier';

export interface ZoneSlot {
  titulaireId: string | null;
  backupId: string | null;
}

export interface Coverage {
  courierId: string | null;
  kind: ZoneAssignmentKind | null;
}

/**
 * The courier covering one role of a zone on a day: the titular, else the
 * backup, else nobody (D-52). `isAvailable` says whether a courier can work
 * that day: not absent, and still accepting new work (D-12).
 */
export function coveringCourier(slot: ZoneSlot, isAvailable: (id: string) => boolean): Coverage {
  if (slot.titulaireId && isAvailable(slot.titulaireId)) {
    return { courierId: slot.titulaireId, kind: ZoneAssignmentKind.TITULAIRE };
  }
  if (slot.backupId && isAvailable(slot.backupId)) {
    return { courierId: slot.backupId, kind: ZoneAssignmentKind.BACKUP };
  }
  return { courierId: null, kind: null };
}

// ── Forms ───────────────────────────────────────────────────

const zoneName = z.string().trim().min(2, 'Nom obligatoire').max(60, '60 caractères maximum');

export const createZoneSchema = z.object({ name: zoneName }).strict();
export type CreateZoneValues = z.output<typeof createZoneSchema>;

/** Rename, deactivate or reactivate (D-51). */
export const updateZoneSchema = z
  .object({ name: zoneName, isActive: z.boolean() })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification');
export type UpdateZoneValues = z.output<typeof updateZoneSchema>;

export const SAME_TITULAR_AND_BACKUP_MESSAGE =
  'Le titulaire et le backup doivent être deux personnes différentes';

/** The titular and the backup of one role are two different people. */
export function isSameTitularAndBackup(slot: ZoneSlot): boolean {
  return slot.titulaireId !== null && slot.titulaireId === slot.backupId;
}

const zoneSlotSchema = z
  .object({
    titulaireId: z.string().uuid().nullable(),
    backupId: z.string().uuid().nullable(),
  })
  .strict()
  .refine((slot) => !isSameTitularAndBackup(slot), {
    message: SAME_TITULAR_AND_BACKUP_MESSAGE,
    path: ['backupId'],
  });

/**
 * The four assignments of a zone, sent together (Admin 4.5). Couriers are
 * named by their account id, as everywhere in the back office.
 */
export const zoneAssignmentsSchema = z
  .object({ LIVREUR: zoneSlotSchema, RAMASSEUR: zoneSlotSchema })
  .strict();
export type ZoneAssignmentsValues = z.output<typeof zoneAssignmentsSchema>;

/** Both names are required: gouvernorats and délégations carry both (A-18). */
const placeName = z.string().trim().min(2, 'Nom obligatoire').max(120, '120 caractères maximum');

/** Rename in French and Arabic; no adding, no deactivating (D-51). */
export const updateGouvernoratSchema = z
  .object({ nameFr: placeName, nameAr: placeName })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification');
export type UpdateGouvernoratValues = z.output<typeof updateGouvernoratSchema>;

/** Rename, and move to another zone or to none (D-51). */
export const updateDelegationSchema = z
  .object({ nameFr: placeName, nameAr: placeName, zoneId: z.string().uuid().nullable() })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Aucune modification');
export type UpdateDelegationValues = z.output<typeof updateDelegationSchema>;

// ── Absences (D-52) ─────────────────────────────────────────

export const courierAbsenceSchema = z
  .object({
    date: z.string().refine(isTunisDayKey, 'Date invalide'),
    reason: z
      .string()
      .trim()
      .max(200, '200 caractères maximum')
      .optional()
      .transform((value) => value || undefined),
  })
  .strict();
export type CourierAbsenceValues = z.output<typeof courierAbsenceSchema>;

/** An absence is planned for today or later; a past day changes nothing any more. */
export function canMarkAbsentOn(dayKey: string, todayKey: string): boolean {
  return dayKey >= todayKey;
}
