import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type Parcel, type Scan } from '@prisma/client';
import {
  COURIER_SCAN_ACTIONS,
  COURIER_SCAN_ACTIONS_BY_ROLE,
  CourierOperationKind,
  PARCEL_ACTION_BY_COURIER_SCAN,
  PARCEL_STATUS_LABELS_FR,
  ParcelStatus,
  Role,
  SCAN_CANCEL_REFUSAL_MESSAGES_FR,
  SCAN_REFUSAL_MESSAGES_FR,
  ScanAction,
  ScanCancelRefusal,
  ScanRefusal,
  ScanSource,
  businessDateOf,
  courierScanCancelRefusal,
  documentDateKey,
  isClockSkewSuspect,
  parcelCodeFromScan,
  type CourierCancelOperation,
  type CourierOperationResult,
  type CourierParcelBefore,
  type CourierScanOperation,
} from '@faffago/shared';
import type { UserPrincipal } from '../auth/principal';
import { CLOCK, type Clock } from '../common/clock';
import { PrismaService } from '../common/prisma/prisma.service';
import { ParcelEventService } from '../parcels/parcel-event.service';
import { SettingsService } from '../settings/settings.service';

/** Int column: a clock off by more than ~24 days is stored as that bound. */
const MAX_SKEW_MS = 2_000_000_000;

const COURIER_ACTIONS: readonly string[] = COURIER_SCAN_ACTIONS;

export interface CourierRequestMeta {
  /** The app's version, from its header: stored on the scan and its events. */
  appVersion: string | null;
}

export function courierSnapshotOf(parcel: Parcel): CourierParcelBefore {
  const iso = (date: Date | null) => (date ? date.toISOString() : null);
  return {
    status: parcel.status,
    location: parcel.location,
    currentLivreurId: parcel.currentLivreurId,
    plannedLivreurId: parcel.plannedLivreurId,
    relaunchDate: parcel.relaunchDate ? documentDateKey(parcel.relaunchDate) : null,
    relaunchSlot: parcel.relaunchSlot,
    relaunchOrigin: parcel.relaunchOrigin,
    cashStatus: parcel.cashStatus,
    attemptCount: parcel.attemptCount,
    verifyDeadlineAt: iso(parcel.verifyDeadlineAt),
    lastFailureReason: parcel.lastFailureReason,
    lastFailureNote: parcel.lastFailureNote,
    courierRateMillimes:
      parcel.courierRateMillimes === null ? null : parcel.courierRateMillimes.toString(),
    pickedUpAt: iso(parcel.pickedUpAt),
    deliveredAt: iso(parcel.deliveredAt),
    exchangeItemCollected: parcel.exchangeItemCollected,
    exchangeItemStatus: parcel.exchangeItemStatus,
  };
}

function isClientScanIdClash(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  return JSON.stringify(target ?? '').includes('clientScanId');
}

function scanResult(
  id: string,
  facts: {
    ok: boolean;
    code: string | null;
    message: string;
    parcel: { code: string; status: ParcelStatus } | null;
    replayed?: boolean;
    kind?: CourierOperationKind;
  },
): CourierOperationResult {
  return {
    kind: facts.kind ?? CourierOperationKind.SCAN,
    id,
    ok: facts.ok,
    replayed: facts.replayed ?? false,
    code: facts.code,
    message: facts.message,
    parcel: facts.parcel,
  };
}

/**
 * The courier app's scans (Coursier 4.4, 4.6, 4.9): Ramassage, Livré, Échec.
 *
 * Every scan is stored, accepted or refused, under the UUID the phone drew:
 * the same UUID again answers the first result and writes nothing
 * (tech-stack 2). The business day and the clock-skew flag come from the
 * phone's clock (A-12); a scan without a GPS fix is still recorded (D-63).
 * The parcel moves only through the parcel event service, in the scan's
 * transaction.
 */
@Injectable()
export class CourierScansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ParcelEventService,
    private readonly settings: SettingsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async scan(
    actor: UserPrincipal,
    op: CourierScanOperation,
    meta: CourierRequestMeta,
  ): Promise<CourierOperationResult> {
    const existing = await this.prisma.scan.findUnique({
      where: { clientScanId: op.clientScanId },
    });
    if (existing) return this.replay(existing, actor, op);
    try {
      return await this.prisma.$transaction((tx) => this.record(tx, actor, op, meta));
    } catch (error) {
      // The same scan sent twice at the same instant: the second one lost the
      // race on the unique UUID and answers with the first one's result.
      if (!isClientScanIdClash(error)) throw error;
      const first = await this.prisma.scan.findUniqueOrThrow({
        where: { clientScanId: op.clientScanId },
      });
      return this.replay(first, actor, op);
    }
  }

  private async record(
    tx: Prisma.TransactionClient,
    actor: UserPrincipal,
    op: CourierScanOperation,
    meta: CourierRequestMeta,
  ): Promise<CourierOperationResult> {
    const now = this.clock.now();
    const { settings } = await this.settings.current(tx);
    const deviceTime = new Date(op.deviceTime);
    const skewMs = Math.max(
      -MAX_SKEW_MS,
      Math.min(MAX_SKEW_MS, deviceTime.getTime() - now.getTime()),
    );
    const scanId = randomUUID();

    // The parcel, locked: two scans of one parcel queue here.
    const code = parcelCodeFromScan(op.rawCode);
    let parcel = code ? await tx.parcel.findUnique({ where: { code } }) : null;
    if (parcel) {
      await tx.$queryRaw`SELECT "id" FROM "parcels" WHERE "id" = ${parcel.id}::uuid FOR UPDATE`;
      parcel = await tx.parcel.findUniqueOrThrow({ where: { id: parcel.id } });
    }
    const before = parcel ? courierSnapshotOf(parcel) : null;

    // A pickup scan names a pickup of his, still open (Coursier 4.6).
    const pickup =
      op.action === ScanAction.RAMASSAGE && op.pickupId
        ? await tx.pickup.findUnique({ where: { id: op.pickupId } })
        : null;
    const pickupIsHis = pickup !== null && pickup.ramasseurId === actor.courierId;

    const base = {
      id: scanId,
      clientScanId: op.clientScanId,
      action: op.action,
      rawCode: op.rawCode,
      actorUserId: actor.userId,
      source: op.source,
      manualEntry: op.source === ScanSource.SAISIE_MANUELLE,
      parcelId: parcel?.id ?? null,
      pickupId: pickupIsHis ? pickup.id : null,
      failureReason: op.action === ScanAction.ECHEC ? (op.failureReason ?? null) : null,
      collectedMillimes:
        op.action === ScanAction.LIVRE && op.collectedMillimes
          ? BigInt(op.collectedMillimes)
          : null,
      gpsLat: op.gps?.lat ?? null,
      gpsLng: op.gps?.lng ?? null,
      gpsAccuracyM: op.gps?.accuracyM ?? null,
      deviceId: op.deviceId ?? null,
      appVersion: meta.appVersion,
      deviceTime,
      receivedAt: now,
      // The business day follows the phone's clock, like the Caisse (A-12).
      businessDate: businessDateOf(deviceTime),
      clockSkewFlagged: isClockSkewSuspect(deviceTime, now, settings.clockSkewFlagMinutes),
      clockSkewMs: skewMs,
      ...(before ? { parcelBefore: before as unknown as Prisma.InputJsonObject } : {}),
    } satisfies Omit<Prisma.ScanUncheckedCreateInput, 'accepted'>;

    const refuse = async (refusal: ScanRefusal): Promise<CourierOperationResult> => {
      await tx.scan.create({ data: { ...base, accepted: false, refusalReason: refusal } });
      return scanResult(op.clientScanId, {
        ok: false,
        code: refusal,
        message: SCAN_REFUSAL_MESSAGES_FR[refusal],
        parcel: parcel ? { code: parcel.code, status: parcel.status } : null,
      });
    };

    const role = actor.role as typeof Role.LIVREUR | typeof Role.RAMASSEUR;
    if (!COURIER_SCAN_ACTIONS_BY_ROLE[role]?.includes(op.action)) {
      return refuse(ScanRefusal.ROLE_NON_AUTORISE);
    }

    if (op.action === ScanAction.RAMASSAGE) {
      if (!pickupIsHis || pickup.status === 'DEMANDE') {
        return refuse(ScanRefusal.RAMASSAGE_INTROUVABLE);
      }
      if (pickup.status !== 'PLANIFIE') return refuse(ScanRefusal.RAMASSAGE_TERMINE);
    }
    if (!parcel) return refuse(ScanRefusal.CODE_INCONNU);

    if (op.action === ScanAction.RAMASSAGE && parcel.sellerId !== pickup!.sellerId) {
      // Extra parcels are welcome, but only the seller's own (D-47).
      return refuse(ScanRefusal.COLIS_AUTRE_VENDEUR);
    }

    const deliverable =
      parcel.status === ParcelStatus.EN_LIVRAISON && parcel.currentLivreurId === actor.courierId;
    if (op.action === ScanAction.LIVRE && deliverable) {
      // The customer pays exactly the COD, confirmed on screen (A-24).
      if (base.collectedMillimes !== parcel.codAmountMillimes) {
        return refuse(ScanRefusal.MONTANT_DIFFERENT);
      }
      if (parcel.isExchange && op.exchangeItemCollected !== true) {
        return refuse(ScanRefusal.ECHANGE_NON_CONFIRME);
      }
    }

    await tx.scan.create({ data: { ...base, accepted: true } });
    const outcome = await this.events.apply(tx, {
      parcelId: parcel.id,
      actor,
      request: {
        action: PARCEL_ACTION_BY_COURIER_SCAN[op.action],
        failureReason: op.action === ScanAction.ECHEC ? (op.failureReason ?? undefined) : undefined,
        postponedTo: op.postponedTo ? new Date(`${op.postponedTo}T00:00:00.000Z`) : null,
        relaunchSlot: op.relaunchSlot ?? null,
      },
      context: {
        source: op.source,
        scanId,
        gps: op.gps ?? null,
        deviceId: op.deviceId ?? null,
        appVersion: meta.appVersion,
        deviceTime,
        note: op.action === ScanAction.ECHEC ? op.note : null,
      },
    });
    if (!outcome.ok) {
      await tx.scan.update({
        where: { id: scanId },
        data: { accepted: false, refusalReason: outcome.refusal },
      });
      return scanResult(op.clientScanId, {
        ok: false,
        code: outcome.refusal,
        message: outcome.message,
        parcel: { code: parcel.code, status: parcel.status },
      });
    }

    if (op.action === ScanAction.RAMASSAGE) {
      await tx.pickupParcel.upsert({
        where: { pickupId_parcelId: { pickupId: pickup!.id, parcelId: parcel.id } },
        // Not announced by the seller: an extra parcel, counted like the others (D-47).
        create: {
          pickupId: pickup!.id,
          parcelId: parcel.id,
          expected: false,
          scannedAt: now,
          scanId,
        },
        update: { scannedAt: now, scanId },
      });
      await this.recountPickup(tx, pickup!.id);
    }

    return scanResult(op.clientScanId, {
      ok: true,
      code: null,
      message: PARCEL_STATUS_LABELS_FR[outcome.parcel.status],
      parcel: { code: parcel.code, status: outcome.parcel.status },
    });
  }

  /**
   * The first result of a scan sent again. The same UUID for another parcel,
   * action or person is refused and changes nothing (D-53).
   */
  private async replay(
    row: Scan,
    actor: UserPrincipal,
    op: CourierScanOperation,
  ): Promise<CourierOperationResult> {
    if (
      row.actorUserId !== actor.userId ||
      row.action !== op.action ||
      row.rawCode !== op.rawCode
    ) {
      return scanResult(op.clientScanId, {
        ok: false,
        code: ScanRefusal.SCAN_ID_REUTILISE,
        message: SCAN_REFUSAL_MESSAGES_FR[ScanRefusal.SCAN_ID_REUTILISE],
        parcel: null,
      });
    }
    const parcel = row.parcelId
      ? await this.prisma.parcel.findUniqueOrThrow({ where: { id: row.parcelId } })
      : null;
    const event = row.accepted
      ? await this.prisma.parcelEvent.findFirst({
          where: { scanId: row.id, type: { not: 'ANNULATION_SCAN' } },
          orderBy: { sequence: 'desc' },
        })
      : null;
    // The parcel as the scan left it, not as it is now.
    const status = event?.newStatus ?? parcel?.status ?? null;
    return scanResult(op.clientScanId, {
      ok: row.accepted,
      code: row.accepted ? null : row.refusalReason,
      message: row.accepted
        ? PARCEL_STATUS_LABELS_FR[status!]
        : SCAN_REFUSAL_MESSAGES_FR[row.refusalReason as ScanRefusal],
      parcel: parcel && status ? { code: parcel.code, status } : null,
      replayed: true,
    });
  }

  /**
   * Annuler le dernier scan (A-11): the courier's own last accepted scan,
   * within the window measured on the phone's clock — the scan and the
   * cancellation may both have been made offline — while nothing else has
   * happened to the parcel. Asked again, it answers the same.
   */
  async cancel(actor: UserPrincipal, op: CourierCancelOperation): Promise<CourierOperationResult> {
    const refused = (
      refusal: ScanCancelRefusal,
      parcel: { code: string; status: ParcelStatus } | null,
    ) =>
      scanResult(op.clientScanId, {
        kind: CourierOperationKind.ANNULATION,
        ok: false,
        code: refusal,
        message: SCAN_CANCEL_REFUSAL_MESSAGES_FR[refusal],
        parcel,
      });

    return this.prisma.$transaction(async (tx) => {
      const found = await tx.scan.findUnique({ where: { clientScanId: op.clientScanId } });
      if (!found || !COURIER_ACTIONS.includes(found.action)) {
        return refused(ScanCancelRefusal.SCAN_INTROUVABLE, null);
      }
      // Two cancellations of one scan queue on the parcel, then read it again.
      if (found.parcelId) {
        await tx.$queryRaw`SELECT "id" FROM "parcels" WHERE "id" = ${found.parcelId}::uuid FOR UPDATE`;
      }
      const scan = await tx.scan.findUniqueOrThrow({ where: { id: found.id } });
      const parcel = scan.parcelId
        ? await tx.parcel.findUniqueOrThrow({ where: { id: scan.parcelId } })
        : null;
      const parcelView = parcel ? { code: parcel.code, status: parcel.status } : null;

      if (scan.cancelledAt && scan.cancelledByUserId === actor.userId) {
        return scanResult(op.clientScanId, {
          kind: CourierOperationKind.ANNULATION,
          ok: true,
          code: null,
          message: 'Scan annulé',
          parcel: parcelView,
          replayed: true,
        });
      }

      const { settings } = await this.settings.current(tx);
      let isLatestOfActor = false;
      let parcelUnchangedSince = false;
      let chargesStillWaiting = true;
      let pickupFinished = false;
      if (scan.accepted && scan.parcelId && !scan.cancelledAt) {
        // His accepted courier scans not cancelled, from this one on; the
        // latest is the one whose event came last.
        const candidates = await tx.scan.findMany({
          where: {
            actorUserId: scan.actorUserId,
            accepted: true,
            cancelledAt: null,
            action: { in: [...COURIER_SCAN_ACTIONS] },
            receivedAt: { gte: scan.receivedAt },
          },
          select: { id: true },
        });
        const latestOfActor = await tx.parcelEvent.findFirst({
          where: { scanId: { in: candidates.map((c) => c.id) } },
          orderBy: { sequence: 'desc' },
        });
        isLatestOfActor = latestOfActor?.scanId === scan.id;
        const latestOfParcel = await tx.parcelEvent.findFirst({
          where: { parcelId: scan.parcelId },
          orderBy: { sequence: 'desc' },
        });
        parcelUnchangedSince = latestOfParcel?.scanId === scan.id;
        chargesStillWaiting =
          (await tx.sellerCharge.count({
            where: { scanId: scan.id, status: { not: 'EN_ATTENTE' } },
          })) === 0;
        if (scan.action === ScanAction.RAMASSAGE && scan.pickupId) {
          const pickup = await tx.pickup.findUniqueOrThrow({ where: { id: scan.pickupId } });
          pickupFinished = pickup.status !== 'PLANIFIE';
        }
      }

      const refusal = courierScanCancelRefusal({
        accepted: scan.accepted,
        alreadyCancelled: scan.cancelledAt !== null,
        byActor: scan.actorUserId === actor.userId,
        isLatestOfActor,
        scanDeviceTime: scan.deviceTime,
        cancelDeviceTime: new Date(op.deviceTime),
        windowSeconds: settings.scanCancelWindowSeconds,
        parcelUnchangedSince,
        chargesStillWaiting,
        pickupFinished,
      });
      if (refusal) return refused(refusal, parcelView);

      const restored = await this.events.restoreBeforeCourierScan(tx, {
        parcelId: scan.parcelId!,
        actor,
        scanId: scan.id,
        scanAction: scan.action,
        before: scan.parcelBefore as unknown as CourierParcelBefore,
        deviceTime: new Date(op.deviceTime),
      });
      await tx.scan.update({
        where: { id: scan.id },
        data: { cancelledAt: this.clock.now(), cancelledByUserId: actor.userId },
      });

      if (scan.action === ScanAction.RAMASSAGE && scan.pickupId) {
        const link = await tx.pickupParcel.findUnique({
          where: { pickupId_parcelId: { pickupId: scan.pickupId, parcelId: scan.parcelId! } },
        });
        if (link?.expected) {
          await tx.pickupParcel.update({
            where: { pickupId_parcelId: { pickupId: scan.pickupId, parcelId: scan.parcelId! } },
            data: { scannedAt: null, scanId: null },
          });
        } else if (link) {
          // An extra parcel scanned by mistake was never part of the pickup.
          await tx.pickupParcel.delete({
            where: { pickupId_parcelId: { pickupId: scan.pickupId, parcelId: scan.parcelId! } },
          });
        }
        await this.recountPickup(tx, scan.pickupId);
      }

      return scanResult(op.clientScanId, {
        kind: CourierOperationKind.ANNULATION,
        ok: true,
        code: null,
        message: 'Scan annulé',
        parcel: { code: restored.code, status: restored.status },
      });
    });
  }

  /** The parcels scanned at a pickup, as the pickup screens count them. */
  private async recountPickup(tx: Prisma.TransactionClient, pickupId: string): Promise<void> {
    const scannedCount = await tx.pickupParcel.count({
      where: { pickupId, scannedAt: { not: null } },
    });
    await tx.pickup.update({ where: { id: pickupId }, data: { scannedCount } });
  }
}
