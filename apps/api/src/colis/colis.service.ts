import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  BYTE_ORDER_MARK,
  CANCELLATION_AFTER_PICKUP,
  MAX_EXPORT_ROWS,
  PARCELS_PAGE_SIZE,
  PARCEL_CASH_STATUS_LABELS_FR,
  PARCEL_LOCATION_LABELS_FR,
  PARCEL_MESSAGES,
  PARCEL_STATUS_LABELS_FR,
  ParcelErrorCode,
  SANS_ZONE_FILTER,
  addTunisDays,
  csvLine,
  formatDT,
  isValidParcelCode,
  normalizeParcelCode,
  tunisDayStart,
  type StaffParcelQuery,
} from '@faffago/shared';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { ChangeRequestsService } from '../demandes/change-requests.service';
import { localDateTime } from '../parcels/parcel-queries.service';

interface PersonName {
  firstName: string;
  lastName: string;
}

/** One row of Colis (Admin 4.3). */
export interface StaffParcelRow {
  code: string;
  createdAt: Date;
  sellerId: string;
  shopName: string;
  recipientName: string;
  recipientPhone: string;
  delegationNameFr: string;
  localiteNameFr: string;
  zoneName: string | null;
  status: string;
  location: string;
  cashStatus: string | null;
  codAmountMillimes: bigint;
  /** The livreur the parcel was last given to. */
  courier: PersonName | null;
  /** A printed field changed since the label was printed (D-57). */
  labelReprintNeeded: boolean;
}

/** One line of the full event log, as the team reads it (Admin 4.3, 4.17). */
export interface StaffEvent {
  type: string;
  at: Date;
  deviceTime: Date | null;
  /** Null for the automatic rules (the 48-hour return). */
  actor: { name: string; role: string | null } | null;
  source: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  previousLocation: string | null;
  newLocation: string | null;
  reasonCode: string | null;
  reasonText: string | null;
  gps: { lat: number; lng: number; accuracyM: number | null } | null;
  /** The scan behind the event: typed by hand, cancelled, a device clock off. */
  scan: { manualEntry: boolean; cancelled: boolean; clockSkewFlagged: boolean } | null;
  /** Tournées: the livreur the parcel was planned for (D-55). */
  plannedFor: string | null;
  cancelledAfterPickup: boolean;
}

const INCLUDE_ROW = {
  seller: { select: { shopName: true } },
  localite: { select: { nameFr: true } },
  delegation: { select: { nameFr: true, zone: { select: { name: true } } } },
  currentLivreur: { select: { user: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.ParcelInclude;

type Row = Prisma.ParcelGetPayload<{ include: typeof INCLUDE_ROW }>;

function rowOf(parcel: Row): StaffParcelRow {
  return {
    code: parcel.code,
    createdAt: parcel.createdAt,
    sellerId: parcel.sellerId,
    shopName: parcel.seller.shopName,
    recipientName: parcel.recipientName,
    recipientPhone: parcel.recipientPhone,
    delegationNameFr: parcel.delegation.nameFr,
    localiteNameFr: parcel.localite.nameFr,
    zoneName: parcel.delegation.zone?.name ?? null,
    status: parcel.status,
    location: parcel.location,
    cashStatus: parcel.cashStatus,
    codAmountMillimes: parcel.codAmountMillimes,
    courier: parcel.currentLivreur?.user ?? null,
    labelReprintNeeded: parcel.labelReprintNeeded,
  };
}

function fullName(person: PersonName): string {
  return `${person.firstName} ${person.lastName}`;
}

const colisIntrouvable = () =>
  apiError(404, ParcelErrorCode.COLIS_INTROUVABLE, PARCEL_MESSAGES.COLIS_INTROUVABLE);

/**
 * Colis, the team's side (Admin 4.3, D-11): every seller's parcels, searched,
 * filtered and exported; one parcel with its money, the courier's reason and
 * the whole event log, GPS and device time included. Admin, Dépôt and
 * Service client read it; what each may do on it is checked by its own route.
 */
@Injectable()
export class ColisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly changeRequests: ChangeRequestsService,
  ) {}

  async list(query: StaffParcelQuery) {
    const where = this.where(query);
    const [total, rows] = await Promise.all([
      this.prisma.parcel.count({ where }),
      this.prisma.parcel.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { code: 'asc' }],
        skip: (query.page - 1) * PARCELS_PAGE_SIZE,
        take: PARCELS_PAGE_SIZE,
        include: INCLUDE_ROW,
      }),
    ]);
    return { items: rows.map(rowOf), total, page: query.page, pageSize: PARCELS_PAGE_SIZE };
  }

  /** The zones, sellers and livreurs the filters offer. */
  async filters() {
    const [zones, sellers, livreurs] = await Promise.all([
      this.prisma.zone.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      this.prisma.seller.findMany({
        orderBy: { shopName: 'asc' },
        select: { id: true, shopName: true },
      }),
      this.prisma.user.findMany({
        where: { role: 'LIVREUR' },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);
    return { zones, sellers, livreurs };
  }

  async exportCsv(query: StaffParcelQuery): Promise<string> {
    const where = this.where(query);
    const total = await this.prisma.parcel.count({ where });
    if (total > MAX_EXPORT_ROWS) {
      throw apiError(
        400,
        'EXPORT_TROP_GRAND',
        `${total} colis : ${MAX_EXPORT_ROWS} au maximum par export. Choisissez des filtres.`,
      );
    }
    const rows = await this.prisma.parcel.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { code: 'asc' }],
      include: INCLUDE_ROW,
    });
    const lines = [
      csvLine([
        'Code',
        'Date',
        'Vendeur',
        'Destinataire',
        'Téléphone',
        'Téléphone 2',
        'Adresse',
        'Localité',
        'Délégation',
        'Zone',
        'Statut',
        'Lieu',
        'Paiement',
        'Montant COD (DT)',
        'Livreur',
      ]),
      ...rows.map((parcel) =>
        csvLine([
          parcel.code,
          localDateTime(parcel.createdAt),
          parcel.seller.shopName,
          parcel.recipientName,
          parcel.recipientPhone,
          parcel.recipientPhone2 ?? '',
          parcel.address,
          parcel.localite.nameFr,
          parcel.delegation.nameFr,
          parcel.delegation.zone?.name ?? '',
          PARCEL_STATUS_LABELS_FR[parcel.status],
          PARCEL_LOCATION_LABELS_FR[parcel.location],
          parcel.cashStatus ? PARCEL_CASH_STATUS_LABELS_FR[parcel.cashStatus] : '',
          formatDT(parcel.codAmountMillimes, { suffix: false }),
          parcel.currentLivreur ? fullName(parcel.currentLivreur.user) : '',
        ]),
      ),
    ];
    return `${BYTE_ORDER_MARK}${lines.join('\r\n')}\r\n`;
  }

  async detail(rawCode: string) {
    const code = normalizeParcelCode(rawCode);
    if (!isValidParcelCode(code)) throw colisIntrouvable();
    const parcel = await this.prisma.parcel.findUnique({
      where: { code },
      include: {
        seller: { select: { id: true, shopName: true, contactPhone: true } },
        localite: { select: { nameFr: true } },
        delegation: { select: { nameFr: true, zone: { select: { name: true } } } },
        currentLivreur: {
          select: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        plannedLivreur: {
          select: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
        bonVersementLine: { select: { bonVersement: { select: { number: true } } } },
        charges: {
          orderBy: { createdAt: 'asc' },
          select: { type: true, amountMillimes: true, status: true },
        },
        events: { orderBy: { sequence: 'asc' } },
      },
    });
    if (!parcel) throw colisIntrouvable();

    const userIds = [
      ...new Set(parcel.events.map((e) => e.actorUserId).filter((id): id is string => !!id)),
    ];
    const scanIds = [
      ...new Set(parcel.events.map((e) => e.scanId).filter((id): id is string => !!id)),
    ];
    const plannedIds = parcel.events
      .map((e) => this.plannedCourierOf(e.metadata))
      .filter((id): id is string => id !== null);
    const [users, scans, planned] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, firstName: true, lastName: true },
      }),
      this.prisma.scan.findMany({
        where: { id: { in: scanIds } },
        select: { id: true, manualEntry: true, cancelledAt: true, clockSkewFlagged: true },
      }),
      this.prisma.courier.findMany({
        where: { id: { in: plannedIds } },
        select: { id: true, user: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    const nameOf = new Map(users.map((u) => [u.id, fullName(u)]));
    const scanOf = new Map(scans.map((s) => [s.id, s]));
    const plannedName = new Map(planned.map((c) => [c.id, fullName(c.user)]));

    const events: StaffEvent[] = parcel.events.map((event) => {
      const scan = event.scanId ? scanOf.get(event.scanId) : undefined;
      const plannedFor = this.plannedCourierOf(event.metadata);
      return {
        type: event.type,
        at: event.serverTime,
        deviceTime: event.deviceTime,
        actor: event.actorUserId
          ? { name: nameOf.get(event.actorUserId) ?? '', role: event.actorRole }
          : null,
        source: event.source,
        previousStatus: event.previousStatus,
        newStatus: event.newStatus,
        previousLocation: event.previousLocation,
        newLocation: event.newLocation,
        reasonCode: event.reasonCode,
        reasonText: event.reasonText,
        gps:
          event.gpsLat && event.gpsLng
            ? {
                lat: event.gpsLat.toNumber(),
                lng: event.gpsLng.toNumber(),
                accuracyM: event.gpsAccuracyM,
              }
            : null,
        scan: scan
          ? {
              manualEntry: scan.manualEntry,
              cancelled: scan.cancelledAt !== null,
              clockSkewFlagged: scan.clockSkewFlagged,
            }
          : null,
        plannedFor: plannedFor ? (plannedName.get(plannedFor) ?? null) : null,
        cancelledAfterPickup:
          (event.metadata as Record<string, unknown> | null)?.annulation ===
          CANCELLATION_AFTER_PICKUP,
      };
    });

    return {
      code: parcel.code,
      createdAt: parcel.createdAt,
      seller: parcel.seller,
      recipientName: parcel.recipientName,
      recipientPhone: parcel.recipientPhone,
      recipientPhone2: parcel.recipientPhone2,
      address: parcel.address,
      landmark: parcel.landmark,
      localiteNameFr: parcel.localite.nameFr,
      delegationNameFr: parcel.delegation.nameFr,
      zoneName: parcel.delegation.zone?.name ?? null,
      productDescription: parcel.productDescription,
      pieceCount: parcel.pieceCount,
      isExchange: parcel.isExchange,
      openingAllowed: parcel.openingAllowed,
      courierNote: parcel.courierNote,
      status: parcel.status,
      location: parcel.location,
      labelReprintNeeded: parcel.labelReprintNeeded,
      attemptCount: parcel.attemptCount,
      lastFailureReason: parcel.lastFailureReason,
      lastFailureNote: parcel.lastFailureNote,
      verifyDeadlineAt: parcel.verifyDeadlineAt,
      relaunchDate: parcel.relaunchDate ? parcel.relaunchDate.toISOString().slice(0, 10) : null,
      relaunchSlot: parcel.relaunchSlot,
      currentLivreur: parcel.currentLivreur?.user ?? null,
      plannedLivreur: parcel.plannedLivreur?.user ?? null,
      money: {
        codAmountMillimes: parcel.codAmountMillimes,
        deliveryFeeMillimes: parcel.deliveryFeeMillimes,
        returnFeeMillimes: parcel.returnFeeMillimes,
        changeClientFeeMillimes: parcel.changeClientFeeMillimes,
        courierRateMillimes: parcel.courierRateMillimes,
        cashStatus: parcel.cashStatus,
        bonNumber: parcel.bonVersementLine?.bonVersement.number ?? null,
        charges: parcel.charges,
      },
      changeRequests: await this.changeRequests.forParcel(parcel.id),
      events,
    };
  }

  /** The courier id a Tournées move or a Sortie coursier names in its metadata. */
  private plannedCourierOf(metadata: Prisma.JsonValue): string | null {
    const data = metadata as Record<string, unknown> | null;
    const id = data?.livreurPrevu ?? data?.prevuPour;
    return typeof id === 'string' ? id : null;
  }

  private where(query: StaffParcelQuery): Prisma.ParcelWhereInput {
    const and: Prisma.ParcelWhereInput[] = [];
    const text = query.q?.trim();
    if (text) {
      const digits = text.replace(/\D/g, '');
      const code = text.toUpperCase().replace(/[\s.\-_]/g, '');
      and.push({
        OR: [
          { code: { contains: code.startsWith('FG') ? `FG-${code.slice(2)}` : code } },
          { recipientName: { contains: text, mode: 'insensitive' } },
          { seller: { shopName: { contains: text, mode: 'insensitive' } } },
          ...(digits.length >= 3
            ? [{ recipientPhone: { contains: digits } }, { recipientPhone2: { contains: digits } }]
            : []),
        ],
      });
    }
    if (query.status) and.push({ status: query.status });
    if (query.cashStatus) and.push({ cashStatus: query.cashStatus });
    if (query.sellerId) and.push({ sellerId: query.sellerId });
    if (query.courierId) and.push({ currentLivreur: { userId: query.courierId } });
    if (query.zoneId) {
      and.push({
        delegation: { zoneId: query.zoneId === SANS_ZONE_FILTER ? null : query.zoneId },
      });
    }
    if (query.from || query.to) {
      and.push({
        createdAt: {
          ...(query.from ? { gte: tunisDayStart(query.from) } : {}),
          ...(query.to ? { lt: tunisDayStart(addTunisDays(query.to, 1)) } : {}),
        },
      });
    }
    return and.length > 0 ? { AND: and } : {};
  }
}
