import { Inject, Injectable } from '@nestjs/common';
import {
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

  async queue() {
    const now = this.clock.now();
    const todayKey = tunisDayKey(now);
    const [depotWaiting, pickupsLate, changeRequests, manualEntries] = await Promise.all([
      this.depotWaiting(now, todayKey),
      this.pickupsLate(todayKey),
      this.changeRequests.waiting(),
      this.manualEntries(todayKey),
    ]);
    return { depotWaiting, pickupsLate, changeRequests, manualEntries };
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
