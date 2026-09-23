import type { Millimes } from './money.js';
import {
  ParcelEffect,
  ParcelEventType,
  type ParcelSnapshot,
  type ParcelTransitionEvent,
} from './parcel-state-machine.js';
import {
  ChargeType,
  ParcelStatus,
  type FailureReason,
  type ParcelCashStatus,
  type ParcelLocation,
  type RelaunchOrigin,
  type RelaunchSlot,
} from './statuses.js';

/**
 * What a transition writes to the parcel and to `seller_charges`.
 *
 * The state machine decides the new state and names its effects; this turns
 * both into rows. It is pure so the money in it is tested without a database,
 * and the API's parcel event service writes the result in the transaction of
 * the events themselves.
 */

/** The fees frozen on the parcel at creation (CLAUDE.md, Money). */
export interface ParcelFrozenFees {
  deliveryFeeMillimes: Millimes;
  returnFeeMillimes: Millimes;
  changeClientFeeMillimes: Millimes;
}

export interface ParcelEffectContext {
  /** Server time. The 48-hour clock starts when the failure reaches the server. */
  now: Date;
  verifyDeadlineHours: number;
  /** Paramètres today; frozen on the parcel at delivery (A-15). */
  courierRatePerParcelMillimes: Millimes;
  /** The parcel's own columns: a charge never reads the current settings. */
  fees: ParcelFrozenFees;
  failureReason: FailureReason | null;
  failureNote: string | null;
}

/** Columns left undefined are not written. */
export interface ParcelColumnChanges {
  status: ParcelStatus;
  location: ParcelLocation;
  cashStatus: ParcelCashStatus | null;
  attemptCount: number;
  changeClientCount: number;
  currentLivreurId: string | null;
  relaunchDate: Date | null;
  relaunchSlot: RelaunchSlot | null;
  relaunchOrigin: RelaunchOrigin | null;
  verifyDeadlineAt?: Date | null;
  courierRateMillimes?: Millimes;
  lastFailureReason?: FailureReason | null;
  lastFailureNote?: string | null;
  exchangeItemCollected?: boolean;
  exchangeItemStatus?: ParcelStatus;
  pickedUpAt?: Date;
  deliveredAt?: Date;
  cancelledAt?: Date;
  closedAt?: Date;
}

export interface ChargeToCreate {
  type: ChargeType;
  amountMillimes: Millimes;
}

export interface ParcelWrite {
  columns: ParcelColumnChanges;
  charges: ChargeToCreate[];
}

const HOUR_MS = 3_600_000;

export function parcelWriteFor(
  transition: { next: ParcelSnapshot; events: readonly ParcelTransitionEvent[] },
  ctx: ParcelEffectContext,
): ParcelWrite {
  const { next } = transition;
  const columns: ParcelColumnChanges = {
    status: next.status,
    location: next.location,
    cashStatus: next.cashStatus,
    attemptCount: next.attemptCount,
    changeClientCount: next.changeClientCount,
    currentLivreurId: next.currentLivreurId,
    relaunchDate: next.relaunchDate,
    relaunchSlot: next.relaunchSlot,
    relaunchOrigin: next.relaunchOrigin,
  };
  const charges: ChargeToCreate[] = [];

  for (const event of transition.events) {
    stampTimes(event, columns, ctx);
    for (const effect of event.effects) applyEffect(effect, columns, charges, ctx);
  }

  return { columns, charges };
}

/** The dates the specs read back: pickup, delivery, cancellation, end of life. */
function stampTimes(
  event: ParcelTransitionEvent,
  columns: ParcelColumnChanges,
  ctx: ParcelEffectContext,
): void {
  switch (event.type) {
    case ParcelEventType.RAMASSAGE:
      columns.pickedUpAt = ctx.now;
      return;
    case ParcelEventType.LIVRAISON:
      // Delivered is not closed: the parcel's life ends when the seller is
      // paid for it, which the money phase stamps (D-24).
      columns.deliveredAt = ctx.now;
      return;
    case ParcelEventType.ECHEC_LIVRAISON:
      columns.lastFailureReason = ctx.failureReason;
      columns.lastFailureNote = ctx.failureNote;
      return;
    case ParcelEventType.ANNULATION:
      columns.cancelledAt = ctx.now;
      // Before pickup that is the end. After it the parcel still travels back
      // and closes at Retour reçu (D-24, D-28).
      if (event.newStatus === ParcelStatus.ANNULE) columns.closedAt = ctx.now;
      return;
    case ParcelEventType.RETOUR_RECU:
      columns.closedAt = ctx.now;
      return;
    default:
      return;
  }
}

function applyEffect(
  effect: ParcelEffect,
  columns: ParcelColumnChanges,
  charges: ChargeToCreate[],
  ctx: ParcelEffectContext,
): void {
  switch (effect) {
    case ParcelEffect.CREER_FRAIS_LIVRAISON:
      charges.push({ type: ChargeType.LIVRAISON, amountMillimes: ctx.fees.deliveryFeeMillimes });
      return;
    case ParcelEffect.CREER_FRAIS_RETOUR:
      charges.push({ type: ChargeType.RETOUR, amountMillimes: ctx.fees.returnFeeMillimes });
      return;
    case ParcelEffect.CREER_FRAIS_CHANGEMENT_CLIENT:
      charges.push({
        type: ChargeType.CHANGEMENT_CLIENT,
        amountMillimes: ctx.fees.changeClientFeeMillimes,
      });
      return;
    case ParcelEffect.FIGER_TARIF_COURSIER:
      columns.courierRateMillimes = ctx.courierRatePerParcelMillimes;
      return;
    case ParcelEffect.DEMARRER_DELAI_VERIFICATION:
      columns.verifyDeadlineAt = new Date(ctx.now.getTime() + ctx.verifyDeadlineHours * HOUR_MS);
      return;
    case ParcelEffect.ARRETER_DELAI_VERIFICATION:
      columns.verifyDeadlineAt = null;
      return;
    case ParcelEffect.ARTICLE_ECHANGE_A_RECUPERER:
      // The old item is a return from the moment the livreur takes it, still in
      // his hands until the depot scans it (A-7 precedent, D-23). No return fee
      // is ever charged for it (A-10).
      columns.exchangeItemCollected = true;
      columns.exchangeItemStatus = ParcelStatus.RETOUR_AU_DEPOT;
      return;
    // Already in the next snapshot the machine returned.
    case ParcelEffect.REINITIALISER_TENTATIVES:
    case ParcelEffect.PLANIFIER_RELANCE:
      return;
    // The chat's state is derived from the parcel (Q15), so there is nothing to
    // write here; the thread and its notifications come with phase 10.
    case ParcelEffect.OUVRIR_CHAT:
    case ParcelEffect.VERROUILLER_CHAT:
    case ParcelEffect.CLOTURER_CHAT:
      return;
    default: {
      const exhaustive: never = effect;
      throw new Error(`Effet inconnu : ${String(exhaustive)}`);
    }
  }
}
