import { Inject, Injectable } from '@nestjs/common';
import type { Parcel, ParcelEvent, Prisma, ScanSource, SellerCharge } from '@prisma/client';
import {
  applyParcelAction,
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
  type FailureReason,
  type ParcelAction,
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
