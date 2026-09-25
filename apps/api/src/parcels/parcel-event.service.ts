import { Inject, Injectable } from '@nestjs/common';
import type { Parcel, ParcelEvent, Prisma, ScanSource, SellerCharge } from '@prisma/client';
import {
  applyCashTransition,
  applyParcelAction,
  CashTransition,
  ParcelCashStatus,
  businessDateOf,
  documentDateKey,
  ParcelEffect,
  ParcelEventType,
  ParcelLocation,
  ParcelStatus,
  parcelWriteFor,
  Role,
  SCAN_REFUSAL_MESSAGES_FR,
  ScanRefusal,
  SYSTEM_ACTOR,
  type CourierParcelBefore,
  type FailureReason,
  type ParcelAction,
  type ParcelBefore,
  type ParcelSnapshot,
  type ParcelTransitionEvent,
  type RelaunchSlot,
} from '@faffago/shared';
import type { UserPrincipal } from '../auth/principal';
import { CLOCK, type Clock } from '../common/clock';
import { PrismaService } from '../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

/** A signed-in user, or a scheduled job (the 48-hour return). */
export type ParcelActor = UserPrincipal | typeof SYSTEM_ACTOR;

/**
 * What the caller asks for. There is deliberately no actor field: who acts is
 * always the principal the guard established, never something sent.
 */
export interface ParcelActionRequest {
  action: ParcelAction;
  /** Sortie coursier: the livreur chosen on the scan screen. */
  assignToCourierId?: string | null;
  failureReason?: FailureReason;
  postponedTo?: Date | null;
  relaunchSlot?: RelaunchSlot | null;
}

/** Where and how it happened, stored on the event as it was received. */
export interface ParcelEventContext {
  source?: ScanSource | null;
  scanId?: string | null;
  gps?: { lat: number; lng: number; accuracyM?: number | null } | null;
  deviceId?: string | null;
  appVersion?: string | null;
  /** The courier's device clock: it decides the business day of a scan made offline (A-12). */
  deviceTime?: Date | null;
  /** The courier's note on a failure, shown with its reason. */
  note?: string | null;
  /**
   * What the action carried that the type alone does not say, written on its
   * first event: the fields a Modifier changed, before and after (D-41).
   */
  details?: Prisma.InputJsonObject | null;
}

export interface ParcelActionInput {
  parcelId: string;
  actor: ParcelActor;
  request: ParcelActionRequest;
  context?: ParcelEventContext;
}

export type ParcelActionResult =
  | { ok: true; parcel: Parcel; events: ParcelEvent[]; charges: SellerCharge[] }
  | { ok: false; refusal: ScanRefusal; message: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function refused(refusal: ScanRefusal): ParcelActionResult {
  return { ok: false, refusal, message: SCAN_REFUSAL_MESSAGES_FR[refusal] };
}

function snapshotOf(parcel: Parcel): ParcelSnapshot {
  return {
    status: parcel.status,
    location: parcel.location,
    cashStatus: parcel.cashStatus,
    attemptCount: parcel.attemptCount,
    changeClientCount: parcel.changeClientCount,
    currentLivreurId: parcel.currentLivreurId,
    isExchange: parcel.isExchange,
    relaunchDate: parcel.relaunchDate,
    relaunchOrigin: parcel.relaunchOrigin,
    relaunchSlot: parcel.relaunchSlot,
  };
}

/**
 * The parcel event service: the only code that moves a parcel (CLAUDE.md).
 *
 * Each action runs the shared state machine on the parcel as it is, locked,
 * and writes in one transaction the parcel's new columns, one immutable event
 * per step, and the charges the step owes, copied from the fees frozen on the
 * parcel (D-2). A refusal writes nothing and returns the machine's reason.
 *
 * The database backs this up: a parcel whose status or location changes
 * without an event of the same transaction is refused at commit (D-21).
 */
@Injectable()
export class ParcelEventService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** In a transaction of its own. */
  run(input: ParcelActionInput): Promise<ParcelActionResult> {
    return this.prisma.$transaction((tx) => this.apply(tx, input));
  }

  /**
   * In the caller's transaction, so a scan, a caisse closing or a bon commits
   * or rolls back together with the parcels it moves.
   */
  async apply(tx: Prisma.TransactionClient, input: ParcelActionInput): Promise<ParcelActionResult> {
    const { actor, request } = input;
    const context = input.context ?? {};
    if (!UUID_RE.test(input.parcelId)) return refused(ScanRefusal.CODE_INCONNU);

    // Two actions on one parcel queue here, so each reads the other's result
    // (a second Livré scan finds the parcel already delivered).
    await tx.$queryRaw`SELECT "id" FROM "parcels" WHERE "id" = ${input.parcelId}::uuid FOR UPDATE`;
    const parcel = await tx.parcel.findUnique({ where: { id: input.parcelId } });
    if (!parcel) return refused(ScanRefusal.CODE_INCONNU);

    // A seller never learns that a code he does not own exists (D-26).
    const user = actor === SYSTEM_ACTOR ? null : actor;
    if (user?.role === Role.VENDEUR && user.sellerId !== parcel.sellerId) {
      return refused(ScanRefusal.CODE_INCONNU);
    }

    const { settings } = await this.settings.current(tx);
    const now = this.clock.now();
    const transition = applyParcelAction(snapshotOf(parcel), {
      action: request.action,
      actor: user?.role ?? SYSTEM_ACTOR,
      actorCourierId: user?.courierId ?? null,
      assignToCourierId: request.assignToCourierId ?? null,
      failureReason: request.failureReason,
      postponedTo: request.postponedTo ?? null,
      relaunchSlot: request.relaunchSlot ?? null,
      today: businessDateOf(context.deviceTime ?? now),
      maxAttempts: settings.maxDeliveryAttempts,
      maxClientChanges: settings.maxClientChangesPerParcel,
    });
    if (!transition.ok) return refused(transition.refusal);

    const write = parcelWriteFor(transition, {
      now,
      verifyDeadlineHours: settings.verifyDeadlineHours,
      courierRatePerParcelMillimes: settings.courierRatePerParcelMillimes,
      fees: {
        deliveryFeeMillimes: parcel.deliveryFeeMillimes,
        returnFeeMillimes: parcel.returnFeeMillimes,
        changeClientFeeMillimes: parcel.changeClientFeeMillimes,
      },
      failureReason: request.failureReason ?? null,
      failureNote: context.note ?? null,
    });

    const updated = await tx.parcel.update({ where: { id: parcel.id }, data: write.columns });

    const events: ParcelEvent[] = [];
    for (const [index, step] of transition.events.entries()) {
      events.push(
        await tx.parcelEvent.create({
          data: {
            parcelId: parcel.id,
            type: step.type,
            previousStatus: step.previousStatus,
            newStatus: step.newStatus,
            previousLocation: step.previousLocation,
            newLocation: step.newLocation,
            actorUserId: user?.userId ?? null,
            actorRole: user?.role ?? null,
            source: context.source ?? null,
            scanId: context.scanId ?? null,
            ...(step.type === ParcelEventType.ECHEC_LIVRAISON
              ? { reasonCode: request.failureReason ?? null }
              : {}),
            // The note belongs to what the person did, not to the automatic
            // return that may follow it in the same transition.
            reasonText: index === 0 ? (context.note ?? null) : null,
            gpsLat: context.gps?.lat ?? null,
            gpsLng: context.gps?.lng ?? null,
            gpsAccuracyM: context.gps?.accuracyM ?? null,
            deviceId: context.deviceId ?? null,
            appVersion: context.appVersion ?? null,
            deviceTime: context.deviceTime ?? null,
            serverTime: now,
            metadata: this.metadataOf(step, updated, index === 0 ? context.details : null),
          },
        }),
      );
    }

    const charges: SellerCharge[] = [];
    for (const charge of write.charges) {
      charges.push(
        await tx.sellerCharge.create({
          data: {
            sellerId: parcel.sellerId,
            parcelId: parcel.id,
            type: charge.type,
            amountMillimes: charge.amountMillimes,
            createdByUserId: user?.userId ?? null,
            scanId: context.scanId ?? null,
            createdAt: now,
          },
        }),
      );
    }

    return { ok: true, parcel: updated, events, charges };
  }

  /**
   * The CREATION event, written by parcel creation in its own transaction:
   * nothing before, Créé at the seller's after.
   */
  async recordCreation(
    tx: Prisma.TransactionClient,
    parcel: Parcel,
    actor: UserPrincipal,
  ): Promise<ParcelEvent> {
    return tx.parcelEvent.create({
      data: {
        parcelId: parcel.id,
        type: ParcelEventType.CREATION,
        previousStatus: null,
        newStatus: ParcelStatus.CREE,
        previousLocation: null,
        newLocation: ParcelLocation.CHEZ_LE_VENDEUR,
        actorUserId: actor.userId,
        actorRole: actor.role,
        serverTime: this.clock.now(),
      },
    });
  }

  /** The CREATION events of an Import CSV, in one statement: one per parcel, same actor. */
  async recordCreations(
    tx: Prisma.TransactionClient,
    parcels: readonly { id: string }[],
    actor: UserPrincipal,
  ): Promise<void> {
    const serverTime = this.clock.now();
    await tx.parcelEvent.createMany({
      data: parcels.map((parcel) => ({
        parcelId: parcel.id,
        type: ParcelEventType.CREATION,
        previousStatus: null,
        newStatus: ParcelStatus.CREE,
        previousLocation: null,
        newLocation: ParcelLocation.CHEZ_LE_VENDEUR,
        actorUserId: actor.userId,
        actorRole: actor.role,
        serverTime,
      })),
    });
  }

  /**
   * Puts a parcel back as it was before a scan (A-11, D-54): the columns the
   * scan changed, from what the scan kept, and one ANNULATION_SCAN event
   * naming the scan. No effect runs: a depot scan created no charge and
   * started no clock. The caller has checked that nothing happened since.
   */
  async restoreBeforeScan(
    tx: Prisma.TransactionClient,
    input: {
      parcelId: string;
      actor: UserPrincipal;
      scanId: string;
      scanAction: string;
      before: ParcelBefore;
      reason?: string | null;
    },
  ): Promise<Parcel> {
    const { before } = input;
    await tx.$queryRaw`SELECT "id" FROM "parcels" WHERE "id" = ${input.parcelId}::uuid FOR UPDATE`;
    const current = await tx.parcel.findUniqueOrThrow({ where: { id: input.parcelId } });
    const restored = await tx.parcel.update({
      where: { id: current.id },
      data: {
        status: before.status,
        location: before.location,
        currentLivreurId: before.currentLivreurId,
        plannedLivreurId: before.plannedLivreurId,
        relaunchDate: before.relaunchDate ? new Date(`${before.relaunchDate}T00:00:00.000Z`) : null,
        relaunchSlot: before.relaunchSlot,
        relaunchOrigin: before.relaunchOrigin,
      },
    });
    await tx.parcelEvent.create({
      data: {
        parcelId: current.id,
        type: ParcelEventType.ANNULATION_SCAN,
        previousStatus: current.status,
        newStatus: restored.status,
        previousLocation: current.location,
        newLocation: restored.location,
        actorUserId: input.actor.userId,
        actorRole: input.actor.role,
        scanId: input.scanId,
        reasonText: input.reason ?? null,
        serverTime: this.clock.now(),
        metadata: { scanAnnule: input.scanAction },
      },
    });
    return restored;
  }

  /**
   * Puts a parcel back as it was before a courier's scan (A-11): every column
   * Ramassage, Livré or Échec wrote, from what the scan kept, and one
   * ANNULATION_SCAN event naming the scan. The charges the scan's events
   * created — a delivery fee, the return fee of a third failure — become
   * ANNULEE: a fee is owed only for what really happened (A-1). The caller
   * has checked the window and that nothing happened since.
   */
  async restoreBeforeCourierScan(
    tx: Prisma.TransactionClient,
    input: {
      parcelId: string;
      actor: UserPrincipal;
      scanId: string;
      scanAction: string;
      before: CourierParcelBefore;
      deviceTime: Date;
    },
  ): Promise<Parcel> {
    const { before } = input;
    await tx.$queryRaw`SELECT "id" FROM "parcels" WHERE "id" = ${input.parcelId}::uuid FOR UPDATE`;
    const current = await tx.parcel.findUniqueOrThrow({ where: { id: input.parcelId } });
    const date = (iso: string | null) => (iso ? new Date(iso) : null);
    const restored = await tx.parcel.update({
      where: { id: current.id },
      data: {
        status: before.status,
        location: before.location,
        currentLivreurId: before.currentLivreurId,
        plannedLivreurId: before.plannedLivreurId,
        relaunchDate: before.relaunchDate ? new Date(`${before.relaunchDate}T00:00:00.000Z`) : null,
        relaunchSlot: before.relaunchSlot,
        relaunchOrigin: before.relaunchOrigin,
        cashStatus: before.cashStatus,
        attemptCount: before.attemptCount,
        verifyDeadlineAt: date(before.verifyDeadlineAt),
        lastFailureReason: before.lastFailureReason,
        lastFailureNote: before.lastFailureNote,
        courierRateMillimes:
          before.courierRateMillimes === null ? null : BigInt(before.courierRateMillimes),
        pickedUpAt: date(before.pickedUpAt),
        deliveredAt: date(before.deliveredAt),
        exchangeItemCollected: before.exchangeItemCollected,
        exchangeItemStatus: before.exchangeItemStatus,
      },
    });
    await tx.sellerCharge.updateMany({
      where: { scanId: input.scanId, status: 'EN_ATTENTE' },
      data: { status: 'ANNULEE' },
    });
    await tx.parcelEvent.create({
      data: {
        parcelId: current.id,
        type: ParcelEventType.ANNULATION_SCAN,
        previousStatus: current.status,
        newStatus: restored.status,
        previousLocation: current.location,
        newLocation: restored.location,
        actorUserId: input.actor.userId,
        actorRole: input.actor.role,
        source: 'APP_COURSIER',
        scanId: input.scanId,
        deviceTime: input.deviceTime,
        serverTime: this.clock.now(),
        metadata: { scanAnnule: input.scanAction },
      },
    });
    return restored;
  }

  /**
   * Tournées: the parcel planned for another courier, or back under its
   * zone's livreur with null (D-55). Status and location do not move; the
   * AFFECTATION_LIVREUR event keeps who planned what, and the seller never
   * reads it.
   */
  async recordPlannedLivreur(
    tx: Prisma.TransactionClient,
    input: { parcelId: string; actor: UserPrincipal; plannedLivreurId: string | null },
  ): Promise<Parcel> {
    await tx.$queryRaw`SELECT "id" FROM "parcels" WHERE "id" = ${input.parcelId}::uuid FOR UPDATE`;
    const parcel = await tx.parcel.update({
      where: { id: input.parcelId },
      data: { plannedLivreurId: input.plannedLivreurId },
    });
    await tx.parcelEvent.create({
      data: {
        parcelId: parcel.id,
        type: ParcelEventType.AFFECTATION_LIVREUR,
        previousStatus: parcel.status,
        newStatus: parcel.status,
        previousLocation: parcel.location,
        newLocation: parcel.location,
        actorUserId: input.actor.userId,
        actorRole: input.actor.role,
        serverTime: this.clock.now(),
        metadata: { livreurPrevu: input.plannedLivreurId },
      },
    });
    return parcel;
  }

  /**
   * A seller's change request applied by Faffa Go (D-57): the columns it
   * changes, never the status or the location, and one MODIFICATION_APPLIQUEE
   * event with each field before and after. The caller has locked the parcel.
   */
  async recordAppliedChange(
    tx: Prisma.TransactionClient,
    input: {
      parcelId: string;
      actor: UserPrincipal;
      data: Prisma.ParcelUncheckedUpdateInput;
      metadata: Prisma.InputJsonObject;
    },
  ): Promise<Parcel> {
    const parcel = await tx.parcel.update({ where: { id: input.parcelId }, data: input.data });
    await tx.parcelEvent.create({
      data: {
        parcelId: parcel.id,
        type: ParcelEventType.MODIFICATION_APPLIQUEE,
        previousStatus: parcel.status,
        newStatus: parcel.status,
        previousLocation: parcel.location,
        newLocation: parcel.location,
        actorUserId: input.actor.userId,
        actorRole: input.actor.role,
        serverTime: this.clock.now(),
        metadata: input.metadata,
      },
    });
    return parcel;
  }

  /**
   * Forcer un statut (D-56): the admin's correction of a scanning mistake.
   * The caller has checked the move is one phase 5 allows; no effect runs —
   * no charge, no 48-hour clock, the attempt count unchanged. Put with a
   * livreur, the parcel is his; taken from En livraison, it is nobody's.
   */
  async forceStatus(
    tx: Prisma.TransactionClient,
    input: {
      parcelId: string;
      actor: UserPrincipal;
      target: { status: ParcelStatus; location: ParcelLocation };
      livreurCourierId: string | null;
      reason: string;
    },
  ): Promise<Parcel> {
    await tx.$queryRaw`SELECT "id" FROM "parcels" WHERE "id" = ${input.parcelId}::uuid FOR UPDATE`;
    const current = await tx.parcel.findUniqueOrThrow({ where: { id: input.parcelId } });
    const data: Prisma.ParcelUncheckedUpdateInput = {
      status: input.target.status,
      location: input.target.location,
    };
    if (input.target.location === ParcelLocation.AVEC_LE_LIVREUR) {
      data.currentLivreurId = input.livreurCourierId;
    } else if (current.status === ParcelStatus.EN_LIVRAISON) {
      data.currentLivreurId = null;
    }
    // Out with a livreur: the plan of Tournées has been acted on (D-55).
    if (input.target.status === ParcelStatus.EN_LIVRAISON) data.plannedLivreurId = null;

    const updated = await tx.parcel.update({ where: { id: current.id }, data });
    await tx.parcelEvent.create({
      data: {
        parcelId: current.id,
        type: ParcelEventType.FORCAGE_STATUT,
        previousStatus: current.status,
        newStatus: updated.status,
        previousLocation: current.location,
        newLocation: updated.location,
        actorUserId: input.actor.userId,
        actorRole: input.actor.role,
        reasonText: input.reason,
        serverTime: this.clock.now(),
      },
    });
    return updated;
  }

  /**
   * The cash side of a delivered parcel moving (D-79, D-80): Au dépôt when
   * its courier's caisse is closed, Payé when the seller signs the bon. The
   * status and the place do not move; one event says what happened, and a
   * paid parcel's life ends there (D-24). The caller holds the transaction.
   */
  async recordCashTransition(
    tx: Prisma.TransactionClient,
    input: {
      parcelId: string;
      actor: UserPrincipal;
      transition: CashTransition;
      scanId?: string | null;
      deviceTime?: Date | null;
      metadata?: Prisma.InputJsonObject;
    },
  ): Promise<Parcel> {
    await tx.$queryRaw`SELECT "id" FROM "parcels" WHERE "id" = ${input.parcelId}::uuid FOR UPDATE`;
    const current = await tx.parcel.findUniqueOrThrow({ where: { id: input.parcelId } });
    const cashStatus = applyCashTransition(snapshotOf(current), input.transition);
    if (cashStatus === current.cashStatus) {
      throw new Error(`Transition de caisse impossible : ${input.transition} sur ${current.code}`);
    }
    const now = this.clock.now();
    const paid = cashStatus === ParcelCashStatus.PAYE;
    const updated = await tx.parcel.update({
      where: { id: current.id },
      data: { cashStatus, ...(paid ? { closedAt: now } : {}) },
    });
    await tx.parcelEvent.create({
      data: {
        parcelId: current.id,
        type:
          input.transition === CashTransition.BON_REMIS
            ? ParcelEventType.PAIEMENT_VENDEUR
            : ParcelEventType.ENCAISSEMENT_DEPOT,
        previousStatus: current.status,
        newStatus: current.status,
        previousLocation: current.location,
        newLocation: current.location,
        actorUserId: input.actor.userId,
        actorRole: input.actor.role,
        scanId: input.scanId ?? null,
        deviceTime: input.deviceTime ?? null,
        serverTime: now,
        metadata: input.metadata,
      },
    });
    return updated;
  }

  /**
   * The old item of an échange scanned into its seller's bon de retour
   * (A-10, D-81): the delivered parcel does not move, the event says the
   * item is at the depot. The caller has checked the item is waiting.
   */
  async recordExchangeItemPrepared(
    tx: Prisma.TransactionClient,
    input: { parcelId: string; actor: UserPrincipal; scanId: string; bonNumber: string },
  ): Promise<ParcelEvent> {
    const parcel = await tx.parcel.findUniqueOrThrow({ where: { id: input.parcelId } });
    return tx.parcelEvent.create({
      data: {
        parcelId: parcel.id,
        type: ParcelEventType.ARTICLE_ECHANGE_RECUPERE,
        previousStatus: parcel.status,
        newStatus: parcel.status,
        previousLocation: parcel.location,
        newLocation: parcel.location,
        actorUserId: input.actor.userId,
        actorRole: input.actor.role,
        scanId: input.scanId,
        serverTime: this.clock.now(),
        metadata: { bonRetour: input.bonNumber },
      },
    });
  }

  /**
   * Forcer un statut on a Livré whose cash is still with the courier (D-85):
   * back out with its livreur, the attempt it counted taken back, the
   * delivery fee cancelled (A-1), the frozen rate removed (A-15), the cash
   * and the échange item cleared, and the parcel out of any caisse count.
   * The caller has checked the move and holds the parcel's lock.
   */
  async undoDelivery(
    tx: Prisma.TransactionClient,
    input: { parcelId: string; actor: UserPrincipal; reason: string },
  ): Promise<Parcel> {
    await tx.$queryRaw`SELECT "id" FROM "parcels" WHERE "id" = ${input.parcelId}::uuid FOR UPDATE`;
    const current = await tx.parcel.findUniqueOrThrow({ where: { id: input.parcelId } });
    if (
      current.status !== ParcelStatus.LIVRE ||
      current.cashStatus !== ParcelCashStatus.CHEZ_LE_COURSIER
    ) {
      throw new Error(`Livraison non annulable : ${current.code}`);
    }
    const updated = await tx.parcel.update({
      where: { id: current.id },
      data: {
        status: ParcelStatus.EN_LIVRAISON,
        location: ParcelLocation.AVEC_LE_LIVREUR,
        cashStatus: null,
        courierRateMillimes: null,
        deliveredAt: null,
        attemptCount: Math.max(0, current.attemptCount - 1),
        exchangeItemCollected: false,
        exchangeItemStatus: null,
      },
    });
    await tx.sellerCharge.updateMany({
      where: { parcelId: current.id, type: 'LIVRAISON', status: 'EN_ATTENTE' },
      data: { status: 'ANNULEE' },
    });
    // Counted but not closed: the count no longer matches, the Caisse asks for a recount.
    await tx.caisseSessionParcel.deleteMany({
      where: { parcelId: current.id, caisseSession: { status: { not: 'CLOTUREE' } } },
    });
    await tx.parcelEvent.create({
      data: {
        parcelId: current.id,
        type: ParcelEventType.FORCAGE_STATUT,
        previousStatus: current.status,
        newStatus: updated.status,
        previousLocation: current.location,
        newLocation: updated.location,
        actorUserId: input.actor.userId,
        actorRole: input.actor.role,
        reasonText: input.reason,
        serverTime: this.clock.now(),
        metadata: { livraisonAnnulee: true },
      },
    });
    return updated;
  }

  /** Why, when the type alone does not say: a cancellation after pickup, a planned date (D-9). */
  private metadataOf(
    step: ParcelTransitionEvent,
    parcel: Parcel,
    details?: Prisma.InputJsonObject | null,
  ): Prisma.InputJsonObject | undefined {
    const metadata: Record<string, Prisma.InputJsonValue> = { ...step.metadata };
    for (const [key, value] of Object.entries(details ?? {})) {
      if (value !== undefined && value !== null) metadata[key] = value;
    }
    if (step.effects.includes(ParcelEffect.PLANIFIER_RELANCE) && parcel.relaunchDate) {
      metadata.relaunchDate = documentDateKey(parcel.relaunchDate);
      if (parcel.relaunchSlot) metadata.relaunchSlot = parcel.relaunchSlot;
    }
    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }
}
