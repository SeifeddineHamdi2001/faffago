import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ParcelLocation,
  ParcelStatus,
  SCAN_REFUSAL_MESSAGES_FR,
  isDueForTour,
  plannedLivreurFor,
  tourLoads,
  tunisDayKey,
  type MoveToCourierValues,
  type ParcelSnapshot,
  type RelaunchSlot,
  type ZoneAssignmentKind,
} from '@faffago/shared';
import type { UserPrincipal } from '../auth/principal';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { ParcelEventService } from '../parcels/parcel-event.service';
import { ZoneCoverageService, dateColumnOf } from '../zones/zone-coverage.service';

interface CourierRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface TourParcel {
  id: string;
  code: string;
  status: ParcelStatus;
  relaunchDate: string | null;
  relaunchSlot: RelaunchSlot | null;
  attemptCount: number;
  localiteNameFr: string;
  delegationNameFr: string;
  shopName: string;
  plannedLivreur: CourierRef | null;
  /** Moved by the team to another courier than the zone's livreur (D-55). */
  moved: boolean;
}

export interface TourneesView {
  date: string;
  /** Zones with parcels to go out, by name; each under the livreur covering it today. */
  zones: Array<{
    id: string;
    name: string;
    livreur: CourierRef | null;
    livreurKind: ZoneAssignmentKind | null;
    parcels: TourParcel[];
  }>;
  /** Parcels of a délégation in no zone (D-51). */
  sansZone: TourParcel[];
  loads: Array<{ courier: CourierRef; count: number }>;
  /** Parcels planned for nobody: Sans coursier or Sans zone. */
  withoutCourier: number;
}

/** What Tournées reads of a parcel; the machine's rule decides if it is due today. */
const DISPATCHABLE: ParcelStatus[] = [ParcelStatus.AU_DEPOT, ParcelStatus.RELANCE];

function isDue(
  parcel: { status: ParcelStatus; location: ParcelLocation; relaunchDate: Date | null },
  today: Date,
): boolean {
  return isDueForTour(
    {
      status: parcel.status,
      location: parcel.location,
      relaunchDate: parcel.relaunchDate,
    } as ParcelSnapshot,
    today,
  );
}

const horsTournee = (codes: string[]) =>
  apiError(
    409,
    'COLIS_HORS_TOURNEE',
    `Colis pas au dépôt en attente d’une tournée : ${codes.length > 0 ? codes.join(', ') : 'inconnu'}.`,
    { codes },
  );
const coursierIndisponible = () =>
  apiError(409, 'COURSIER_INDISPONIBLE', SCAN_REFUSAL_MESSAGES_FR.COURSIER_INDISPONIBLE);

/**
 * Tournées (Admin 4.5, D-52, D-55): the parcels at the depot due today, in
 * their zone's column under the livreur covering the zone today, unless the
 * team moved them to another courier; each courier's load before dispatch.
 * The Sortie coursier scan is what actually assigns a parcel.
 */
@Injectable()
export class TourneesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ParcelEventService,
    private readonly coverage: ZoneCoverageService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async plan(): Promise<TourneesView> {
    const todayKey = tunisDayKey(this.clock.now());
    const today = dateColumnOf(todayKey);
    const rows = await this.prisma.parcel.findMany({
      where: { location: ParcelLocation.AU_DEPOT, status: { in: DISPATCHABLE } },
      orderBy: { createdAt: 'asc' },
      include: {
        delegation: { select: { nameFr: true, zoneId: true } },
        localite: { select: { nameFr: true } },
        seller: { select: { shopName: true } },
      },
    });
    const due = rows.filter((row) => isDue(row, today));

    const coverage = await this.coverage.forDay(this.prisma, todayKey);
    const zoneLivreur = new Map(
      [...coverage].map(([zoneId, roles]) => [zoneId, roles.LIVREUR.courierId]),
    );
    const available = await this.availableLivreurs(
      this.prisma,
      due.map((row) => row.plannedLivreurId).filter((id): id is string => id !== null),
      todayKey,
    );

    const planned = due.map((row) =>
      plannedLivreurFor(
        { zoneId: row.delegation.zoneId, plannedLivreurId: row.plannedLivreurId },
        zoneLivreur,
        (id) => available.has(id),
      ),
    );
    const refs = await this.courierRefs([
      ...planned.map((p) => p.courierId),
      ...zoneLivreur.values(),
    ]);
    const ref = (courierId: string | null) => (courierId ? (refs.get(courierId) ?? null) : null);

    const view = (row: (typeof due)[number], index: number): TourParcel => ({
      id: row.id,
      code: row.code,
      status: row.status,
      relaunchDate: row.relaunchDate ? row.relaunchDate.toISOString().slice(0, 10) : null,
      relaunchSlot: row.relaunchSlot,
      attemptCount: row.attemptCount,
      localiteNameFr: row.localite.nameFr,
      delegationNameFr: row.delegation.nameFr,
      shopName: row.seller.shopName,
      plannedLivreur: ref(planned[index]!.courierId),
      moved: planned[index]!.moved,
    });

    const byZone = new Map<string, TourParcel[]>();
    const sansZone: TourParcel[] = [];
    due.forEach((row, index) => {
      const zoneId = row.delegation.zoneId;
      if (!zoneId) {
        sansZone.push(view(row, index));
        return;
      }
      const list = byZone.get(zoneId) ?? [];
      list.push(view(row, index));
      byZone.set(zoneId, list);
    });

    const zones = await this.prisma.zone.findMany({
      where: { id: { in: [...byZone.keys()] } },
      orderBy: { name: 'asc' },
    });
    const loads = tourLoads(planned.map((p) => p.courierId));

    return {
      date: todayKey,
      zones: zones.map((zone) => {
        const cover = coverage.get(zone.id)?.LIVREUR ?? { courierId: null, kind: null };
        return {
          id: zone.id,
          name: zone.name,
          livreur: ref(cover.courierId),
          livreurKind: cover.kind,
          parcels: byZone.get(zone.id) ?? [],
        };
      }),
      sansZone,
      loads: [...loads.byCourier]
        .map(([courierId, count]) => ({ courier: ref(courierId)!, count }))
        .filter((load) => load.courier !== null)
        .sort((a, b) =>
          `${a.courier.firstName} ${a.courier.lastName}`.localeCompare(
            `${b.courier.firstName} ${b.courier.lastName}`,
            'fr',
          ),
        ),
      withoutCourier: loads.withoutCourier,
    };
  }

  /**
   * Moves parcels to another courier, or back to their zone's livreur with
   * null (D-55). All or nothing: every parcel must be at the depot waiting
   * for today's tour, and the courier must be a livreur able to go out today.
   */
  async move(actor: UserPrincipal, input: MoveToCourierValues): Promise<{ moved: number }> {
    const todayKey = tunisDayKey(this.clock.now());
    const today = dateColumnOf(todayKey);
    return this.prisma.$transaction(async (tx) => {
      let target: string | null = null;
      if (input.courierId) {
        const user = await tx.user.findUnique({
          where: { id: input.courierId },
          select: { role: true, courier: { select: { id: true } } },
        });
        const courierId = user?.role === 'LIVREUR' ? (user.courier?.id ?? null) : null;
        if (
          !courierId ||
          !(await this.availableLivreurs(tx, [courierId], todayKey)).has(courierId)
        ) {
          throw coursierIndisponible();
        }
        target = courierId;
      }

      const parcels = [];
      for (const id of input.parcelIds) {
        await tx.$queryRaw`SELECT "id" FROM "parcels" WHERE "id" = ${id}::uuid FOR UPDATE`;
        parcels.push({ id, row: await tx.parcel.findUnique({ where: { id } }) });
      }
      const refused = parcels.filter(({ row }) => !row || !isDue(row, today));
      if (refused.length > 0) {
        throw horsTournee(
          refused
            .map(({ row }) => row?.code)
            .filter((code): code is string => code !== undefined)
            .sort(),
        );
      }

      let moved = 0;
      for (const { row } of parcels) {
        if (row!.plannedLivreurId === target) continue;
        await this.events.recordPlannedLivreur(tx, {
          parcelId: row!.id,
          actor,
          plannedLivreurId: target,
        });
        moved += 1;
      }
      return { moved };
    });
  }

  /**
   * The load of every livreur today, and the parcels each one carries now,
   * for the Coursiers list (D-11), by courier id.
   */
  async parcelsToday(): Promise<Map<string, { withHim: number; planned: number }>> {
    const plan = await this.plan();
    const out = new Map<string, { withHim: number; planned: number }>();
    const userIds = new Map(
      (
        await this.prisma.courier.findMany({
          where: { user: { role: 'LIVREUR' } },
          select: { id: true, userId: true },
        })
      ).map((c) => [c.userId, c.id]),
    );
    for (const courierId of userIds.values()) out.set(courierId, { withHim: 0, planned: 0 });
    for (const load of plan.loads) {
      const courierId = userIds.get(load.courier.id);
      if (courierId) out.get(courierId)!.planned = load.count;
    }
    const carried = await this.prisma.parcel.groupBy({
      by: ['currentLivreurId'],
      where: { location: ParcelLocation.AVEC_LE_LIVREUR, currentLivreurId: { not: null } },
      _count: { _all: true },
    });
    for (const row of carried) {
      const entry = out.get(row.currentLivreurId!);
      if (entry) entry.withHim = row._count._all;
    }
    return out;
  }

  /** Livreurs among these who can go out today: active, taking work, not absent (D-12, D-52). */
  private async availableLivreurs(
    db: Prisma.TransactionClient,
    courierIds: string[],
    todayKey: string,
  ): Promise<Set<string>> {
    if (courierIds.length === 0) return new Set();
    const couriers = await db.courier.findMany({
      where: {
        id: { in: [...new Set(courierIds)] },
        accountState: 'ACTIF',
        user: { role: 'LIVREUR', isActive: true, acceptsWork: true },
        absences: { none: { date: dateColumnOf(todayKey) } },
      },
      select: { id: true },
    });
    return new Set(couriers.map((c) => c.id));
  }

  /** Couriers by courier id, named by their account id as the back office does. */
  private async courierRefs(ids: (string | null)[]): Promise<Map<string, CourierRef>> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    if (wanted.length === 0) return new Map();
    const couriers = await this.prisma.courier.findMany({
      where: { id: { in: wanted } },
      select: { id: true, user: { select: { id: true, firstName: true, lastName: true } } },
    });
    return new Map(couriers.map((c) => [c.id, c.user]));
  }
}
