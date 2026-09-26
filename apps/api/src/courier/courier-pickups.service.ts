import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  CourierOperationKind,
  PickupStatus,
  Role,
  SCAN_REFUSAL_MESSAGES_FR,
  ScanRefusal,
  computePickupFee,
  documentDateKey,
  formatDT,
  tunisDayKey,
  tunisDayStart,
  type CourierFinishPickupOperation,
  type CourierOperationResult,
} from '@faffago/shared';
import type { UserPrincipal } from '../auth/principal';
import { CLOCK, type Clock } from '../common/clock';
import { PrismaService } from '../common/prisma/prisma.service';
import { BonHandoverService, type SellerAEmporter } from '../money/bon-handover.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { dateColumnOf } from '../zones/zone-coverage.service';
import { applyOnce, type OperationAnswer } from './courier-operations';

const refusal = (code: ScanRefusal): OperationAnswer => ({
  ok: false,
  code,
  message: SCAN_REFUSAL_MESSAGES_FR[code],
});

/** One pickup on the ramasseur's day (Coursier 4.6). */
export interface CourierPickupView {
  id: string;
  status: string;
  plannedDate: string | null;
  plannedSlot: string | null;
  shopName: string;
  /** The seller's contact: the only person who receives cash and returns (Coursier 4.6). */
  contactName: string;
  sellerPhone: string;
  address: string;
  landmark: string | null;
  localiteNameFr: string;
  localiteNameAr: string | null;
  delegationNameFr: string;
  delegationNameAr: string;
  note: string | null;
  declaredCount: number | null;
  scannedCount: number;
  /** Expected (announced by the seller) and scanned; missing ones stay listed. */
  parcels: { code: string; status: string; expected: boolean; scanned: boolean }[];
  /** The bons he takes to this seller (D-84). */
  aEmporter: SellerAEmporter;
}

/** A visit with nothing to pick up: only bons to hand over (answer 4, D-84). */
export interface CourierBonVisitView {
  sellerId: string;
  shopName: string;
  contactName: string;
  sellerPhone: string;
  address: string | null;
  landmark: string | null;
  localiteNameFr: string | null;
  localiteNameAr: string | null;
  delegationNameFr: string | null;
  delegationNameAr: string | null;
  aEmporter: SellerAEmporter;
}

const NOTHING: SellerAEmporter = { bonsVersement: [], bonsRetour: [] };

/**
 * The ramasseur's pickups (Coursier 4.6): his day, and Terminer le ramassage,
 * which closes the visit and charges the pickup fee — 2,000 DT below 5
 * parcels scanned, free from 5, nothing at all when none was scanned (A-13).
 * The bon de versement and Retours steps come with phase 8 (D-61).
 */
@Injectable()
export class CourierPickupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly handover: BonHandoverService,
    private readonly notifications: NotificationsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Planned for him today or earlier and still open, then those he closed
   * today; and the sellers he visits only to hand over bons (D-84).
   */
  async day(actor: UserPrincipal): Promise<{
    open: CourierPickupView[];
    done: CourierPickupView[];
    visits: CourierBonVisitView[];
  }> {
    const now = this.clock.now();
    const todayKey = tunisDayKey(now);
    const include = {
      seller: { select: { shopName: true, contactFullName: true, contactPhone: true } },
      pickupAddress: {
        include: {
          localite: { select: { nameFr: true, nameAr: true } },
          delegation: { select: { nameFr: true, nameAr: true } },
        },
      },
      parcels: { include: { parcel: { select: { code: true, status: true } } } },
    } satisfies Prisma.PickupInclude;
    const [open, done] = await Promise.all([
      this.prisma.pickup.findMany({
        where: {
          ramasseurId: actor.courierId ?? undefined,
          status: PickupStatus.PLANIFIE,
          plannedDate: { lte: dateColumnOf(todayKey) },
        },
        orderBy: [{ plannedDate: 'asc' }, { plannedSlot: 'asc' }, { createdAt: 'asc' }],
        include,
      }),
      this.prisma.pickup.findMany({
        where: {
          ramasseurId: actor.courierId ?? undefined,
          status: { in: [PickupStatus.EFFECTUE, PickupStatus.ANNULE] },
          OR: [
            { completedAt: { gte: tunisDayStart(todayKey) } },
            { cancelledAt: { gte: tunisDayStart(todayKey) }, cancelledByUserId: actor.userId },
          ],
        },
        orderBy: { updatedAt: 'asc' },
        include,
      }),
    ]);
    const bons = await this.handover.aEmporter(actor.courierId ?? '', todayKey);
    type Row = (typeof open)[number];
    const view = (p: Row): CourierPickupView => ({
      id: p.id,
      status: p.status,
      plannedDate: p.plannedDate ? documentDateKey(p.plannedDate) : null,
      plannedSlot: p.plannedSlot,
      shopName: p.seller.shopName,
      contactName: p.seller.contactFullName,
      sellerPhone: p.seller.contactPhone,
      address: p.pickupAddress.address,
      landmark: p.pickupAddress.landmark,
      localiteNameFr: p.pickupAddress.localite.nameFr,
      localiteNameAr: p.pickupAddress.localite.nameAr,
      delegationNameFr: p.pickupAddress.delegation.nameFr,
      delegationNameAr: p.pickupAddress.delegation.nameAr,
      note: p.note,
      declaredCount: p.declaredCount,
      scannedCount: p.scannedCount,
      parcels: p.parcels
        .map((link) => ({
          code: link.parcel.code,
          status: link.parcel.status,
          expected: link.expected,
          scanned: link.scannedAt !== null,
        }))
        // Still to scan first, so the missing ones stay in view (Coursier 4.6).
        .sort((a, b) =>
          a.scanned === b.scanned ? a.code.localeCompare(b.code) : a.scanned ? 1 : -1,
        ),
      aEmporter: bons.get(p.sellerId) ?? NOTHING,
    });

    const visited = new Set([...open, ...done].map((p) => p.sellerId));
    const others = [...bons.keys()].filter((sellerId) => !visited.has(sellerId));
    const sellers = await this.prisma.seller.findMany({
      where: { id: { in: others } },
      orderBy: { shopName: 'asc' },
      select: {
        id: true,
        shopName: true,
        contactFullName: true,
        contactPhone: true,
        pickupAddresses: {
          where: { isActive: true },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
          take: 1,
          include: {
            localite: { select: { nameFr: true, nameAr: true } },
            delegation: { select: { nameFr: true, nameAr: true } },
          },
        },
      },
    });
    const visits = sellers.map((seller): CourierBonVisitView => {
      const address = seller.pickupAddresses[0];
      return {
        sellerId: seller.id,
        shopName: seller.shopName,
        contactName: seller.contactFullName,
        sellerPhone: seller.contactPhone,
        address: address?.address ?? null,
        landmark: address?.landmark ?? null,
        localiteNameFr: address?.localite.nameFr ?? null,
        localiteNameAr: address?.localite.nameAr ?? null,
        delegationNameFr: address?.delegation.nameFr ?? null,
        delegationNameAr: address?.delegation.nameAr ?? null,
        aEmporter: bons.get(seller.id)!,
      };
    });
    return { open: open.map(view), done: done.map(view), visits };
  }

  /** Terminer le ramassage, applied once per id the phone drew. */
  finish(actor: UserPrincipal, op: CourierFinishPickupOperation): Promise<CourierOperationResult> {
    const now = this.clock.now();
    return applyOnce(
      this.prisma,
      actor,
      { ...op, kind: CourierOperationKind.TERMINER_RAMASSAGE },
      now,
      (tx) => this.close(tx, actor, op.pickupId, now),
    );
  }

  private async close(
    tx: Prisma.TransactionClient,
    actor: UserPrincipal,
    pickupId: string,
    now: Date,
  ): Promise<OperationAnswer> {
    if (actor.role !== Role.RAMASSEUR) return refusal(ScanRefusal.ROLE_NON_AUTORISE);
    // Terminer and a late scan of the same pickup queue here.
    await tx.$queryRaw`SELECT "id" FROM "pickups" WHERE "id" = ${pickupId}::uuid FOR UPDATE`;
    const pickup = await tx.pickup.findUnique({ where: { id: pickupId } });
    if (
      !pickup ||
      pickup.ramasseurId !== actor.courierId ||
      pickup.status === PickupStatus.DEMANDE
    ) {
      return refusal(ScanRefusal.RAMASSAGE_INTROUVABLE);
    }
    if (pickup.status !== PickupStatus.PLANIFIE) return refusal(ScanRefusal.RAMASSAGE_TERMINE);

    const scannedCount = await tx.pickupParcel.count({
      where: { pickupId, scannedAt: { not: null } },
    });
    if (scannedCount === 0) {
      // No parcel: the visit produced no pickup, treated as cancelled, no fee (A-13).
      await tx.pickup.update({
        where: { id: pickupId },
        data: {
          status: PickupStatus.ANNULE,
          scannedCount: 0,
          cancelledAt: now,
          cancelledByUserId: actor.userId,
          cancelReason: 'Aucun colis ramassé',
        },
      });
      return { ok: true, code: null, message: 'Ramassage clôturé sans colis : aucun frais' };
    }

    const { settings } = await this.settings.current(tx);
    const fee = computePickupFee({
      scannedCount,
      feeMillimes: settings.pickupFeeMillimes,
      freeThreshold: settings.pickupFreeThreshold,
    });
    let feeChargeId: string | null = null;
    if (fee > 0n) {
      // Deducted in the seller's next bon de versement (CLAUDE.md, Money).
      const charge = await tx.sellerCharge.create({
        data: {
          sellerId: pickup.sellerId,
          type: 'RAMASSAGE',
          amountMillimes: fee,
          pickupId,
          createdByUserId: actor.userId,
          createdAt: now,
        },
      });
      feeChargeId = charge.id;
    }
    await tx.pickup.update({
      where: { id: pickupId },
      data: { status: PickupStatus.EFFECTUE, completedAt: now, scannedCount, feeChargeId },
    });
    await this.notifications.send(tx, { sellerId: pickup.sellerId }, 'RAMASSAGE_EFFECTUE', {
      pickupId,
      count: scannedCount,
    });
    return {
      ok: true,
      code: null,
      message:
        fee > 0n
          ? `Ramassage terminé : ${scannedCount} colis, frais de ramassage ${formatDT(fee)}`
          : `Ramassage terminé : ${scannedCount} colis`,
    };
  }
}
