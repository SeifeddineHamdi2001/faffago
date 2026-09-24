import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  BYTE_ORDER_MARK,
  CANCELLATION_AFTER_PICKUP,
  MAX_EXPORT_ROWS,
  PARCELS_PAGE_SIZE,
  PARCEL_CASH_STATUS_LABELS_FR,
  PARCEL_GROUP_FILTERS,
  PARCEL_STATUS_LABELS_FR,
  ParcelGroup,
  Role,
  TUNISIA_UTC_OFFSET_MINUTES,
  csvLine,
  formatDT,
  type FailureReason,
  type ParcelEventType,
  type ParcelListQuery,
  type TimelineActor,
} from '@faffago/shared';
import { sellerIdOf, type Principal } from '../auth/principal';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ParcelsService, type SellerParcelView } from './parcels.service';

/** One row of Mes colis (Vendeur 4.7). */
export interface ParcelListItem {
  code: string;
  recipientName: string;
  recipientPhone: string;
  delegationNameFr: string;
  localiteNameFr: string;
  status: string;
  cashStatus: string | null;
  codAmountMillimes: bigint;
  createdAt: Date;
}

export interface ParcelList {
  items: ParcelListItem[];
  total: number;
  page: number;
  pageSize: number;
  /** The seller's own count in every group, under the same search and dates. */
  counts: Record<ParcelGroup, number>;
}

/** One line of the timeline as the seller reads it (Vendeur 4.8, D-38). */
export interface TimelineEntry {
  type: ParcelEventType;
  at: Date;
  actor: TimelineActor;
  /** Where the parcel was left: the location label only, never GPS (D-38). */
  location: string | null;
  failureReason: FailureReason | null;
  cancelledAfterPickup: boolean;
}

/** Détail du colis: the parcel, its timeline, its attempts and its bon. */
export interface SellerParcelDetail extends SellerParcelView {
  attemptCount: number;
  maxAttempts: number;
  lastFailureReason: FailureReason | null;
  /** Set once the parcel is paid: the bon de versement it was paid in. */
  bonNumber: string | null;
  timeline: TimelineEntry[];
}

const COURIER_ROLES: readonly Role[] = [Role.LIVREUR, Role.RAMASSEUR];

/** The UTC instant local midnight starts a Tunisian calendar day. */
function localDayStart(key: string): Date {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day) - TUNISIA_UTC_OFFSET_MINUTES * 60_000);
}

function localDateTime(date: Date): string {
  const local = new Date(date.getTime() + TUNISIA_UTC_OFFSET_MINUTES * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)}/${local.getUTCFullYear()} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

/**
 * Mes colis, Exporter and Détail du colis (Vendeur 4.7, 4.8). Always the
 * seller's own parcels: the seller id comes from the session, never from
 * the request.
 */
@Injectable()
export class ParcelQueriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly parcels: ParcelsService,
  ) {}

  async list(principal: Principal, query: ParcelListQuery): Promise<ParcelList> {
    const base = this.baseWhere(sellerIdOf(principal), query);
    const where = { ...base, ...this.groupWhere(query.group) };
    const [total, rows, ...counts] = await Promise.all([
      this.prisma.parcel.count({ where }),
      this.prisma.parcel.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { code: 'asc' }],
        skip: (query.page - 1) * PARCELS_PAGE_SIZE,
        take: PARCELS_PAGE_SIZE,
        include: { localite: true, delegation: true },
      }),
      ...Object.values(ParcelGroup).map((group) =>
        this.prisma.parcel.count({ where: { ...base, ...this.groupWhere(group) } }),
      ),
    ]);
    return {
      items: rows.map((parcel) => ({
        code: parcel.code,
        recipientName: parcel.recipientName,
        recipientPhone: parcel.recipientPhone,
        delegationNameFr: parcel.delegation.nameFr,
        localiteNameFr: parcel.localite.nameFr,
        status: parcel.status,
        cashStatus: parcel.cashStatus,
        codAmountMillimes: parcel.codAmountMillimes,
        createdAt: parcel.createdAt,
      })),
      total,
      page: query.page,
      pageSize: PARCELS_PAGE_SIZE,
      counts: Object.fromEntries(
        Object.values(ParcelGroup).map((group, i) => [group, counts[i]!]),
      ) as Record<ParcelGroup, number>,
    };
  }

  /**
   * Exporter (Vendeur 4.7): the parcels of the current filter, every page,
   * as a CSV a French Excel opens with its accents.
   */
  async exportCsv(principal: Principal, query: ParcelListQuery): Promise<string> {
    const where = {
      ...this.baseWhere(sellerIdOf(principal), query),
      ...this.groupWhere(query.group),
    };
    const total = await this.prisma.parcel.count({ where });
    if (total > MAX_EXPORT_ROWS) {
      throw apiError(
        400,
        'EXPORT_TROP_GRAND',
        `${total} colis : ${MAX_EXPORT_ROWS} au maximum par export. Choisissez des dates.`,
      );
    }
    const rows = await this.prisma.parcel.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { code: 'asc' }],
      include: { localite: true, delegation: true },
    });
    const lines = [
      csvLine([
        'Code',
        'Date',
        'Destinataire',
        'Téléphone',
        'Téléphone 2',
        'Localité',
        'Délégation',
        'Adresse',
        'Statut',
        'Paiement',
        'Montant COD (DT)',
      ]),
      ...rows.map((parcel) =>
        csvLine([
          parcel.code,
          localDateTime(parcel.createdAt),
          parcel.recipientName,
          parcel.recipientPhone,
          parcel.recipientPhone2 ?? '',
          parcel.localite.nameFr,
          parcel.delegation.nameFr,
          parcel.address,
          PARCEL_STATUS_LABELS_FR[parcel.status],
          parcel.cashStatus ? PARCEL_CASH_STATUS_LABELS_FR[parcel.cashStatus] : '',
          formatDT(parcel.codAmountMillimes, { suffix: false }),
        ]),
      ),
    ];
    return `${BYTE_ORDER_MARK}${lines.join('\r\n')}\r\n`;
  }

  async detail(principal: Principal, code: string): Promise<SellerParcelDetail> {
    const view = await this.parcels.get(principal, code);
    const [parcel, events, { settings }] = await Promise.all([
      this.prisma.parcel.findUniqueOrThrow({
        where: { id: view.id },
        select: {
          attemptCount: true,
          lastFailureReason: true,
          bonVersementLine: { select: { bonVersement: { select: { number: true } } } },
        },
      }),
      this.prisma.parcelEvent.findMany({
        where: { parcelId: view.id },
        orderBy: { sequence: 'asc' },
        // Never GPS, device or free text: what the seller reads is chosen here (D-38).
        select: {
          type: true,
          serverTime: true,
          actorUserId: true,
          actorRole: true,
          newLocation: true,
          reasonCode: true,
          metadata: true,
        },
      }),
      this.settings.current(),
    ]);

    const courierIds = [
      ...new Set(
        events
          .filter((event) => event.actorRole && COURIER_ROLES.includes(event.actorRole))
          .map((event) => event.actorUserId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const couriers = new Map(
      (
        await this.prisma.user.findMany({
          where: { id: { in: courierIds } },
          select: { id: true, firstName: true },
        })
      ).map((user) => [user.id, user.firstName]),
    );

    const actorOf = (role: Role | null, userId: string | null): TimelineActor => {
      if (role === Role.VENDEUR) return { kind: 'VOUS' };
      if (role && COURIER_ROLES.includes(role) && userId && couriers.has(userId)) {
        // First name only, never the surname or the phone (Vendeur 1, D-38).
        return { kind: 'COURSIER', firstName: couriers.get(userId)! };
      }
      return { kind: 'FAFFA_GO' };
    };

    return {
      ...view,
      attemptCount: parcel.attemptCount,
      maxAttempts: settings.maxDeliveryAttempts,
      lastFailureReason: parcel.lastFailureReason,
      bonNumber: parcel.bonVersementLine?.bonVersement.number ?? null,
      timeline: events.map((event) => ({
        type: event.type,
        at: event.serverTime,
        actor: actorOf(event.actorRole, event.actorUserId),
        location: event.newLocation,
        failureReason: event.reasonCode,
        cancelledAfterPickup:
          (event.metadata as Record<string, unknown> | null)?.annulation ===
          CANCELLATION_AFTER_PICKUP,
      })),
    };
  }

  // ── helpers ────────────────────────────────────────────────

  /** The seller, the search and the dates: what every group count shares. */
  private baseWhere(sellerId: string, query: ParcelListQuery): Prisma.ParcelWhereInput {
    const where: Prisma.ParcelWhereInput = { sellerId };
    const text = query.q?.trim();
    if (text) {
      const digits = text.replace(/\D/g, '');
      const code = text.toUpperCase().replace(/[\s.\-_]/g, '');
      where.OR = [
        { code: { contains: code.startsWith('FG') ? `FG-${code.slice(2)}` : code } },
        { recipientName: { contains: text, mode: 'insensitive' } },
        ...(digits.length >= 3
          ? [{ recipientPhone: { contains: digits } }, { recipientPhone2: { contains: digits } }]
          : []),
      ];
    }
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: localDayStart(query.from) } : {}),
        // The whole of the last day: up to the next day's local midnight.
        ...(query.to
          ? { lt: new Date(localDayStart(query.to).getTime() + 24 * 60 * 60 * 1000) }
          : {}),
      };
    }
    return where;
  }

  private groupWhere(group: ParcelGroup): Prisma.ParcelWhereInput {
    const filter = PARCEL_GROUP_FILTERS[group];
    return {
      ...(filter.statuses ? { status: { in: [...filter.statuses] } } : {}),
      ...(filter.cashStatuses ? { cashStatus: { in: [...filter.cashStatuses] } } : {}),
    };
  }
}
