import { z } from 'zod';
import { codAmount, tunisianPhone } from './schemas.js';
import {
  canChangeClient,
  canRelaunch,
  POSTPONEMENT_MAX_DAYS,
  POSTPONEMENT_MIN_DAYS,
  type ParcelSnapshot,
} from './parcel-state-machine.js';
import { ParcelLocation, ParcelStatus, RelaunchSlot } from './statuses.js';

/**
 * À vérifier (Vendeur 4.9, Admin 4.6): the seller's decisions, the time left
 * before the 48-hour return, and the calls Service client logs.
 *
 * Only the seller decides (D-4). The team follows up and logs its calls; the
 * automatic rules — 48 hours, third attempt — are the only other way a parcel
 * becomes a return.
 */

// ── Time left (Vendeur 4.9, 4.13) ───────────────────────────

/**
 * Below this, a parcel is flagged: the seller's banner on the Tableau de bord
 * lists it (the "Plus que 24 h" notification of Vendeur 4.13 stands in for
 * the notifications, which are post-launch).
 */
export const VERIFY_WARNING_HOURS = 24;

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/** Milliseconds before the automatic return; zero or less once it is due. */
export function verifyTimeLeftMs(deadline: Date, now: Date): number {
  return deadline.getTime() - now.getTime();
}

/** Less than 24 hours left, and not yet due. */
export function isVerifyDeadlineNear(deadline: Date, now: Date): boolean {
  const left = verifyTimeLeftMs(deadline, now);
  return left > 0 && left < VERIFY_WARNING_HOURS * HOUR_MS;
}

/** The job returns every parcel whose deadline has passed (D-30: server time). */
export function isVerifyDeadlinePassed(deadline: Date, now: Date): boolean {
  return verifyTimeLeftMs(deadline, now) <= 0;
}

/** "31 h 20 min", "45 min", "moins d'une minute", "retour en cours". Rounded down. */
export function timeLeftLabelFR(ms: number): string {
  if (ms <= 0) return 'retour en cours';
  if (ms < MINUTE_MS) return 'moins d’une minute';
  const totalMinutes = Math.floor(ms / MINUTE_MS);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${String(minutes).padStart(2, '0')} min`;
}

// ── The seller's decisions (Vendeur 4.9) ────────────────────

/** A day as `AAAA-MM-JJ`: the Tunis day the parcel goes out again. */
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choisissez une date');

/** The day key read as the UTC midnight the state machine compares by day. */
export function relaunchDateFromKey(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

/** Cleared with an empty value, kept when absent. */
const clearable = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

/**
 * Relancer (Vendeur 4.9, D-29, D-70): a date between tomorrow and 7 days, an
 * optional slot, and the corrections the seller may make with it. Phone,
 * phone 2, address, landmark and the courier note are applied directly; a
 * new localité stays a change request (D-44).
 */
export const relancerSchema = z
  .object({
    date: dayKey,
    slot: z.nativeEnum(RelaunchSlot).nullable().optional(),
    recipientPhone: tunisianPhone.optional(),
    recipientPhone2: z
      .union([z.literal(''), tunisianPhone])
      .transform((value) => (value === '' ? null : value))
      .nullable()
      .optional(),
    address: z.string().trim().min(5, 'Adresse trop courte').max(500).optional(),
    landmark: clearable(200),
    courierNote: clearable(300),
  })
  .strict();
export type RelancerValues = z.output<typeof relancerSchema>;

/** The fields Relancer may correct, in the order the form shows them (D-70). */
export const RELANCER_CORRECTION_FIELDS = [
  'recipientPhone',
  'recipientPhone2',
  'address',
  'landmark',
  'courierNote',
] as const;
export type RelancerCorrectionField = (typeof RELANCER_CORRECTION_FIELDS)[number];

/** Changer la date of a planned relance or a customer postponement (D-9). */
export const changerDateSchema = z
  .object({ date: dayKey, slot: z.nativeEnum(RelaunchSlot).nullable().optional() })
  .strict();
export type ChangerDateValues = z.output<typeof changerDateSchema>;

/**
 * Changer de client (Vendeur 4.9, A-17): the new customer, entered like a
 * new parcel, and the COD, which may change. The product stays the same
 * parcel. The fee is the one frozen on the parcel at creation.
 */
export const changerClientSchema = z
  .object({
    recipientName: z.string().trim().min(2, 'Nom du destinataire obligatoire').max(120),
    recipientPhone: tunisianPhone,
    recipientPhone2: tunisianPhone.optional().nullable(),
    localiteId: z.string().uuid('Localité obligatoire'),
    address: z.string().trim().min(5, 'Adresse obligatoire').max(500),
    landmark: z.string().trim().max(200).optional().nullable(),
    codAmountMillimes: codAmount,
    isExchange: z.boolean().default(false),
    openingAllowed: z.boolean().default(false),
    courierNote: z.string().trim().max(300).optional().nullable(),
  })
  .strict();
export type ChangerClientValues = z.output<typeof changerClientSchema>;

/** What the seller may do now with a parcel waiting on him. */
export interface SellerDecisions {
  relancer: boolean;
  retourner: boolean;
  /** Relancé: move the planned day (D-9). */
  changerDate: boolean;
  /**
   * OUI, or AU_RETOUR_DEPOT while the courier still carries it — the button
   * then reads "Disponible au retour au dépôt" (Vendeur 4.9) — or NON.
   */
  changerClient: 'OUI' | 'AU_RETOUR_DEPOT' | 'NON';
}

export function sellerDecisionsFor(
  parcel: ParcelSnapshot,
  limits: { maxAttempts: number; maxClientChanges: number },
): SellerDecisions {
  const waiting =
    parcel.status === ParcelStatus.A_VERIFIER || parcel.status === ParcelStatus.RELANCE;
  const changeLeft = parcel.changeClientCount < limits.maxClientChanges;
  return {
    relancer: canRelaunch(parcel, limits.maxAttempts),
    retourner: waiting,
    changerDate: parcel.status === ParcelStatus.RELANCE,
    changerClient: canChangeClient(parcel, limits.maxClientChanges)
      ? 'OUI'
      : waiting && changeLeft && parcel.location !== ParcelLocation.AU_DEPOT
        ? 'AU_RETOUR_DEPOT'
        : 'NON',
  };
}

/** The window the date pickers offer, in days from today (D-9). */
export const RELAUNCH_WINDOW_DAYS = { min: POSTPONEMENT_MIN_DAYS, max: POSTPONEMENT_MAX_DAYS };

// ── Refusals the seller reads ───────────────────────────────

export const DecisionErrorCode = {
  DECISION_IMPOSSIBLE: 'DECISION_IMPOSSIBLE',
  CHANGEMENT_CLIENT_AU_RETOUR_DEPOT: 'CHANGEMENT_CLIENT_AU_RETOUR_DEPOT',
} as const;
export type DecisionErrorCode = (typeof DecisionErrorCode)[keyof typeof DecisionErrorCode];

export const DECISION_MESSAGES_FR: Record<DecisionErrorCode, string> = {
  DECISION_IMPOSSIBLE: 'Ce colis n’attend plus de décision. Rechargez la page.',
  CHANGEMENT_CLIENT_AU_RETOUR_DEPOT:
    'Disponible au retour au dépôt : le livreur a encore le colis.',
};

// ── Appels Faffa Go (Admin 4.6, Vendeur 4.8) ────────────────

/**
 * A call Service client made about a parcel: answered or not, and a note.
 * Its time is the server's when it is logged. Calls are never edited or
 * deleted; a mistake is corrected by logging the call again (D-73).
 */
export const logCallSchema = z
  .object({
    answered: z.boolean(),
    note: z.string().trim().max(300).optional(),
  })
  .strict();
export type LogCallValues = z.output<typeof logCallSchema>;

export function callOutcomeLabelFR(answered: boolean): string {
  return answered ? 'Répondu' : 'Pas de réponse';
}

/** Calls can be logged from pickup until the parcel's journey ends (D-73). */
export function canLogCall(status: ParcelStatus): boolean {
  return (
    status !== ParcelStatus.CREE &&
    status !== ParcelStatus.ANNULE &&
    status !== ParcelStatus.RETOUR_RECU
  );
}
