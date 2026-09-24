import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  PICKUP_MESSAGES,
  PickupErrorCode,
  PickupStatus,
  SCAN_REFUSAL_MESSAGES_FR,
  canMarkAbsentOn,
  canPlanPickup,
  documentDateKey,
  tunisDayKey,
  type PickupSlot,
  type PlanPickupValues,
  type ZoneAssignmentKind,
} from '@faffago/shared';
import type { UserPrincipal } from '../auth/principal';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { ZoneCoverageService, dateColumnOf } from '../zones/zone-coverage.service';

interface CourierRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface Suggestion {
  ramasseur: CourierRef | null;
  kind: ZoneAssignmentKind | null;
}

/** A pickup as the team reads it (Admin 4.4): the seller's shop and phone, the place, the plan. */
export interface RamassageRow {
  id: string;
  status: PickupStatus;
  shopName: string;
  contactPhone: string;
  address: {
    address: string;
    landmark: string | null;
    localiteNameFr: string;
    delegationNameFr: string;
    zone: { id: string; name: string } | null;
  };
  requestedSlot: PickupSlot | null;
  note: string | null;
  expectedCount: number;
  scannedCount: number;
  plannedDate: string | null;
  plannedSlot: PickupSlot | null;
  ramasseur: CourierRef | null;
  createdAt: Date;
  /** A request still to plan: the ramasseur covering its zone today (A-14, D-52). */
  suggestion: Suggestion | null;
}

export interface RamassageDetail extends RamassageRow {
  parcels: { code: string; recipientName: string; status: string; pickedUp: boolean }[];
  /** What the ramasseur takes to that seller on the same visit (Admin 4.4, rule 10). */
  aEmporter: {
    bonsVersement: { number: string; netMillimes: bigint }[];
    bonsRetour: { number: string; parcelCount: number }[];
  };
}

const INCLUDE = {
  seller: { select: { shopName: true, contactPhone: true } },
  pickupAddress: {
    include: {
      localite: { select: { nameFr: true } },
      delegation: { select: { nameFr: true, zone: { select: { id: true, name: true } } } },
    },
  },
  ramasseur: { select: { user: { select: { id: true, firstName: true, lastName: true } } } },
  _count: { select: { parcels: true } },
} satisfies Prisma.PickupInclude;

type Row = Prisma.PickupGetPayload<{ include: typeof INCLUDE }>;

const introuvable = () =>
  apiError(404, PickupErrorCode.RAMASSAGE_INTROUVABLE, PICKUP_MESSAGES.ramassageIntrouvable);
const nonPlanifiable = () =>
  apiError(
    409,
    'RAMASSAGE_NON_PLANIFIABLE',
    'Ce ramassage est effectué ou annulé : il ne peut plus être planifié.',
  );
const datePassee = () => apiError(409, 'DATE_PASSEE', 'Choisissez aujourd’hui ou un jour à venir.');
const indisponible = () =>
  apiError(409, 'COURSIER_INDISPONIBLE', SCAN_REFUSAL_MESSAGES_FR.COURSIER_INDISPONIBLE);

/** At most this many pickups in a list of done or cancelled ones, newest first. */
const HISTORY_LIMIT = 200;

/**
 * Ramassages, the team's side (Admin 4.4, D-58): the requests to plan, with
 * the ramasseur covering the zone of the pickup's address pre-filled (A-14,
 * D-52); planned and re-planned by Admin and Dépôt; never cancelled by them
 * (the seller cancels, D-35). The ramasseur's scans and the pickup fee at
 * closing come with his app (phase 6, D-50).
 */
@Injectable()
export class RamassagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coverage: ZoneCoverageService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(status?: PickupStatus): Promise<RamassageRow[]> {
    const orderBy: Prisma.PickupOrderByWithRelationInput[] =
      status === PickupStatus.PLANIFIE
        ? [{ plannedDate: 'asc' }, { plannedSlot: 'asc' }, { createdAt: 'asc' }]
        : status === PickupStatus.DEMANDE
          ? [{ createdAt: 'asc' }]
          : [{ createdAt: 'desc' }];
    const history = status === PickupStatus.EFFECTUE || status === PickupStatus.ANNULE || !status;
    const rows = await this.prisma.pickup.findMany({
      where: status ? { status } : {},
      orderBy,
      include: INCLUDE,
      ...(history ? { take: HISTORY_LIMIT } : {}),
    });
    const today = await this.coverage.forDay(this.prisma, tunisDayKey(this.clock.now()));
    const refs = await this.refs([...today.values()].map((roles) => roles.RAMASSEUR.courierId));
    return rows.map((row) => {
      const zoneId = row.pickupAddress.delegation.zone?.id ?? null;
      const cover = zoneId ? today.get(zoneId)?.RAMASSEUR : undefined;
      return this.view(
        row,
        row.status === PickupStatus.DEMANDE
          ? {
              ramasseur: cover?.courierId ? (refs.get(cover.courierId) ?? null) : null,
              kind: cover?.kind ?? null,
            }
          : null,
      );
    });
  }

  async detail(id: string): Promise<RamassageDetail> {
    const row = await this.prisma.pickup.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw introuvable();
    const [links, bonsVersement, bonsRetour] = await Promise.all([
      this.prisma.pickupParcel.findMany({
        where: { pickupId: id },
        include: { parcel: { select: { code: true, recipientName: true, status: true } } },
        orderBy: { parcel: { createdAt: 'asc' } },
      }),
      this.prisma.bonVersement.findMany({
        where: { sellerId: row.sellerId, status: 'PREPARE', cancelledAt: null },
        orderBy: { preparedAt: 'asc' },
        select: { number: true, netMillimes: true },
      }),
      this.prisma.bonRetour.findMany({
        where: { sellerId: row.sellerId, status: 'PREPARE', cancelledAt: null },
        orderBy: { preparedAt: 'asc' },
        select: { number: true, parcelCount: true },
      }),
    ]);
    return {
      ...this.view(row, null),
      parcels: links.map((link) => ({
        code: link.parcel.code,
        recipientName: link.parcel.recipientName,
        status: link.parcel.status,
        pickedUp: link.scannedAt !== null,
      })),
      aEmporter: { bonsVersement, bonsRetour },
    };
  }

  /** The ramasseur covering the zone of the pickup's address on that day (A-14, D-52). */
  async suggestion(id: string, dayKey: string): Promise<Suggestion> {
    const row = await this.prisma.pickup.findUnique({ where: { id }, include: INCLUDE });
    if (!row) throw introuvable();
    const zoneId = row.pickupAddress.delegation.zone?.id;
    if (!zoneId) return { ramasseur: null, kind: null };
    const cover = (await this.coverage.forDay(this.prisma, dayKey)).get(zoneId)?.RAMASSEUR;
    if (!cover?.courierId) return { ramasseur: null, kind: null };
    return {
      ramasseur: (await this.refs([cover.courierId])).get(cover.courierId) ?? null,
      kind: cover.kind,
    };
  }

  /**
   * Planifier, or plan again while planned (Admin 4.4, D-58): a day from
   * today, a window, a ramasseur able to work that day. The pickup is locked:
   * the seller cancelling at the same moment waits, then finds it planned.
   */
  async plan(actor: UserPrincipal, id: string, input: PlanPickupValues): Promise<RamassageRow> {
    const now = this.clock.now();
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "pickups" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const pickup = await tx.pickup.findUnique({ where: { id } });
      if (!pickup) throw introuvable();
      if (!canPlanPickup(pickup.status)) throw nonPlanifiable();
      if (!canMarkAbsentOn(input.date, tunisDayKey(now))) throw datePassee();

      const date = dateColumnOf(input.date);
      const courier = await tx.courier.findFirst({
        where: {
          user: { id: input.ramasseurId, role: 'RAMASSEUR', isActive: true, acceptsWork: true },
          accountState: 'ACTIF',
          absences: { none: { date } },
        },
        select: { id: true },
      });
      if (!courier) throw indisponible();

      await tx.pickup.update({
        where: { id },
        data: {
          status: PickupStatus.PLANIFIE,
          plannedDate: date,
          plannedSlot: input.slot,
          ramasseurId: courier.id,
          plannedByUserId: actor.userId,
          plannedAt: now,
        },
      });
      return tx.pickup.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    });
    return this.view(row, null);
  }

  private view(row: Row, suggestion: Suggestion | null): RamassageRow {
    return {
      id: row.id,
      status: row.status,
      shopName: row.seller.shopName,
      contactPhone: row.seller.contactPhone,
      address: {
        address: row.pickupAddress.address,
        landmark: row.pickupAddress.landmark,
        localiteNameFr: row.pickupAddress.localite.nameFr,
        delegationNameFr: row.pickupAddress.delegation.nameFr,
        zone: row.pickupAddress.delegation.zone,
      },
      requestedSlot: row.requestedSlot,
      note: row.note,
      expectedCount: row._count.parcels || row.declaredCount || 0,
      scannedCount: row.scannedCount,
      plannedDate: row.plannedDate ? documentDateKey(row.plannedDate) : null,
      plannedSlot: row.plannedSlot,
      ramasseur: row.ramasseur?.user ?? null,
      createdAt: row.createdAt,
      suggestion,
    };
  }

  /** Couriers by courier id, named by their account id as the back office does. */
  private async refs(ids: (string | null)[]): Promise<Map<string, CourierRef>> {
    const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
    if (wanted.length === 0) return new Map();
    const couriers = await this.prisma.courier.findMany({
      where: { id: { in: wanted } },
      select: { id: true, user: { select: { id: true, firstName: true, lastName: true } } },
    });
    return new Map(couriers.map((c) => [c.id, c.user]));
  }
}
