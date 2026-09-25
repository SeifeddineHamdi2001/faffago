import { Inject, Injectable } from '@nestjs/common';
import type { Parcel, Prisma, ScanSource } from '@prisma/client';
import {
  BonKind,
  ParcelAction,
  ParcelStatus,
  ScanRefusal,
  bonQrContent,
  bonRetourComplete,
  bonVisitOf,
  documentDateKey,
  tunisDayKey,
  type AssignBonValues,
} from '@faffago/shared';
import type { UserPrincipal } from '../auth/principal';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { ParcelEventService } from '../parcels/parcel-event.service';
import { assignableRamasseur } from './bons-versement.service';
import { dateColumn, newBonToken, nextDocumentNumber } from './document-numbers';

type Db = Prisma.TransactionClient;

const introuvable = () => apiError(404, 'BON_INTROUVABLE', 'Bon de retour introuvable');

/** A line still to hand over: its bon Préparé or En route (D-81). */
const OPEN_LINE = {
  receivedAt: null,
  bonRetour: { status: { in: ['PREPARE' as const, 'EN_ROUTE' as const] } },
};

const BON_INCLUDE = {
  seller: { select: { id: true, shopName: true, contactFullName: true, contactPhone: true } },
  pickup: { select: { status: true, ramasseurId: true, plannedDate: true } },
  parcels: {
    include: {
      parcel: {
        select: { code: true, recipientName: true, status: true, productDescription: true },
      },
    },
  },
} satisfies Prisma.BonRetourInclude;

type BonRow = Prisma.BonRetourGetPayload<{ include: typeof BON_INCLUDE }>;

export type ScanStep = { ok: true; message: string } | { ok: false; refusal: ScanRefusal };

/**
 * Bons de retour (Vendeur 4.12, Admin 4.11, A-10, D-81): the returns at the
 * depot grouped by seller, the station's Préparation retours, and the
 * ramasseur's Retour reçu. Every parcel moves through the parcel event
 * service; the old item of an échange has its own line and no fee.
 */
@Injectable()
export class BonsRetourService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ParcelEventService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // ── The Retours screen ────────────────────────────────────

  /** Returns and échange items waiting at the depot or on their way, by seller (Admin 4.11). */
  async bySeller(sellerId?: string) {
    const scope = sellerId ? { sellerId } : {};
    const [parcels, items, bons] = await Promise.all([
      this.prisma.parcel.findMany({
        where: {
          ...scope,
          status: { in: [ParcelStatus.RETOUR_AU_DEPOT, ParcelStatus.RETOUR_EN_ROUTE] },
        },
        orderBy: { updatedAt: 'asc' },
        select: {
          id: true,
          code: true,
          sellerId: true,
          recipientName: true,
          status: true,
          location: true,
          bonRetourLines: { where: OPEN_LINE, select: { bonRetour: { select: { number: true } } } },
        },
      }),
      this.prisma.parcel.findMany({
        where: {
          ...scope,
          exchangeItemStatus: { in: [ParcelStatus.RETOUR_AU_DEPOT, ParcelStatus.RETOUR_EN_ROUTE] },
        },
        select: {
          id: true,
          code: true,
          sellerId: true,
          recipientName: true,
          exchangeItemStatus: true,
          bonRetourLines: {
            where: { ...OPEN_LINE, itemType: 'ARTICLE_RECUPERE' },
            select: { bonRetour: { select: { number: true } } },
          },
        },
      }),
      this.list({ ...scope, open: true }),
    ]);
    const sellerIds = new Set([
      ...parcels.map((p) => p.sellerId),
      ...items.map((p) => p.sellerId),
      ...bons.map((b) => b.seller.id),
    ]);
    const sellers = await this.prisma.seller.findMany({
      where: { id: { in: [...sellerIds] } },
      select: { id: true, shopName: true },
      orderBy: { shopName: 'asc' },
    });
    return sellers.map((seller) => ({
      seller,
      returns: [
        ...parcels
          .filter((p) => p.sellerId === seller.id)
          .map((p) => ({
            code: p.code,
            recipientName: p.recipientName,
            itemType: 'COLIS' as const,
            status: p.status,
            atDepot: p.location === 'AU_DEPOT',
            bonNumber: p.bonRetourLines[0]?.bonRetour.number ?? null,
          })),
        ...items
          .filter((p) => p.sellerId === seller.id)
          .map((p) => ({
            code: p.code,
            recipientName: p.recipientName,
            itemType: 'ARTICLE_RECUPERE' as const,
            status: p.exchangeItemStatus!,
            // The livreur brings it back at the end of his day (D-23).
            atDepot: p.bonRetourLines.length > 0,
            bonNumber: p.bonRetourLines[0]?.bonRetour.number ?? null,
          })),
      ],
      bons: bons.filter((bon) => bon.seller.id === seller.id),
    }));
  }

  async list(filter: { sellerId?: string; status?: string; open?: boolean } = {}) {
    const rows = await this.prisma.bonRetour.findMany({
      where: {
        ...(filter.sellerId ? { sellerId: filter.sellerId } : {}),
        ...(filter.status ? { status: filter.status as never } : {}),
        ...(filter.open ? { status: { in: ['PREPARE', 'EN_ROUTE'] } } : {}),
      },
      orderBy: { preparedAt: 'desc' },
      take: 200,
      include: BON_INCLUDE,
    });
    return this.views(rows);
  }

  /** A bon de retour, whole. For a seller, only his own (D-26). */
  async detail(id: string, sellerId?: string) {
    const row = await this.prisma.bonRetour.findUnique({ where: { id }, include: BON_INCLUDE });
    if (!row || (sellerId && row.sellerId !== sellerId)) throw introuvable();
    const [view] = await this.views([row]);
    return { ...view!, qr: bonQrContent(BonKind.BON_RETOUR, row.qrToken) };
  }

  private async views(rows: BonRow[]) {
    const visits = rows.map((row) => bonVisitOf(row, row.pickup));
    const courierIds = [
      ...new Set([
        ...visits.flatMap((visit) => (visit ? [visit.ramasseurId] : [])),
        ...rows.flatMap((row) => (row.ramasseurId ? [row.ramasseurId] : [])),
      ]),
    ];
    const couriers = await this.prisma.courier.findMany({
      where: { id: { in: courierIds } },
      select: { id: true, user: { select: { id: true, firstName: true, lastName: true } } },
    });
    const ref = (courierId: string) => {
      const found = couriers.find((courier) => courier.id === courierId);
      return found
        ? { userId: found.user.id, firstName: found.user.firstName, lastName: found.user.lastName }
        : null;
    };
    return rows.map((row, index) => {
      const visit = visits[index];
      const enRoute = row.status === 'EN_ROUTE' && row.ramasseurId;
      return {
        id: row.id,
        number: row.number,
        status: row.status,
        seller: row.seller,
        preparedAt: row.preparedAt,
        enRouteAt: row.enRouteAt,
        remisAt: row.remisAt,
        archivedAt: row.archivedAt,
        visit: enRoute
          ? {
              ramasseur: ref(row.ramasseurId!),
              plannedDate: null,
              viaPickup: row.pickupId !== null,
            }
          : visit && row.status === 'PREPARE'
            ? {
                ramasseur: ref(visit.ramasseurId),
                plannedDate: documentDateKey(visit.plannedDate),
                viaPickup: visit.viaPickup,
              }
            : null,
        lines: row.parcels
          .map((line) => ({
            code: line.parcel.code,
            recipientName: line.parcel.recipientName,
            productDescription: line.parcel.productDescription,
            itemType: line.itemType,
            received: line.receivedAt !== null,
            receivedAt: line.receivedAt,
          }))
          .sort((a, b) => a.code.localeCompare(b.code)),
        pendingCount: row.parcels.filter((line) => line.receivedAt === null).length,
      };
    });
  }

  /** A ramasseur and a day for a bon with no planned pickup (answer 4). */
  async assign(id: string, input: AssignBonValues) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "bons_retour" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const bon = await tx.bonRetour.findUnique({ where: { id } });
      if (!bon) throw introuvable();
      if (bon.status !== 'PREPARE') {
        throw apiError(409, 'BON_NON_PREPARE', 'Seul un bon préparé peut être affecté');
      }
      const courierId = await assignableRamasseur(tx, input.ramasseurId);
      if (input.date < tunisDayKey(this.clock.now())) {
        throw apiError(409, 'DATE_PASSEE', 'Choisissez aujourd’hui ou un jour à venir');
      }
      await tx.bonRetour.update({
        where: { id },
        data: { pickupId: null, ramasseurId: courierId, plannedDate: dateColumn(input.date) },
      });
    });
    return this.detail(id);
  }

  // ── Préparation retours (the station) ─────────────────────

  /**
   * A parcel scanned in Préparation retours (D-81): a return at the depot
   * joins its seller's open bon; the delivered échange parcel's code puts its
   * old item on the bon, with no fee (A-10). The caller has locked the parcel
   * and stored the scan; this runs in its transaction.
   */
  async prepareFromScan(
    tx: Db,
    actor: UserPrincipal,
    parcel: Parcel,
    scanId: string,
  ): Promise<ScanStep> {
    if (parcel.status === ParcelStatus.LIVRE) {
      const waiting =
        parcel.isExchange &&
        parcel.exchangeItemCollected &&
        parcel.exchangeItemStatus === ParcelStatus.RETOUR_AU_DEPOT;
      if (!waiting) return { ok: false, refusal: ScanRefusal.ARTICLE_NON_RECUPERE };
      const already = await tx.bonRetourParcel.count({
        where: { parcelId: parcel.id, itemType: 'ARTICLE_RECUPERE' },
      });
      if (already > 0) return { ok: false, refusal: ScanRefusal.DEJA_SUR_BON_RETOUR };
      const bon = await this.openBonOf(tx, actor, parcel.sellerId);
      await tx.bonRetourParcel.create({
        data: { bonRetourId: bon.id, parcelId: parcel.id, itemType: 'ARTICLE_RECUPERE' },
      });
      await this.recount(tx, bon.id);
      await this.events.recordExchangeItemPrepared(tx, {
        parcelId: parcel.id,
        actor,
        scanId,
        bonNumber: bon.number,
      });
      return { ok: true, message: `Ancien article ajouté au ${bon.number}` };
    }

    const onBon = await tx.bonRetourParcel.count({
      where: { parcelId: parcel.id, itemType: 'COLIS', ...OPEN_LINE },
    });
    if (onBon > 0) return { ok: false, refusal: ScanRefusal.DEJA_SUR_BON_RETOUR };
    const outcome = await this.events.apply(tx, {
      parcelId: parcel.id,
      actor,
      request: { action: ParcelAction.SCAN_PREPARATION_RETOURS },
      context: { scanId },
    });
    if (!outcome.ok) return { ok: false, refusal: outcome.refusal };
    const bon = await this.openBonOf(tx, actor, parcel.sellerId);
    await tx.bonRetourParcel.upsert({
      where: {
        bonRetourId_parcelId_itemType: {
          bonRetourId: bon.id,
          parcelId: parcel.id,
          itemType: 'COLIS',
        },
      },
      create: { bonRetourId: bon.id, parcelId: parcel.id, itemType: 'COLIS' },
      update: { receivedAt: null, scanId: null },
    });
    await this.recount(tx, bon.id);
    return { ok: true, message: `Ajouté au ${bon.number}` };
  }

  /** Undoing a Préparation retours scan (D-54): the line leaves the bon, the item waits again. */
  async unprepare(tx: Db, parcelId: string): Promise<void> {
    const line = await tx.bonRetourParcel.findFirst({
      where: { parcelId, receivedAt: null, bonRetour: { status: 'PREPARE' } },
      orderBy: { bonRetour: { preparedAt: 'desc' } },
    });
    if (!line) return;
    await tx.bonRetourParcel.delete({
      where: {
        bonRetourId_parcelId_itemType: {
          bonRetourId: line.bonRetourId,
          parcelId,
          itemType: line.itemType,
        },
      },
    });
    await this.recount(tx, line.bonRetourId);
  }

  /** The seller's open Préparé bon de retour, created with its number when there is none. */
  private async openBonOf(tx: Db, actor: UserPrincipal, sellerId: string) {
    await tx.$queryRaw`SELECT "id" FROM "sellers" WHERE "id" = ${sellerId}::uuid FOR UPDATE`;
    const open = await tx.bonRetour.findFirst({
      where: { sellerId, status: 'PREPARE', cancelledAt: null },
      orderBy: { preparedAt: 'desc' },
    });
    if (open) return open;
    const now = this.clock.now();
    const pickup = await tx.pickup.findFirst({
      where: { sellerId, status: 'PLANIFIE', plannedDate: { gte: dateColumn(tunisDayKey(now)) } },
      orderBy: [{ plannedDate: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    return tx.bonRetour.create({
      data: {
        number: await nextDocumentNumber(tx, 'BON_RETOUR', now),
        sellerId,
        qrToken: newBonToken(),
        preparedByUserId: actor.userId,
        preparedAt: now,
        pickupId: pickup?.id ?? null,
      },
    });
  }

  private async recount(tx: Db, bonRetourId: string): Promise<void> {
    const parcelCount = await tx.bonRetourParcel.count({ where: { bonRetourId } });
    await tx.bonRetour.update({ where: { id: bonRetourId }, data: { parcelCount } });
  }

  // ── Retour reçu (the ramasseur) ───────────────────────────

  /**
   * Retour reçu (Coursier 4.6, D-81): a parcel on a bon de retour he
   * carries, or the old item of an échange on it. The bon is Remis once
   * every line is received. The caller has locked the parcel and stored the
   * scan; this runs in its transaction.
   */
  async receiveFromScan(
    tx: Db,
    actor: UserPrincipal,
    parcel: Parcel,
    scan: { id: string; deviceTime: Date; source: ScanSource },
  ): Promise<ScanStep> {
    const item = parcel.status === ParcelStatus.LIVRE;
    const line = await tx.bonRetourParcel.findFirst({
      where: {
        parcelId: parcel.id,
        itemType: item ? 'ARTICLE_RECUPERE' : 'COLIS',
        receivedAt: null,
        bonRetour: { status: 'EN_ROUTE', ramasseurId: actor.courierId ?? '' },
      },
      include: { bonRetour: { select: { id: true, number: true } } },
    });
    if (!line) {
      if (item || parcel.status === ParcelStatus.RETOUR_EN_ROUTE) {
        return { ok: false, refusal: ScanRefusal.RETOUR_HORS_BON };
      }
      // Anything else is the state machine's to explain (déjà reçu, mauvais mode…).
      const outcome = await this.events.apply(tx, {
        parcelId: parcel.id,
        actor,
        request: { action: ParcelAction.SCAN_RETOUR_RECU },
        context: { scanId: scan.id },
      });
      if (outcome.ok) throw new Error('Retour reçu hors bon accepté');
      return { ok: false, refusal: outcome.refusal };
    }

    if (item) {
      await tx.parcel.update({
        where: { id: parcel.id },
        data: { exchangeItemStatus: ParcelStatus.RETOUR_RECU },
      });
    } else {
      const outcome = await this.events.apply(tx, {
        parcelId: parcel.id,
        actor,
        request: { action: ParcelAction.SCAN_RETOUR_RECU },
        context: { scanId: scan.id, source: scan.source, deviceTime: scan.deviceTime },
      });
      if (!outcome.ok) return { ok: false, refusal: outcome.refusal };
    }
    const now = this.clock.now();
    await tx.bonRetourParcel.update({
      where: {
        bonRetourId_parcelId_itemType: {
          bonRetourId: line.bonRetourId,
          parcelId: parcel.id,
          itemType: line.itemType,
        },
      },
      data: { receivedAt: now, scanId: scan.id },
    });
    const lines = await tx.bonRetourParcel.findMany({ where: { bonRetourId: line.bonRetourId } });
    if (bonRetourComplete(lines.map((l) => ({ received: l.receivedAt !== null })))) {
      await tx.bonRetour.update({
        where: { id: line.bonRetourId },
        data: { status: 'REMIS', remisAt: now },
      });
    }
    return {
      ok: true,
      message: item
        ? `Ancien article rendu · ${line.bonRetour.number}`
        : `Retour reçu · ${line.bonRetour.number}`,
    };
  }
}
