import { z } from 'zod';
import { normalizePhone } from './codes.js';
import { businessDateOf } from './fees.js';
import { sumMillimes, type Millimes } from './money.js';
import {
  ParcelAction,
  POSTPONEMENT_MAX_DAYS,
  POSTPONEMENT_MIN_DAYS,
} from './parcel-state-machine.js';
import type { Role } from './roles.js';
import { ScanAction, ScanCancelRefusal, ScanSource, type ParcelBefore } from './scans.js';
import { addTunisDays, tunisDayKey } from './seller-dashboard.js';
import {
  FailureReason,
  RelaunchSlot,
  type ParcelCashStatus,
  type ParcelStatus,
} from './statuses.js';

/**
 * The courier app (Coursier, phase 6): what it sends, and the rules it applies
 * offline with the same code the API applies on arrival.
 *
 * Everything the courier does is an operation in one queue on the phone,
 * sent in order through one route, `POST /scans/courier` — the one route an
 * outdated app still reaches, so the queue always empties before a forced
 * update (D-14, tech-stack 5).
 */

// ── Scans ───────────────────────────────────────────────────

/**
 * The scans of phase 6. Retour reçu and the bon de versement come with the
 * bons in phase 8 (D-61).
 */
export const COURIER_SCAN_ACTIONS = [
  ScanAction.RAMASSAGE,
  ScanAction.LIVRE,
  ScanAction.ECHEC,
] as const;
export type CourierScanAction = (typeof COURIER_SCAN_ACTIONS)[number];

export const PARCEL_ACTION_BY_COURIER_SCAN: Record<CourierScanAction, ParcelAction> = {
  RAMASSAGE: ParcelAction.SCAN_RAMASSAGE,
  LIVRE: ParcelAction.SCAN_LIVRE,
  ECHEC: ParcelAction.SCAN_ECHEC,
};

/** Which scans each courier makes (Coursier 5). */
export const COURIER_SCAN_ACTIONS_BY_ROLE: Record<
  typeof Role.LIVREUR | typeof Role.RAMASSEUR,
  readonly CourierScanAction[]
> = {
  LIVREUR: [ScanAction.LIVRE, ScanAction.ECHEC],
  RAMASSEUR: [ScanAction.RAMASSAGE],
};

/** The camera, or a code typed from a damaged label (Coursier rule 1, A-22). */
export const COURIER_SCAN_SOURCES = [ScanSource.APP_COURSIER, ScanSource.SAISIE_MANUELLE] as const;

/** The failure reasons, in the order of Coursier 4.4. A fixed list (D-20). */
export const FAILURE_REASONS_IN_ORDER: readonly FailureReason[] = [
  FailureReason.NE_REPOND_PAS,
  FailureReason.INJOIGNABLE,
  FailureReason.ADRESSE_INCORRECTE,
  FailureReason.REPORTE_PAR_LE_CLIENT,
  FailureReason.REFUSE,
];

// ── The queue ───────────────────────────────────────────────

export const CourierOperationKind = {
  SCAN: 'SCAN',
  /** Annuler le dernier scan, within the window on device time (A-11). */
  ANNULATION: 'ANNULATION',
  /** Closes the pickup and charges the pickup fee (A-13, D-61). */
  TERMINER_RAMASSAGE: 'TERMINER_RAMASSAGE',
  /** Mémoire d'adresse: a note, a meeting point (Coursier 4.3). */
  NOTE_ADRESSE: 'NOTE_ADRESSE',
} as const;
export type CourierOperationKind = (typeof CourierOperationKind)[keyof typeof CourierOperationKind];

/** At most this many operations per upload; the app sends the rest next. */
export const COURIER_SYNC_MAX_OPERATIONS = 50;

/** Mémoire d'adresse: short notes, read at a glance (Coursier 4.3). */
export const ADDRESS_NOTE_MAX_LENGTH = 300;
export const MEETING_POINT_MAX_LENGTH = 200;
/** The courier's note on a failure (Coursier 4.4: optional note). */
export const FAILURE_NOTE_MAX_LENGTH = 300;

const deviceTime = z.string().datetime({ offset: true });
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format AAAA-MM-JJ');
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max} caractères maximum`)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));

/** Latitude and longitude of the phone at the scan. Null without a fix (D-63). */
export const gpsSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracyM: z.number().int().min(0).max(100_000).nullable().optional(),
  })
  .strict();
export type GpsValues = z.output<typeof gpsSchema>;

/**
 * One scan. Only the shape is checked here: what a scan needs for its action
 * (a reason, a date, the amount…) is checked by the API and the state machine,
 * and a scan missing it is stored as refused, with its reason — so one bad
 * scan never blocks the queue behind it.
 */
export const courierScanOperationSchema = z
  .object({
    kind: z.literal(CourierOperationKind.SCAN),
    clientScanId: z.string().uuid(),
    action: z.enum(COURIER_SCAN_ACTIONS),
    rawCode: z.string().trim().min(1, 'Code vide').max(300),
    source: z.enum(COURIER_SCAN_SOURCES),
    deviceTime,
    gps: gpsSchema.nullable().optional(),
    deviceId: z.string().trim().max(128).optional().nullable(),
    /** Ramassage: the pickup being scanned. */
    pickupId: z.string().uuid().optional().nullable(),
    /** Échec. */
    failureReason: z.nativeEnum(FailureReason).optional().nullable(),
    /** Échec, Reporté par le client: the day the customer asked for (D-9). */
    postponedTo: dayKey.optional().nullable(),
    relaunchSlot: z.nativeEnum(RelaunchSlot).optional().nullable(),
    note: optionalText(FAILURE_NOTE_MAX_LENGTH),
    /** Livré: the amount the courier confirmed, in millimes as digits. */
    collectedMillimes: z
      .string()
      .regex(/^\d{1,12}$/, 'Montant en millimes')
      .optional()
      .nullable(),
    /** Livré on an échange: the old item was collected (Coursier 4.4). */
    exchangeItemCollected: z.boolean().optional().nullable(),
  })
  .strict();
export type CourierScanOperation = z.output<typeof courierScanOperationSchema>;
export type CourierScanOperationInput = z.input<typeof courierScanOperationSchema>;

export const courierCancelOperationSchema = z
  .object({
    kind: z.literal(CourierOperationKind.ANNULATION),
    /** The scan to cancel, by the id the phone drew for it. */
    clientScanId: z.string().uuid(),
    /** When the courier pressed Annuler: the window runs on the phone's clock (A-11). */
    deviceTime,
  })
  .strict();
export type CourierCancelOperation = z.output<typeof courierCancelOperationSchema>;

export const courierFinishPickupOperationSchema = z
  .object({
    kind: z.literal(CourierOperationKind.TERMINER_RAMASSAGE),
    operationId: z.string().uuid(),
    pickupId: z.string().uuid(),
    deviceTime,
  })
  .strict();
export type CourierFinishPickupOperation = z.output<typeof courierFinishPickupOperationSchema>;

export const courierAddressNoteOperationSchema = z
  .object({
    kind: z.literal(CourierOperationKind.NOTE_ADRESSE),
    operationId: z.string().uuid(),
    parcelCode: z.string().trim().min(1).max(300),
    note: optionalText(ADDRESS_NOTE_MAX_LENGTH),
    meetingPoint: optionalText(MEETING_POINT_MAX_LENGTH),
    deviceTime,
  })
  .strict();
export type CourierAddressNoteOperation = z.output<typeof courierAddressNoteOperationSchema>;

export const courierOperationSchema = z.discriminatedUnion('kind', [
  courierScanOperationSchema,
  courierCancelOperationSchema,
  courierFinishPickupOperationSchema,
  courierAddressNoteOperationSchema,
]);
export type CourierOperation = z.output<typeof courierOperationSchema>;
export type CourierOperationInput = z.input<typeof courierOperationSchema>;

/**
 * The upload. Each operation is read on its own, so a malformed one is
 * answered as such and the ones after it still go through.
 */
export const courierSyncSchema = z
  .object({ operations: z.array(z.unknown()).min(1).max(COURIER_SYNC_MAX_OPERATIONS) })
  .strict();
export type CourierSyncValues = z.output<typeof courierSyncSchema>;

/** The id an operation carries: the scan's for a scan or its cancellation. */
export function operationIdOf(operation: CourierOperationInput): string {
  return operation.kind === CourierOperationKind.SCAN ||
    operation.kind === CourierOperationKind.ANNULATION
    ? operation.clientScanId
    : operation.operationId;
}

/** Refusals of the operations that are not scans; a scan's come from `ScanRefusal`. */
export const CourierOperationError = {
  /** The operation could not be read at all; the app drops it and says so. */
  OPERATION_INVALIDE: 'OPERATION_INVALIDE',
  /** The same operation id sent by another person. */
  OPERATION_ID_REUTILISE: 'OPERATION_ID_REUTILISE',
  NOTE_VIDE: 'NOTE_VIDE',
  /** The note d'adresse is written after a successful delivery (Coursier 4.3). */
  NOTE_APRES_LIVRAISON: 'NOTE_APRES_LIVRAISON',
} as const;
export type CourierOperationError =
  (typeof CourierOperationError)[keyof typeof CourierOperationError];

export const COURIER_OPERATION_ERROR_MESSAGES_FR: Record<CourierOperationError, string> = {
  OPERATION_INVALIDE: 'Opération illisible : elle a été retirée de la file',
  OPERATION_ID_REUTILISE: 'Identifiant déjà utilisé par une autre opération',
  NOTE_VIDE: 'Écrivez une note ou un point de rendez-vous',
  NOTE_APRES_LIVRAISON: 'La note d’adresse s’enregistre après une livraison réussie',
};

/** What the API answers for each operation, in the order sent. */
export interface CourierOperationResult {
  kind: CourierOperationKind | null;
  /** The scan's id on the phone, or the operation's. */
  id: string | null;
  /** Recorded or applied (true), or refused (false) with its reason. */
  ok: boolean;
  /** The same operation came before: this is its first answer. */
  replayed: boolean;
  code: string | null;
  message: string;
  parcel: { code: string; status: ParcelStatus } | null;
}

// ── Annuler le dernier scan, on the phone's clock (A-11) ────

export interface CourierScanCancelFacts {
  accepted: boolean;
  alreadyCancelled: boolean;
  byActor: boolean;
  /** No later accepted, not cancelled scan of his. */
  isLatestOfActor: boolean;
  /** When the phone made the scan. */
  scanDeviceTime: Date;
  /** When the courier pressed Annuler, on the same phone. */
  cancelDeviceTime: Date;
  windowSeconds: number;
  /** The scan's events are still the parcel's last ones. */
  parcelUnchangedSince: boolean;
  /** Its charges are still waiting: none has reached a bon (phase 8). */
  chargesStillWaiting: boolean;
  /** A pickup scan whose pickup Terminer has already counted (A-13). */
  pickupFinished: boolean;
}

/**
 * Whether a courier's scan can be cancelled (A-11): his own last accepted
 * scan, within the window measured between the two device times — a scan made
 * offline is cancelled offline, and reaches the server later. After the
 * window only the admin corrects.
 */
export function courierScanCancelRefusal(facts: CourierScanCancelFacts): ScanCancelRefusal | null {
  if (!facts.accepted || facts.alreadyCancelled) return ScanCancelRefusal.ANNULATION_SCAN_REFUSE;
  if (!facts.byActor) return ScanCancelRefusal.ANNULATION_AUTRE_PERSONNE;
  if (!facts.isLatestOfActor) return ScanCancelRefusal.ANNULATION_PAS_DERNIER;
  const elapsed = facts.cancelDeviceTime.getTime() - facts.scanDeviceTime.getTime();
  if (elapsed < 0 || elapsed > facts.windowSeconds * 1000) {
    return ScanCancelRefusal.ANNULATION_HORS_DELAI;
  }
  if (facts.pickupFinished) return ScanCancelRefusal.ANNULATION_RAMASSAGE_TERMINE;
  if (!facts.parcelUnchangedSince || !facts.chargesStillWaiting) {
    return ScanCancelRefusal.ANNULATION_COLIS_MODIFIE;
  }
  return null;
}

/** Whether the phone still offers Annuler on a scan it made (A-11). */
export function isWithinCancelWindow(
  scanDeviceTime: Date,
  now: Date,
  windowSeconds: number,
): boolean {
  const elapsed = now.getTime() - scanDeviceTime.getTime();
  return elapsed >= 0 && elapsed <= windowSeconds * 1000;
}

/**
 * What a parcel was before a courier's scan: the depot's snapshot (D-53) and
 * the columns Ramassage, Livré and Échec write, so a cancellation puts every
 * one of them back. Dates as ISO strings, money as digits.
 */
export interface CourierParcelBefore extends ParcelBefore {
  cashStatus: ParcelCashStatus | null;
  attemptCount: number;
  verifyDeadlineAt: string | null;
  lastFailureReason: FailureReason | null;
  lastFailureNote: string | null;
  courierRateMillimes: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  exchangeItemCollected: boolean;
  exchangeItemStatus: ParcelStatus | null;
}

// ── Échec, Reporté par le client (D-9) ──────────────────────

/**
 * The days the courier can pick, as big buttons rather than a calendar:
 * tomorrow up to seven days ahead, from the phone's business day (A-12).
 */
export function postponementChoices(now: Date): string[] {
  const today = tunisDayKey(now);
  const days: string[] = [];
  for (let offset = POSTPONEMENT_MIN_DAYS; offset <= POSTPONEMENT_MAX_DAYS; offset++) {
    days.push(addTunisDays(today, offset));
  }
  return days;
}

/** The business day a scan made now belongs to, as `AAAA-MM-JJ` (A-12). */
export function businessDayKeyOf(instant: Date): string {
  return businessDateOf(instant).toISOString().slice(0, 10);
}

// ── Ma caisse (Coursier 4.7, 4.9) ───────────────────────────

/**
 * Cash porté: what the server knows he carries, plus his Livré scans still
 * waiting on the phone, so the total is right offline (Coursier 4.9).
 */
export function courierCashCarried(
  carried: readonly { codAmountMillimes: Millimes }[],
  pendingDeliveries: readonly { collectedMillimes: Millimes }[],
): Millimes {
  return (
    sumMillimes(carried.map((p) => p.codAmountMillimes)) +
    sumMillimes(pendingDeliveries.map((p) => p.collectedMillimes))
  );
}

// ── Trouver le client (Coursier 4.3) ────────────────────────

/** "Message WhatsApp prêt", worded by Coursier 4.3. */
export function whatsappMessageFr(shopName: string, delegationName: string): string {
  return `Bonjour, je suis le livreur Faffa Go pour votre commande de ${shopName}. Je suis à ${delegationName}, pouvez-vous me guider ?`;
}

/** Tunisian numbers are 8 digits; WhatsApp wants the country code. */
export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/216${normalizePhone(phone)}?text=${encodeURIComponent(text)}`;
}

export function telLink(phone: string): string {
  return `tel:+216${normalizePhone(phone)}`;
}
