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
  /** Bons to hand over: they come with the bons in phase 8 (D-61). */
  aEmporter: never[];
}

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
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Planned for him today or earlier and still open, then those he closed today. */
  async day(
    actor: UserPrincipal,
  ): Promise<{ open: CourierPickupView[]; done: CourierPickupView[] }> {
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
      aEmporter: [],
    });
    return { open: open.map(view), done: done.map(view) };
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
