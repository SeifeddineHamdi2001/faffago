import { Inject, Injectable } from '@nestjs/common';
import {
  BON_ARCHIVE_EXCEPTION_HOURS,
  BON_EN_ROUTE_EXCEPTION_HOURS,
  Permission,
  SellerStatut,
  VERIFY_WARNING_HOURS,
  can,
  cashLate,
  type Role,
  MANUAL_ENTRY_EXCEPTION_DAYS,
  MANUAL_ENTRY_TREAT_REFUSAL_MESSAGES_FR,
  ManualEntryTreatRefusal,
  ParcelLocation,
  ParcelStatus,
  PickupStatus,
  addTunisDays,
  documentDateKey,
  isDueForTour,
  isPickupLate,
  tunisDayKey,
  tunisDayStart,
  waitedTooLongAtDepot,
  type ParcelSnapshot,
} from '@faffago/shared';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import type { UserPrincipal } from '../auth/principal';
import { ChangeRequestsService } from '../demandes/change-requests.service';
import { dateColumnOf } from '../zones/zone-coverage.service';

function treatRefused(refusal: ManualEntryTreatRefusal) {
  return apiError(
    refusal === ManualEntryTreatRefusal.SCAN_INTROUVABLE ? 404 : 409,
    refusal,
    MANUAL_ENTRY_TREAT_REFUSAL_MESSAGES_FR[refusal],
  );
}

/**
 * Exceptions, first rows (Admin 4.7, A-22, D-50). Each row leads to the
 * screen where it is dealt with — Tournées, Ramassages, the parcel's Colis
 * page — and each role acts there with its own rights.
 */
@Injectable()
export class ExceptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly changeRequests: ChangeRequestsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async queue(role: Role) {
    const now = this.clock.now();
    const todayKey = tunisDayKey(now);
    const [
      depotWaiting,
      pickupsLate,
      changeRequests,
      manualEntries,
      verifyNearLimit,
      cashNotHandedOver,
      bonsEnRoute,
      bonsNotArchived,
      sellersMissingCin,
    ] = await Promise.all([
      this.depotWaiting(now, todayKey),
      this.pickupsLate(todayKey),
      this.changeRequests.waiting(),
      this.manualEntries(todayKey),
      this.verifyNearLimit(now),
      this.cashNotHandedOver(todayKey),
      this.bonsEnRoute(now),
      this.bonsNotArchived(now),
      // The statut and the CIN number are the admin's (D-11, D-89).
      can(role, Permission.VENDEURS_DOCUMENTS) ? this.sellersMissingCin() : Promise.resolve(null),
    ]);
    return {
      depotWaiting,
      pickupsLate,
      changeRequests,
      manualEntries,
      verifyNearLimit,
      cashNotHandedOver,
      bonsEnRoute,
      bonsNotArchived,
      sellersMissingCin,
    };
  }

  /** Admin 4.7: close to the À vérifier limit — under 24 h left (D-76's mark). */
  private async verifyNearLimit(now: Date) {
    const rows = await this.prisma.parcel.findMany({
      where: {
        status: ParcelStatus.A_VERIFIER,
        verifyDeadlineAt: {
          gt: now,
          lt: new Date(now.getTime() + VERIFY_WARNING_HOURS * 3_600_000),
        },
      },
      orderBy: { verifyDeadlineAt: 'asc' },
      take: 200,
      include: { seller: { select: { shopName: true, contactPhone: true } } },
    });
    return rows.map((p) => ({
      code: p.code,
      shopName: p.seller.shopName,
      sellerPhone: p.seller.contactPhone,
      recipientPhone: p.recipientPhone,
      deadline: p.verifyDeadlineAt!,
    }));
  }

  /**
   * Admin 4.7: a courier who has not handed over his cash. The cash of a day
   * already over is still with him — his caisse of that day never closed:
   * a livreur's deliveries, a ramasseur's bon cash (D-79, D-89).
   */
  private async cashNotHandedOver(todayKey: string) {
    const today = dateColumnOf(todayKey);
    const deliveries = await this.prisma.scan.findMany({
      where: {
        action: 'LIVRE',
        accepted: true,
        cancelledAt: null,
        businessDate: { lt: today },
        parcel: { status: 'LIVRE', cashStatus: 'CHEZ_LE_COURSIER' },
      },
      select: {
        businessDate: true,
        actorUserId: true,
        parcel: { select: { codAmountMillimes: true } },
      },
    });
    const sessions = await this.prisma.caisseSession.findMany({
      where: { businessDate: { lt: today }, status: { not: 'CLOTUREE' }, bons: { some: {} } },
      include: { bons: true, courier: { select: { userId: true } } },
    });
    const byKey = new Map<string, { userId: string; day: string; amount: bigint }>();
    const add = (userId: string, day: string, amount: bigint) => {
      const key = `${userId}|${day}`;
      const entry = byKey.get(key) ?? { userId, day, amount: 0n };
      entry.amount += amount;
      byKey.set(key, entry);
    };
    for (const scan of deliveries) {
      add(scan.actorUserId, documentDateKey(scan.businessDate), scan.parcel!.codAmountMillimes);
    }
    for (const session of sessions) {
      const held = session.bons.reduce(
        (sum, line) => sum + line.takenOutMillimes - line.remisMillimes - line.returnedMillimes,
        0n,
      );
      if (held > 0n) add(session.courier.userId, documentDateKey(session.businessDate), held);
    }
    const entries = [...byKey.values()].filter((entry) => cashLate(entry.day, todayKey));
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(entries.map((e) => e.userId))] } },
      select: { id: true, firstName: true, lastName: true, role: true },
    });
    return entries
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((entry) => {
        const user = users.find((u) => u.id === entry.userId)!;
        return {
          courier: {
            userId: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
          },
          day: entry.day,
          amountMillimes: entry.amount,
        };
      });
  }

  /** Admin 4.7: a bon en route not marked Remis after 24 h (versement and retour). */
  private async bonsEnRoute(now: Date) {
    const before = new Date(now.getTime() - BON_EN_ROUTE_EXCEPTION_HOURS * 3_600_000);
    const where = { status: 'EN_ROUTE' as const, enRouteAt: { lt: before } };
    const include = {
      seller: { select: { shopName: true } },
      ramasseur: { select: { user: { select: { id: true, firstName: true, lastName: true } } } },
    };
    const [versement, retour] = await Promise.all([
      this.prisma.bonVersement.findMany({ where, include, orderBy: { enRouteAt: 'asc' } }),
      this.prisma.bonRetour.findMany({ where, include, orderBy: { enRouteAt: 'asc' } }),
    ]);
    return [
      ...versement.map((b) => ({
        ...bonRef(b),
        kind: 'BON_VERSEMENT' as const,
        since: b.enRouteAt!,
      })),
      ...retour.map((b) => ({ ...bonRef(b), kind: 'BON_RETOUR' as const, since: b.enRouteAt! })),
    ].sort((a, b) => a.since.getTime() - b.since.getTime());
  }

  /** Admin 4.7: a signed bon not archived after 48 h. */
  private async bonsNotArchived(now: Date) {
    const before = new Date(now.getTime() - BON_ARCHIVE_EXCEPTION_HOURS * 3_600_000);
    const where = { status: 'REMIS' as const, remisAt: { lt: before } };
    const include = {
      seller: { select: { shopName: true } },
      ramasseur: { select: { user: { select: { id: true, firstName: true, lastName: true } } } },
    };
    const [versement, retour] = await Promise.all([
      this.prisma.bonVersement.findMany({ where, include, orderBy: { remisAt: 'asc' } }),
      this.prisma.bonRetour.findMany({ where, include, orderBy: { remisAt: 'asc' } }),
    ]);
    return [
      ...versement.map((b) => ({
        ...bonRef(b),
        kind: 'BON_VERSEMENT' as const,
        since: b.remisAt!,
      })),
      ...retour.map((b) => ({ ...bonRef(b), kind: 'BON_RETOUR' as const, since: b.remisAt! })),
    ].sort((a, b) => a.since.getTime() - b.since.getTime());
  }

  /** D-89: a CIN uniquement seller without his CIN number gets no bon. */
  private async sellersMissingCin() {
    const rows = await this.prisma.seller.findMany({
      where: { statut: SellerStatut.CIN_UNIQUEMENT, cinNumber: null },
      orderBy: { shopName: 'asc' },
      select: { id: true, shopName: true, contactFullName: true },
    });
    return rows.map((s) => ({
      sellerId: s.id,
      shopName: s.shopName,
      contactFullName: s.contactFullName,
    }));
  }

  /**
   * Parcels waiting at the depot for a tour, more than 48 h since they
   * arrived — a Relancé parcel counts from the start of its day, since it
   * was meant to wait until then (D-9).
   */
  private async depotWaiting(now: Date, todayKey: string) {
    const today = dateColumnOf(todayKey);
    const candidates = (
      await this.prisma.parcel.findMany({
        where: {
          location: ParcelLocation.AU_DEPOT,
          status: { in: [ParcelStatus.AU_DEPOT, ParcelStatus.RELANCE] },
        },
        include: {
          seller: { select: { shopName: true } },
          delegation: { select: { nameFr: true, zone: { select: { name: true } } } },
        },
      })
    ).filter((p) =>
      isDueForTour(
        { status: p.status, location: p.location, relaunchDate: p.relaunchDate } as ParcelSnapshot,
        today,
      ),
    );
    if (candidates.length === 0) return [];

    // The latest arrival at the depot of each parcel, in the order events were written.
    const arrivals = await this.prisma.parcelEvent.findMany({
      where: {
        parcelId: { in: candidates.map((p) => p.id) },
        newLocation: ParcelLocation.AU_DEPOT,
      },
      orderBy: { sequence: 'desc' },
      distinct: ['parcelId'],
      select: { parcelId: true, serverTime: true },
    });
    const arrivedAt = new Map(arrivals.map((a) => [a.parcelId, a.serverTime]));

    return candidates
      .map((p) => {
        let since = arrivedAt.get(p.id) ?? p.createdAt;
        if (p.status === ParcelStatus.RELANCE && p.relaunchDate) {
          const dayStart = tunisDayStart(documentDateKey(p.relaunchDate));
          if (dayStart > since) since = dayStart;
        }
        return { parcel: p, since };
      })
      .filter(({ since }) => waitedTooLongAtDepot(since, now))
      .sort((a, b) => a.since.getTime() - b.since.getTime())
      .map(({ parcel, since }) => ({
        code: parcel.code,
        status: parcel.status,
        shopName: parcel.seller.shopName,
        delegationNameFr: parcel.delegation.nameFr,
        zoneName: parcel.delegation.zone?.name ?? null,
        since,
      }));
  }

  /** Pickups planned for a day already past, still not done. */
  private async pickupsLate(todayKey: string) {
    const rows = await this.prisma.pickup.findMany({
      where: { status: PickupStatus.PLANIFIE, plannedDate: { lt: dateColumnOf(todayKey) } },
      orderBy: [{ plannedDate: 'asc' }, { plannedSlot: 'asc' }],
      include: {
        seller: { select: { shopName: true } },
        ramasseur: { select: { user: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    return rows
      .filter((p) => p.plannedDate && isPickupLate(documentDateKey(p.plannedDate), todayKey))
      .map((p) => ({
        id: p.id,
        shopName: p.seller.shopName,
        plannedDate: documentDateKey(p.plannedDate!),
        plannedSlot: p.plannedSlot,
        ramasseur: p.ramasseur?.user ?? null,
      }));
  }

  /**
   * Codes typed by hand in the last days (A-22), newest first. A treated
   * entry (`treatedAt` set) has left the queue.
   */
  private async manualEntries(todayKey: string) {
    const from = tunisDayStart(addTunisDays(todayKey, -(MANUAL_ENTRY_EXCEPTION_DAYS - 1)));
    const scans = await this.prisma.scan.findMany({
      where: { manualEntry: true, receivedAt: { gte: from }, treatedAt: null },
      orderBy: { receivedAt: 'desc' },
      take: 200,
      include: {
        parcel: { select: { code: true } },
        actor: { select: { firstName: true, lastName: true, role: true } },
      },
    });
    return scans.map((s) => ({
      scanId: s.id,
      at: s.receivedAt,
      action: s.action,
      accepted: s.accepted,
      rawCode: s.rawCode,
      parcelCode: s.parcel?.code ?? null,
      actor: { name: `${s.actor.firstName} ${s.actor.lastName}`, role: s.actor.role },
    }));
  }

  /**
   * Marquer comme traité (Admin and Dépôt, A-22): the manual entry leaves
   * the queue. Who and when are stored; asked twice, it answers the same.
   */
  async treatManualEntry(actor: UserPrincipal, scanId: string) {
    const scan = await this.prisma.scan.findUnique({ where: { id: scanId } });
    if (!scan) throw treatRefused(ManualEntryTreatRefusal.SCAN_INTROUVABLE);
    if (!scan.manualEntry) throw treatRefused(ManualEntryTreatRefusal.PAS_UNE_SAISIE_MANUELLE);
    const treated = scan.treatedAt
      ? scan
      : await this.prisma.scan.update({
          where: { id: scanId },
          data: { treatedAt: this.clock.now(), treatedByUserId: actor.userId },
        });
    return { scanId: treated.id, treated: true as const, treatedAt: treated.treatedAt! };
  }
}

function bonRef(bon: {
  id: string;
  number: string;
  seller: { shopName: string };
  ramasseur: { user: { id: string; firstName: string; lastName: string } } | null;
}) {
  return {
    id: bon.id,
    number: bon.number,
    shopName: bon.seller.shopName,
    ramasseur: bon.ramasseur?.user ?? null,
  };
}
