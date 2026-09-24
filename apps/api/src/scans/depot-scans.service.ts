import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type Parcel, type Scan } from '@prisma/client';
import {
  DEPOT_SCAN_MODES,
  PARCEL_ACTION_BY_DEPOT_MODE,
  SCAN_CANCEL_REFUSAL_MESSAGES_FR,
  ScanCancelRefusal,
  depotScanCancelRefusal,
  PARCEL_LOCATION_LABELS_FR,
  PARCEL_STATUS_LABELS_FR,
  ParcelLocation,
  SCAN_REFUSAL_MESSAGES_FR,
  ScanAction,
  ScanRefusal,
  ScanSource,
  businessDateOf,
  depotModeNeedsCourier,
  documentDateKey,
  isClockSkewSuspect,
  parcelCodeFromScan,
  tunisDayKey,
  type DepotScanMode,
  type DepotScanValues,
  type ParcelBefore,
  type ParcelStatus,
} from '@faffago/shared';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { UserPrincipal } from '../auth/principal';
import type { RequestMeta } from '../auth/sessions.service';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { ParcelEventService } from '../parcels/parcel-event.service';
import { SettingsService } from '../settings/settings.service';
import { ZoneCoverageService, dateColumnOf } from '../zones/zone-coverage.service';

interface CourierRef {
  id: string;
  firstName: string;
  lastName: string;
}

/** What the station shows, full screen, after each scan (Admin 4.2). */
export interface DepotScanResult {
  scanId: string | null;
  clientScanId: string;
  mode: DepotScanMode;
  accepted: boolean;
  /** True when the same scan came before: this is its first result. */
  replayed: boolean;
  refusal: ScanRefusal | null;
  message: string;
  manualEntry: boolean;
  clockSkewFlagged: boolean;
  parcel: {
    code: string;
    status: ParcelStatus;
    location: ParcelLocation;
    shopName: string;
    delegationNameFr: string;
  } | null;
  /** The courier chosen on the station, by account id. */
  courier: CourierRef | null;
  /** Sortie coursier to someone else than the livreur planned: who was (D-53). */
  plannedFor: CourierRef | null;
  /**
   * Until when "Annuler le dernier scan" is possible, on the server clock
   * (D-54); null for a refused or already cancelled scan. The server still
   * enforces it.
   */
  cancellableUntil: string | null;
  /** The label must be reprinted before the parcel goes further (D-53, D-57). */
  labelReprintNeeded: boolean;
  /** The server clock when answering, so the page counts down without trusting its own. */
  serverTime: string;
}

/** What the station shows after "Annuler le dernier scan" (D-54). */
export interface ScanCancelResult {
  scanId: string;
  cancelled: true;
  message: string;
  parcel: { code: string; status: ParcelStatus; location: ParcelLocation };
}

function cancelRefused(refusal: ScanCancelRefusal) {
  return apiError(
    refusal === ScanCancelRefusal.SCAN_INTROUVABLE ? 404 : 409,
    refusal,
    SCAN_CANCEL_REFUSAL_MESSAGES_FR[refusal],
  );
}

const DEPOT_ACTIONS: readonly string[] = DEPOT_SCAN_MODES;

export interface DepotScanOutcome {
  /** 201 for a new scan; 200 for one sent before, or an identifier reused. */
  created: boolean;
  result: DepotScanResult;
}

/** The courier id planned for a parcel, written on the Sortie coursier event (D-53). */
const PLANNED_FOR_KEY = 'prevuPour';

/** Int column: a clock off by more than ~24 days is stored as that bound. */
const MAX_SKEW_MS = 2_000_000_000;

function snapshotOf(parcel: Parcel): ParcelBefore {
  return {
    status: parcel.status,
    location: parcel.location,
    currentLivreurId: parcel.currentLivreurId,
    plannedLivreurId: parcel.plannedLivreurId,
    relaunchDate: parcel.relaunchDate ? documentDateKey(parcel.relaunchDate) : null,
    relaunchSlot: parcel.relaunchSlot,
    relaunchOrigin: parcel.relaunchOrigin,
  };
}

function successMessage(status: ParcelStatus, location: ParcelLocation): string {
  return `${PARCEL_STATUS_LABELS_FR[status]} · ${PARCEL_LOCATION_LABELS_FR[location]}`;
}

function isClientScanIdClash(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const target = (error.meta as { target?: unknown } | undefined)?.target;
  return JSON.stringify(target ?? '').includes('clientScanId');
}

/**
 * The depot's scan station (Admin 4.2, D-50, D-53): Entrée dépôt, Sortie
 * coursier, Retour de tournée.
 *
 * Every scan is stored, accepted or refused, under the UUID the browser drew
 * for it; the same UUID again returns the first result and writes nothing
 * (tech-stack 2). The parcel is locked, checked against the chosen courier,
 * then moved by the parcel event service, the only code that moves a parcel,
 * in the same transaction as the scan row.
 */
@Injectable()
export class DepotScansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ParcelEventService,
    private readonly settings: SettingsService,
    private readonly coverage: ZoneCoverageService,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async scan(actor: UserPrincipal, input: DepotScanValues): Promise<DepotScanOutcome> {
    const existing = await this.prisma.scan.findUnique({
      where: { clientScanId: input.clientScanId },
    });
    if (existing) return this.replay(existing, actor, input);
    try {
      const result = await this.prisma.$transaction((tx) => this.record(tx, actor, input));
      return { created: true, result };
    } catch (error) {
      // The same scan sent twice at the same instant: the second one lost the
      // race on the unique UUID and answers with the first one's result.
      if (!isClientScanIdClash(error)) throw error;
      const first = await this.prisma.scan.findUniqueOrThrow({
        where: { clientScanId: input.clientScanId },
      });
      return this.replay(first, actor, input);
    }
  }

  private async record(
    tx: Prisma.TransactionClient,
    actor: UserPrincipal,
    input: DepotScanValues,
  ): Promise<DepotScanResult> {
    const now = this.clock.now();
    const { settings } = await this.settings.current(tx);
    const deviceTime = new Date(input.deviceTime);
    const skewMs = Math.max(
      -MAX_SKEW_MS,
      Math.min(MAX_SKEW_MS, deviceTime.getTime() - now.getTime()),
    );
    const scanId = randomUUID();
    const base = {
      id: scanId,
      clientScanId: input.clientScanId,
      action: input.mode,
      rawCode: input.rawCode,
      actorUserId: actor.userId,
      source: input.source,
      manualEntry: input.source === ScanSource.SAISIE_MANUELLE,
      deviceTime,
      receivedAt: now,
      // The business day follows the device clock, like the Caisse (A-12).
      businessDate: businessDateOf(deviceTime),
      clockSkewFlagged: isClockSkewSuspect(deviceTime, now, settings.clockSkewFlagMinutes),
      clockSkewMs: skewMs,
    } satisfies Omit<Prisma.ScanUncheckedCreateInput, 'accepted'>;

    // The parcel, locked: two scans of one parcel queue here.
    const code = parcelCodeFromScan(input.rawCode);
    let parcel = code ? await tx.parcel.findUnique({ where: { code } }) : null;
    if (parcel) {
      await tx.$queryRaw`SELECT "id" FROM "parcels" WHERE "id" = ${parcel.id}::uuid FOR UPDATE`;
      parcel = await tx.parcel.findUniqueOrThrow({ where: { id: parcel.id } });
    }
    const before = parcel ? snapshotOf(parcel) : null;

    const courier = input.courierId
      ? await tx.user.findUnique({
          where: { id: input.courierId },
          include: {
            courier: {
              include: { absences: { where: { date: dateColumnOf(tunisDayKey(now)) } } },
            },
          },
        })
      : null;
    const courierRef = courier?.courier
      ? { id: courier.id, firstName: courier.firstName, lastName: courier.lastName }
      : null;

    const refuse = async (refusal: ScanRefusal): Promise<DepotScanResult> => {
      await tx.scan.create({
        data: {
          ...base,
          parcelId: parcel?.id ?? null,
          targetCourierId: courier?.courier?.id ?? null,
          accepted: false,
          refusalReason: refusal,
          ...(before ? { parcelBefore: before as unknown as Prisma.InputJsonObject } : {}),
        },
      });
      return this.resultOf(tx, input, { scanId, refusal, parcel, before, courier: courierRef });
    };

    // The courier is chosen first on Sortie coursier and Retour de tournée (D-53).
    if (depotModeNeedsCourier(input.mode)) {
      const isLivreur = courier?.role === 'LIVREUR' && courier.courier;
      if (input.mode === ScanAction.SORTIE_COURSIER) {
        if (!input.courierId) return refuse(ScanRefusal.COURSIER_NON_PRECISE);
        const canWork =
          isLivreur &&
          courier.isActive &&
          courier.acceptsWork &&
          courier.courier!.accountState === 'ACTIF' &&
          courier.courier!.absences.length === 0;
        if (!canWork) return refuse(ScanRefusal.COURSIER_INDISPONIBLE);
      } else if (!isLivreur) {
        // Retour de tournée takes back from anyone who was a livreur, even one
        // who no longer takes work: what he carries must still come back.
        return refuse(ScanRefusal.COURSIER_NON_PRECISE);
      }
    }
    if (!parcel) return refuse(ScanRefusal.CODE_INCONNU);

    const courierId = courier?.courier?.id ?? null;
    if (
      input.mode === ScanAction.RETOUR_DE_TOURNEE &&
      parcel.location === ParcelLocation.AVEC_LE_LIVREUR &&
      parcel.currentLivreurId !== courierId
    ) {
      return refuse(ScanRefusal.COLIS_AUTRE_COURSIER);
    }

    // Who Tournées planned: a manual move, else the zone's livreur today (D-55).
    let plannedFor: string | null = null;
    if (input.mode === ScanAction.SORTIE_COURSIER) {
      let planned = parcel.plannedLivreurId;
      if (!planned) {
        const delegation = await tx.delegation.findUniqueOrThrow({
          where: { id: parcel.delegationId },
        });
        if (delegation.zoneId) {
          const coverage = await this.coverage.forDay(tx, tunisDayKey(now));
          planned = coverage.get(delegation.zoneId)?.LIVREUR.courierId ?? null;
        }
      }
      if (planned && planned !== courierId) plannedFor = planned;
    }

    await tx.scan.create({
      data: {
        ...base,
        parcelId: parcel.id,
        targetCourierId: courierId,
        accepted: true,
        parcelBefore: before as unknown as Prisma.InputJsonObject,
      },
    });
    const outcome = await this.events.apply(tx, {
      parcelId: parcel.id,
      actor,
      request: {
        action: PARCEL_ACTION_BY_DEPOT_MODE[input.mode],
        assignToCourierId: input.mode === ScanAction.SORTIE_COURSIER ? courierId : null,
      },
      context: {
        source: input.source,
        scanId,
        deviceTime,
        details: plannedFor ? { [PLANNED_FOR_KEY]: plannedFor } : null,
      },
    });
    if (!outcome.ok) {
      await tx.scan.update({
        where: { id: scanId },
        data: { accepted: false, refusalReason: outcome.refusal },
      });
      return this.resultOf(tx, input, {
        scanId,
        refusal: outcome.refusal,
        parcel,
        before,
        courier: courierRef,
      });
    }

    // The plan has been acted on: the parcel is out (D-55).
    let moved = outcome.parcel;
    if (input.mode === ScanAction.SORTIE_COURSIER && moved.plannedLivreurId) {
      moved = await tx.parcel.update({
        where: { id: moved.id },
        data: { plannedLivreurId: null },
      });
    }
    return this.resultOf(tx, input, {
      scanId,
      refusal: null,
      parcel: moved,
      before,
      courier: courierRef,
      plannedForCourierId: plannedFor,
    });
  }

  /**
   * Annuler le dernier scan (A-11, D-54): the scanner's own last accepted
   * scan, within the window of Paramètres on the server clock, while nothing
   * else has happened to the parcel. Asked again, it answers the same.
   */
  async cancel(actor: UserPrincipal, scanId: string): Promise<ScanCancelResult> {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.scan.findUnique({ where: { id: scanId } });
      if (!found || !DEPOT_ACTIONS.includes(found.action)) {
        throw cancelRefused(ScanCancelRefusal.SCAN_INTROUVABLE);
      }
      // Two cancellations of one scan queue on the parcel, then read the scan again.
      if (found.parcelId) {
        await tx.$queryRaw`SELECT "id" FROM "parcels" WHERE "id" = ${found.parcelId}::uuid FOR UPDATE`;
      }
      const scan = await tx.scan.findUniqueOrThrow({ where: { id: scanId } });
      if (scan.cancelledAt && scan.cancelledByUserId === actor.userId) {
        return this.cancelResultOf(tx, scan.id);
      }

      const { settings } = await this.settings.current(tx);
      const now = this.clock.now();
      let isLatestOfActor = false;
      let parcelUnchangedSince = false;
      if (scan.accepted && scan.parcelId && !scan.cancelledAt) {
        // His accepted scans not cancelled, from this one on; the latest is
        // the one whose event came last.
        const candidates = await tx.scan.findMany({
          where: {
            actorUserId: scan.actorUserId,
            accepted: true,
            cancelledAt: null,
            action: { in: [...DEPOT_SCAN_MODES] },
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
      }

      const refusal = depotScanCancelRefusal({
        accepted: scan.accepted && !scan.cancelledAt,
        byActor: scan.actorUserId === actor.userId,
        isLatestOfActor,
        receivedAt: scan.receivedAt,
        now,
        windowSeconds: settings.scanCancelWindowSeconds,
        parcelUnchangedSince,
      });
      if (refusal) throw cancelRefused(refusal);

      await this.events.restoreBeforeScan(tx, {
        parcelId: scan.parcelId!,
        actor,
        scanId: scan.id,
        scanAction: scan.action,
        before: scan.parcelBefore as unknown as ParcelBefore,
      });
      await tx.scan.update({
        where: { id: scan.id },
        data: { cancelledAt: now, cancelledByUserId: actor.userId },
      });
      return this.cancelResultOf(tx, scan.id);
    });
  }

  /**
   * Cancelling a depot scan after its window (A-11, D-56): the admin's, any
   * scanner's scan, with a reason, audited; still only while the scan's event
   * is the parcel's last. Beyond that, Forcer un statut.
   */
  async cancelByAdmin(
    actor: UserPrincipal,
    scanId: string,
    reason: string,
    meta: RequestMeta,
  ): Promise<ScanCancelResult> {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.scan.findUnique({ where: { id: scanId } });
      if (!found || !DEPOT_ACTIONS.includes(found.action)) {
        throw cancelRefused(ScanCancelRefusal.SCAN_INTROUVABLE);
      }
      if (found.parcelId) {
        await tx.$queryRaw`SELECT "id" FROM "parcels" WHERE "id" = ${found.parcelId}::uuid FOR UPDATE`;
      }
      const scan = await tx.scan.findUniqueOrThrow({ where: { id: scanId } });
      if (scan.cancelledAt) return this.cancelResultOf(tx, scan.id);
      if (!scan.accepted || !scan.parcelId) {
        throw cancelRefused(ScanCancelRefusal.ANNULATION_SCAN_REFUSE);
      }
      const last = await tx.parcelEvent.findFirst({
        where: { parcelId: scan.parcelId },
        orderBy: { sequence: 'desc' },
      });
      if (last?.scanId !== scan.id) throw cancelRefused(ScanCancelRefusal.ANNULATION_COLIS_MODIFIE);

      const before = await tx.parcel.findUniqueOrThrow({ where: { id: scan.parcelId } });
      const restored = await this.events.restoreBeforeScan(tx, {
        parcelId: scan.parcelId,
        actor,
        scanId: scan.id,
        scanAction: scan.action,
        before: scan.parcelBefore as unknown as ParcelBefore,
        reason,
      });
      await tx.scan.update({
        where: { id: scan.id },
        data: {
          cancelledAt: this.clock.now(),
          cancelledByUserId: actor.userId,
          cancelReason: reason,
        },
      });
      await this.audit.record(tx, {
        actor: { userId: actor.userId, role: actor.role },
        action: AuditAction.ANNULATION_SCAN_ADMIN,
        entityType: 'scan',
        entityId: scan.id,
        before: { status: before.status, location: before.location },
        after: { status: restored.status, location: restored.location },
        reason,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return this.cancelResultOf(tx, scan.id);
    });
  }

  /** From the ANNULATION_SCAN event, so asking again answers the same. */
  private async cancelResultOf(
    tx: Prisma.TransactionClient,
    scanId: string,
  ): Promise<ScanCancelResult> {
    const event = await tx.parcelEvent.findFirstOrThrow({
      where: { scanId, type: 'ANNULATION_SCAN' },
      include: { parcel: { select: { code: true } } },
    });
    const status = event.newStatus!;
    const location = event.newLocation!;
    return {
      scanId,
      cancelled: true,
      message: `Scan annulé · ${successMessage(status, location)}`,
      parcel: { code: event.parcel.code, status, location },
    };
  }

  /**
   * The first result of a scan sent again. The same UUID for another parcel,
   * mode or person is refused and changes nothing (D-53).
   */
  private async replay(
    row: Scan,
    actor: UserPrincipal,
    input: DepotScanValues,
  ): Promise<DepotScanOutcome> {
    if (
      row.actorUserId !== actor.userId ||
      row.action !== input.mode ||
      row.rawCode !== input.rawCode
    ) {
      return {
        created: false,
        result: {
          scanId: null,
          clientScanId: input.clientScanId,
          mode: input.mode,
          accepted: false,
          replayed: false,
          refusal: ScanRefusal.SCAN_ID_REUTILISE,
          message: SCAN_REFUSAL_MESSAGES_FR[ScanRefusal.SCAN_ID_REUTILISE],
          manualEntry: input.source === ScanSource.SAISIE_MANUELLE,
          clockSkewFlagged: false,
          parcel: null,
          courier: null,
          plannedFor: null,
          cancellableUntil: null,
          serverTime: this.clock.now().toISOString(),
          labelReprintNeeded: false,
        },
      };
    }

    const parcel = row.parcelId
      ? await this.prisma.parcel.findUniqueOrThrow({ where: { id: row.parcelId } })
      : null;
    const before = row.parcelBefore as unknown as ParcelBefore | null;
    const event = row.accepted
      ? await this.prisma.parcelEvent.findFirst({
          where: { scanId: row.id },
          orderBy: { sequence: 'asc' },
        })
      : null;
    const courier = row.targetCourierId
      ? await this.prisma.user.findFirst({
          where: { courier: { id: row.targetCourierId } },
          select: { id: true, firstName: true, lastName: true },
        })
      : null;
    const plannedFor = (event?.metadata as Record<string, unknown> | null)?.[PLANNED_FOR_KEY];

    const result = await this.resultOf(this.prisma, input, {
      scanId: row.id,
      refusal: row.accepted ? null : (row.refusalReason as ScanRefusal),
      // The parcel as the scan left it, not as it is now.
      parcel:
        parcel && event?.newStatus && event.newLocation
          ? { ...parcel, status: event.newStatus, location: event.newLocation }
          : parcel,
      before,
      courier,
      plannedForCourierId: typeof plannedFor === 'string' ? plannedFor : null,
    });
    return { created: false, result: { ...result, replayed: true } };
  }

  private async resultOf(
    db: Prisma.TransactionClient,
    input: DepotScanValues,
    facts: {
      scanId: string;
      refusal: ScanRefusal | null;
      parcel: Parcel | null;
      before: ParcelBefore | null;
      courier: CourierRef | null;
      plannedForCourierId?: string | null;
    },
  ): Promise<DepotScanResult> {
    const row = await db.scan.findUniqueOrThrow({ where: { id: facts.scanId } });
    const accepted = facts.refusal === null;
    const { settings } = await this.settings.current(db);

    let parcelView: DepotScanResult['parcel'] = null;
    let labelReprintNeeded = false;
    if (facts.parcel) {
      const extra = await db.parcel.findUniqueOrThrow({
        where: { id: facts.parcel.id },
        select: {
          labelReprintNeeded: true,
          seller: { select: { shopName: true } },
          delegation: { select: { nameFr: true } },
        },
      });
      labelReprintNeeded = extra.labelReprintNeeded;
      // A refused scan shows the parcel as it was when refused.
      const state = accepted ? facts.parcel : (facts.before ?? facts.parcel);
      parcelView = {
        code: facts.parcel.code,
        status: state.status,
        location: state.location,
        shopName: extra.seller.shopName,
        delegationNameFr: extra.delegation.nameFr,
      };
    }

    const plannedFor = facts.plannedForCourierId
      ? await db.user.findFirst({
          where: { courier: { id: facts.plannedForCourierId } },
          select: { id: true, firstName: true, lastName: true },
        })
      : null;

    return {
      scanId: facts.scanId,
      clientScanId: input.clientScanId,
      mode: input.mode,
      accepted,
      replayed: false,
      refusal: facts.refusal,
      message:
        accepted && parcelView
          ? successMessage(parcelView.status, parcelView.location)
          : SCAN_REFUSAL_MESSAGES_FR[facts.refusal ?? ScanRefusal.CODE_INCONNU],
      manualEntry: row.manualEntry,
      clockSkewFlagged: row.clockSkewFlagged,
      parcel: parcelView,
      courier: facts.courier,
      plannedFor,
      cancellableUntil:
        accepted && !row.cancelledAt
          ? new Date(
              row.receivedAt.getTime() + settings.scanCancelWindowSeconds * 1000,
            ).toISOString()
          : null,
      serverTime: this.clock.now().toISOString(),
      labelReprintNeeded,
    };
  }
}
