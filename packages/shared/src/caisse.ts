import { z } from 'zod';
import { computeCaisseCount } from './fees.js';
import { parseDT, sumMillimes, type Millimes } from './money.js';
import { Role } from './roles.js';
import { CaisseSessionStatus } from './statuses.js';

/**
 * The Caisse (Admin 4.9, D-79): every courier hands over his cash each day,
 * and the depot counts it, one courier and one business day at a time.
 *
 * Pure rules only; the API reads the scans and sessions and stores what these
 * return, in one transaction per Compter or Clôturer.
 */

// ── Which deliveries a session expects ──────────────────────

export const CaisseLineOrigin = {
  /** Delivered on the session's own business day (the phone's day, A-12). */
  JOUR: 'JOUR',
  /** Synced after its own day's session was closed: counted now, flagged (answer 2). */
  TARDIF: 'TARDIF',
} as const;
export type CaisseLineOrigin = (typeof CaisseLineOrigin)[keyof typeof CaisseLineOrigin];

export const CAISSE_LINE_ORIGIN_LABELS_FR: Record<CaisseLineOrigin, string> = {
  JOUR: 'Du jour',
  TARDIF: 'Scan tardif',
};

/**
 * Whether a Livré whose cash is still with the courier belongs to a session.
 * Days are `AAAA-MM-JJ` keys, which compare in calendar order. A delivery of
 * an earlier day whose session was never closed stays with that day: it
 * shows there, Ouverte, in the daily summary.
 */
export function caisseLineOrigin(input: {
  scanDay: string;
  sessionDay: string;
  scanDaySessionClosed: boolean;
}): CaisseLineOrigin | null {
  if (input.scanDay === input.sessionDay) return CaisseLineOrigin.JOUR;
  if (input.scanDay < input.sessionDay && input.scanDaySessionClosed) {
    return CaisseLineOrigin.TARDIF;
  }
  return null;
}

/** A ramasseur's bon cash: what he left with, minus what sellers signed for. */
export function expectedBonCash(
  lines: readonly { takenOutMillimes: Millimes; remisMillimes: Millimes }[],
): Millimes {
  return (
    sumMillimes(lines.map((line) => line.takenOutMillimes)) -
    sumMillimes(lines.map((line) => line.remisMillimes))
  );
}

// ── Closing ─────────────────────────────────────────────────

export interface CaisseCloseOutcome {
  expectedTotalMillimes: Millimes;
  /** Compté − attendu. */
  ecartMillimes: Millimes;
  /** A livreur's shortfall: his debt, deducted from his pay (Admin rule 5). */
  debtMillimes: Millimes;
  /** A ramasseur's shortfall: reported to HR, his pay is outside the app (Admin 4.9). */
  hrShortfallMillimes: Millimes;
  /** A surplus is never absorbed: flagged until the admin checks it (answer 3). */
  flagged: boolean;
}

export function caisseCloseOutcome(input: {
  role: typeof Role.LIVREUR | typeof Role.RAMASSEUR;
  expectedDeliveryMillimes: Millimes;
  expectedBonCashMillimes: Millimes;
  countedMillimes: Millimes;
}): CaisseCloseOutcome {
  const count = computeCaisseCount(input);
  const livreur = input.role === Role.LIVREUR;
  return {
    expectedTotalMillimes: count.expectedTotalMillimes,
    ecartMillimes: count.ecartMillimes,
    debtMillimes: livreur ? count.debtMillimes : 0n,
    hrShortfallMillimes: livreur ? 0n : count.debtMillimes,
    flagged: count.surplusMillimes > 0n,
  };
}

// ── What can be done to a session ───────────────────────────

export const CaisseRefusal = {
  SESSION_CLOTUREE: 'SESSION_CLOTUREE',
  SESSION_NON_COMPTEE: 'SESSION_NON_COMPTEE',
  ATTENDU_MODIFIE: 'ATTENDU_MODIFIE',
  PAS_UN_COURSIER: 'PAS_UN_COURSIER',
  ECART_NON_SIGNALE: 'ECART_NON_SIGNALE',
  ECART_DEJA_VERIFIE: 'ECART_DEJA_VERIFIE',
  DETTE_INTROUVABLE: 'DETTE_INTROUVABLE',
  DETTE_NON_EN_COURS: 'DETTE_NON_EN_COURS',
  /** Handing a bon to a ramasseur whose caisse of the day is already closed. */
  CAISSE_RAMASSEUR_CLOTUREE: 'CAISSE_RAMASSEUR_CLOTUREE',
} as const;
export type CaisseRefusal = (typeof CaisseRefusal)[keyof typeof CaisseRefusal];

export const CAISSE_REFUSAL_MESSAGES_FR: Record<CaisseRefusal, string> = {
  SESSION_CLOTUREE: 'Cette caisse est déjà clôturée',
  SESSION_NON_COMPTEE: 'Comptez la caisse avant de la clôturer',
  ATTENDU_MODIFIE: 'Le montant attendu a changé : recomptez',
  PAS_UN_COURSIER: 'Ce compte n’est pas un coursier',
  ECART_NON_SIGNALE: 'Aucun écart positif à vérifier sur cette caisse',
  ECART_DEJA_VERIFIE: 'Cet écart a déjà été vérifié',
  DETTE_INTROUVABLE: 'Dette introuvable',
  DETTE_NON_EN_COURS: 'Seule une dette en cours peut être annulée',
  CAISSE_RAMASSEUR_CLOTUREE: 'La caisse du ramasseur est déjà clôturée aujourd’hui',
};

/** Compter, and recompter, until the session is closed (D-79). */
export function countRefusal(status: CaisseSessionStatus | null): CaisseRefusal | null {
  return status === CaisseSessionStatus.CLOTUREE ? CaisseRefusal.SESSION_CLOTUREE : null;
}

/**
 * Clôturer: a counted session whose attendu is still what was counted
 * against. A Livré synced in between would otherwise go Au dépôt uncounted.
 */
export function closeRefusal(input: {
  status: CaisseSessionStatus | null;
  countedExpectedMillimes: Millimes | null;
  currentExpectedMillimes: Millimes;
}): CaisseRefusal | null {
  if (input.status === CaisseSessionStatus.CLOTUREE) return CaisseRefusal.SESSION_CLOTUREE;
  if (input.status !== CaisseSessionStatus.COMPTEE || input.countedExpectedMillimes === null) {
    return CaisseRefusal.SESSION_NON_COMPTEE;
  }
  if (input.countedExpectedMillimes !== input.currentExpectedMillimes) {
    return CaisseRefusal.ATTENDU_MODIFIE;
  }
  return null;
}

/** The daily summary reads a courier with no session row yet as Ouverte (answer 1). */
export function caisseDayStatus(status: CaisseSessionStatus | null): CaisseSessionStatus {
  return status ?? CaisseSessionStatus.OUVERTE;
}

// ── Forms ───────────────────────────────────────────────────

/** Compter: the amount handed over, typed as the team reads it (85,000). */
export const caisseCountSchema = z
  .object({ counted: z.string().trim().min(1, 'Montant compté obligatoire').max(20) })
  .strict()
  .transform((value, ctx) => {
    let countedMillimes: Millimes;
    try {
      countedMillimes = parseDT(value.counted);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Montant invalide', path: ['counted'] });
      return z.NEVER;
    }
    if (countedMillimes < 0n) {
      ctx.addIssue({ code: 'custom', message: 'Montant invalide', path: ['counted'] });
      return z.NEVER;
    }
    return { countedMillimes };
  });
export type CaisseCountValues = z.output<typeof caisseCountSchema>;

const note = z.string().trim().min(5, 'Indiquez une note (5 caractères au moins)').max(500);

/** Vérifier un écart positif, admin only (answer 3). */
export const ecartCheckSchema = z.object({ note }).strict();
export type EcartCheckValues = z.output<typeof ecartCheckSchema>;

/** Annuler une dette, admin only, with a note (Admin rule 5). */
export const debtCancelSchema = z.object({ note }).strict();
export type DebtCancelValues = z.output<typeof debtCancelSchema>;

/** The business day of the summary and the sessions, `AAAA-MM-JJ`. */
export const caisseDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date au format AAAA-MM-JJ');
