import { z } from 'zod';
import { documentDateKey } from './codes.js';
import type { Millimes } from './money.js';
import type { ReturnCorrectionTarget } from './parcel-state-machine.js';
import { BonStatus, ParcelCashStatus, ParcelStatus, PickupStatus } from './statuses.js';

/**
 * Bons de versement and bons de retour (Vendeur 4.11, 4.12, Admin 4.10,
 * 4.11, D-80, D-81): what their QR holds, who carries them, what a bon may
 * pay. The amounts come from `buildBonVersement` in fees.ts.
 */

export const BonKind = {
  BON_VERSEMENT: 'BON_VERSEMENT',
  BON_RETOUR: 'BON_RETOUR',
} as const;
export type BonKind = (typeof BonKind)[keyof typeof BonKind];

const PREFIX: Record<BonKind, 'BV' | 'BR'> = { BON_VERSEMENT: 'BV', BON_RETOUR: 'BR' };
const KIND_BY_PREFIX: Record<string, BonKind> = {
  BV: BonKind.BON_VERSEMENT,
  BR: BonKind.BON_RETOUR,
};

export const BON_KIND_LABELS_FR: Record<BonKind, string> = {
  BON_VERSEMENT: 'Bon de versement',
  BON_RETOUR: 'Bon de retour',
};

/** 128 random bits, hex: printed in the QR, never guessable from the number. */
export const BON_TOKEN_RE = /^[0-9a-f]{32}$/;

/** What the QR of a bon holds: `BV:` or `BR:` and the bon's token. */
export function bonQrContent(kind: BonKind, token: string): string {
  return `${PREFIX[kind]}:${token}`;
}

export interface BonScan {
  kind: BonKind;
  /** From the QR. */
  token: string | null;
  /** Typed from a damaged print: accepted and flagged, like a parcel code (D-80). */
  number: string | null;
}

const QR_RE = /^(BV|BR):([0-9A-F]{32})$/i;
const NUMBER_RE = /^(BV|BR)-\d{4}-\d{4}-\d{2,}$/i;

/** A scanned QR or a typed bon number; null when it is neither. */
export function parseBonScan(raw: string): BonScan | null {
  const text = String(raw).trim();
  const qr = QR_RE.exec(text);
  if (qr) {
    return {
      kind: KIND_BY_PREFIX[qr[1]!.toUpperCase()]!,
      token: qr[2]!.toLowerCase(),
      number: null,
    };
  }
  if (NUMBER_RE.test(text)) {
    const number = text.toUpperCase();
    return { kind: KIND_BY_PREFIX[number.slice(0, 2)]!, token: null, number };
  }
  return null;
}

/** `FP-2026-0925-01`: a fiche de paie, per Tunis day, like the bons (D-82). */
export function formatPayslipNumber(date: Date, sequence: number): string {
  const [year, month, day] = documentDateKey(date).split('-');
  return `FP-${year}-${month}${day}-${String(sequence).padStart(2, '0')}`;
}

// ── What a bon de versement may pay ─────────────────────────

export const PayableRefusal = {
  AUTRE_VENDEUR: 'AUTRE_VENDEUR',
  PAS_LIVRE: 'PAS_LIVRE',
  PAS_ENCAISSE: 'PAS_ENCAISSE',
  DEJA_PAYE: 'DEJA_PAYE',
  DEJA_SUR_UN_BON: 'DEJA_SUR_UN_BON',
} as const;
export type PayableRefusal = (typeof PayableRefusal)[keyof typeof PayableRefusal];

export const PAYABLE_REFUSAL_MESSAGES_FR: Record<PayableRefusal, string> = {
  AUTRE_VENDEUR: 'Ce colis appartient à un autre vendeur',
  PAS_LIVRE: 'Seul un colis livré peut être payé',
  PAS_ENCAISSE: 'L’argent de ce colis n’est pas encore au dépôt',
  DEJA_PAYE: 'Ce colis est déjà payé',
  DEJA_SUR_UN_BON: 'Ce colis est déjà sur un bon de versement',
};

/** Livré, cash Au dépôt, the seller's, on no active bon (Vendeur rule 4, A-5a). */
export function payableParcelRefusal(
  parcel: {
    sellerId: string;
    status: ParcelStatus;
    cashStatus: ParcelCashStatus | null;
    inActiveBon: boolean;
  },
  sellerId: string,
): PayableRefusal | null {
  if (parcel.sellerId !== sellerId) return PayableRefusal.AUTRE_VENDEUR;
  if (parcel.status !== ParcelStatus.LIVRE) return PayableRefusal.PAS_LIVRE;
  if (parcel.cashStatus === ParcelCashStatus.PAYE) return PayableRefusal.DEJA_PAYE;
  if (parcel.cashStatus !== ParcelCashStatus.AU_DEPOT) return PayableRefusal.PAS_ENCAISSE;
  if (parcel.inActiveBon) return PayableRefusal.DEJA_SUR_UN_BON;
  return null;
}

// ── Who carries a bon, and when ─────────────────────────────

export interface BonVisit {
  ramasseurId: string;
  plannedDate: Date;
  /** Attached to a planned pickup, or a visit with nothing to pick up (answer 4). */
  viaPickup: boolean;
}

/**
 * A bon travels with its seller's planned pickup; without one, with the
 * ramasseur and day the team assigned it (D-80, answer 4). A cancelled
 * pickup leaves the bon unattached again.
 */
export function bonVisitOf(
  bon: { pickupId: string | null; ramasseurId: string | null; plannedDate: Date | null },
  pickup: { status: PickupStatus; ramasseurId: string | null; plannedDate: Date | null } | null,
): BonVisit | null {
  if (bon.pickupId && pickup) {
    const live = pickup.status === PickupStatus.PLANIFIE || pickup.status === PickupStatus.EFFECTUE;
    if (!live || !pickup.ramasseurId || !pickup.plannedDate) return null;
    return { ramasseurId: pickup.ramasseurId, plannedDate: pickup.plannedDate, viaPickup: true };
  }
  if (bon.ramasseurId && bon.plannedDate) {
    return { ramasseurId: bon.ramasseurId, plannedDate: bon.plannedDate, viaPickup: false };
  }
  return null;
}

/** A bon de retour is Remis once every line is received (D-81). */
export function bonRetourComplete(lines: readonly { received: boolean }[]): boolean {
  return lines.length > 0 && lines.every((line) => line.received);
}

// ── Correcting a bon scanned by mistake (D-88) ─────────────

/** What the seller reads on his bon and his parcel's timeline: never the reason. */
export const BON_CORRECTION_LABEL_FR = 'Correction Faffa Go';

export const BonCorrectionRefusal = {
  /** The signed copy proves the seller received it. */
  BON_ARCHIVE: 'BON_ARCHIVE',
  BON_NON_REMIS: 'BON_NON_REMIS',
  LIGNE_NON_RECUE: 'LIGNE_NON_RECUE',
  /** A bon de retour out again on another trip: its lines are not where the correction would put them. */
  BON_REPARTI: 'BON_REPARTI',
} as const;
export type BonCorrectionRefusal = (typeof BonCorrectionRefusal)[keyof typeof BonCorrectionRefusal];

export const BON_CORRECTION_REFUSAL_MESSAGES_FR: Record<BonCorrectionRefusal, string> = {
  BON_ARCHIVE: 'Bon archivé : la copie signée prouve la remise, il ne se corrige plus',
  BON_NON_REMIS: 'Seul un bon remis se corrige',
  LIGNE_NON_RECUE: 'Cette ligne n’a pas été scannée reçue',
  BON_REPARTI:
    'Ce bon est de nouveau en route : corrigez-le après la clôture de la caisse du ramasseur',
};

export type BonVersementCorrection =
  | {
      ok: true;
      /** En route with him while his caisse is open; Préparé, unattached, once it is closed. */
      bonStatusAfter: typeof BonStatus.EN_ROUTE | typeof BonStatus.PREPARE;
      /** The part of his closed caisse's surplus this bon explains. */
      coveredBySurplusMillimes: Millimes;
      /** What the surplus does not cover: the ramasseur's shortfall, for HR. */
      shortfallMillimes: Millimes;
      /** Nothing of the surplus is left unexplained: it is marked Vérifié. */
      surplusExplained: boolean;
    }
  | { ok: false; refusal: BonCorrectionRefusal };

/**
 * A bon de versement scanned Remis by mistake (D-88). While the ramasseur's
 * caisse of the day he carried it is open, the cash is simply expected from
 * him again. Once it is closed, the cash he did not hand over came back in
 * his count as a surplus: the bon's net is taken from that surplus (what an
 * earlier correction of the same caisse already took excluded), and whatever
 * it does not cover is his shortfall. The closed session is never rewritten.
 */
export function bonVersementCorrection(input: {
  status: BonStatus;
  caisseClosed: boolean;
  netMillimes: Millimes;
  /** The closed session's écart when positive, else 0. */
  surplusMillimes: Millimes;
  surplusAlreadyExplainedMillimes: Millimes;
}): BonVersementCorrection {
  if (input.status === BonStatus.ARCHIVE)
    return { ok: false, refusal: BonCorrectionRefusal.BON_ARCHIVE };
  if (input.status !== BonStatus.REMIS)
    return { ok: false, refusal: BonCorrectionRefusal.BON_NON_REMIS };
  if (!input.caisseClosed) {
    return {
      ok: true,
      bonStatusAfter: BonStatus.EN_ROUTE,
      coveredBySurplusMillimes: 0n,
      shortfallMillimes: 0n,
      surplusExplained: false,
    };
  }
  const left = input.surplusMillimes - input.surplusAlreadyExplainedMillimes;
  const available = left > 0n ? left : 0n;
  const covered = available < input.netMillimes ? available : input.netMillimes;
  return {
    ok: true,
    bonStatusAfter: BonStatus.PREPARE,
    coveredBySurplusMillimes: covered,
    shortfallMillimes: input.netMillimes - covered,
    surplusExplained: available > 0n && available === covered,
  };
}

export type BonRetourLineCorrection =
  | {
      ok: true;
      parcelTo: ReturnCorrectionTarget;
      bonStatusAfter: typeof BonStatus.EN_ROUTE | typeof BonStatus.PREPARE;
    }
  | { ok: false; refusal: BonCorrectionRefusal };

/**
 * A line of a bon de retour scanned Retour reçu by mistake (D-88): back with
 * the ramasseur, the bon En route, while his caisse of the day he received it
 * is open and he still carries the bon; at the depot, the bon Préparé and
 * unattached, once that caisse is closed. A bon out again on another trip
 * waits for that trip's Clôturer.
 */
export function bonRetourLineCorrection(input: {
  bonStatus: BonStatus;
  lineReceived: boolean;
  caisseClosed: boolean;
  /** The bon is carried by the ramasseur whose scan received the line. */
  sameCarrier: boolean;
}): BonRetourLineCorrection {
  if (input.bonStatus === BonStatus.ARCHIVE) {
    return { ok: false, refusal: BonCorrectionRefusal.BON_ARCHIVE };
  }
  if (input.bonStatus === BonStatus.ANNULE) {
    return { ok: false, refusal: BonCorrectionRefusal.BON_NON_REMIS };
  }
  if (!input.lineReceived) return { ok: false, refusal: BonCorrectionRefusal.LIGNE_NON_RECUE };
  const carried = input.bonStatus === BonStatus.EN_ROUTE || input.bonStatus === BonStatus.REMIS;
  if (!input.caisseClosed && carried && input.sameCarrier) {
    return { ok: true, parcelTo: 'RAMASSEUR', bonStatusAfter: BonStatus.EN_ROUTE };
  }
  if (input.bonStatus === BonStatus.EN_ROUTE) {
    return { ok: false, refusal: BonCorrectionRefusal.BON_REPARTI };
  }
  return { ok: true, parcelTo: 'DEPOT', bonStatusAfter: BonStatus.PREPARE };
}

// ── Forms ───────────────────────────────────────────────────

/** At most this many parcels on one bon, so a bon prints on a sane number of pages. */
export const BON_MAX_PARCELS = 500;

export const prepareBonSchema = z
  .object({
    sellerId: z.string().uuid(),
    parcelIds: z
      .array(z.string().uuid())
      .min(1, 'Cochez au moins un colis')
      .max(BON_MAX_PARCELS)
      .refine((ids) => new Set(ids).size === ids.length, 'Un colis figure deux fois'),
  })
  .strict();
export type PrepareBonValues = z.output<typeof prepareBonSchema>;

/** A ramasseur and a day for a bon with no planned pickup (answer 4). */
export const assignBonSchema = z
  .object({
    /** The ramasseur's account id. */
    ramasseurId: z.string().uuid(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format AAAA-MM-JJ'),
  })
  .strict();
export type AssignBonValues = z.output<typeof assignBonSchema>;

/** Annuler le bon (A-5): admin, with a reason. */
export const cancelBonSchema = z
  .object({ reason: z.string().trim().min(5, 'Indiquez la raison de l’annulation').max(500) })
  .strict();
export type CancelBonValues = z.output<typeof cancelBonSchema>;

/** Handing bons to a ramasseur as he leaves (D-80, answer 5). */
export const handOutBonsSchema = z
  .object({
    /** The ramasseur's account id. */
    ramasseurId: z.string().uuid(),
    bonsVersement: z.array(z.string().uuid()).max(100).default([]),
    bonsRetour: z.array(z.string().uuid()).max(100).default([]),
  })
  .strict()
  .refine((value) => value.bonsVersement.length + value.bonsRetour.length > 0, {
    message: 'Cochez au moins un bon',
  });
export type HandOutBonsValues = z.output<typeof handOutBonsSchema>;

/** Corriger un bon (D-88): the admin, with a reason kept staff-side. */
export const correctBonSchema = z
  .object({ reason: z.string().trim().min(5, 'Indiquez la raison de la correction').max(500) })
  .strict();
export type CorrectBonValues = z.output<typeof correctBonSchema>;

/** Corriger une ligne d'un bon de retour (D-88): which line, and why. */
export const correctBonRetourLineSchema = correctBonSchema
  .extend({
    parcelCode: z.string().trim().toUpperCase().min(1).max(20),
    itemType: z.enum(['COLIS', 'ARTICLE_RECUPERE']),
  })
  .strict();
export type CorrectBonRetourLineValues = z.output<typeof correctBonRetourLineSchema>;
