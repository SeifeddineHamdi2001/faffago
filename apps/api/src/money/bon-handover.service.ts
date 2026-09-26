import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  BonKind,
  CAISSE_REFUSAL_MESSAGES_FR,
  CaisseRefusal,
  CashTransition,
  ParcelAction,
  ScanRefusal,
  bonVisitOf,
  documentDateKey,
  parseBonScan,
  tunisDayKey,
  type HandOutBonsValues,
} from '@faffago/shared';
import type { UserPrincipal } from '../auth/principal';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { ParcelEventService } from '../parcels/parcel-event.service';
import { CaisseService } from './caisse.service';
import { RetenueService } from './retenue.service';
import type { ScanStep } from './bons-retour.service';

type Db = Prisma.TransactionClient;

/** The bons a ramasseur takes to one seller (Coursier 4.6, D-84). */
export interface SellerAEmporter {
  bonsVersement: {
    id: string;
    number: string;
    netMillimes: bigint;
    enMain: boolean;
    remis: boolean;
  }[];
  bonsRetour: {
    id: string;
    number: string;
    enMain: boolean;
    remis: boolean;
    lines: { code: string; itemType: string; received: boolean }[];
  }[];
}

/** What a bon scan found: the bon, or why not. */
export type BonScanStep =
  | { ok: true; message: string; bonVersementId?: string; bonRetourId?: string }
  | { ok: false; refusal: ScanRefusal; bonVersementId?: string; bonRetourId?: string };

/**
 * Bons travelling (D-80, D-81, D-84): handed to the ramasseur with their cash
 * at the Caisse, scanned Remis at the seller, scanned back Archivé at the
 * depot. Every step in the transaction of its scan or of its hand-out.
 */
@Injectable()
export class BonHandoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ParcelEventService,
    private readonly caisse: CaisseService,
    private readonly retenue: RetenueService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // ── The ramasseur's departure (answer 5) ──────────────────

  /** The active ramasseurs, with the bons planned for them up to today. */
  async ramasseurs() {
    const today = tunisDayKey(this.clock.now());
    const users = await this.prisma.user.findMany({
      where: { role: 'RAMASSEUR', isActive: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, courier: { select: { id: true } } },
    });
    const waiting = await this.waitingBons();
    return users.map((user) => ({
      userId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      bonsPrevus: waiting.filter(
        (bon) => bon.visit?.ramasseurId === user.courier?.id && bon.visitDay! <= today,
      ).length,
    }));
  }

  /** The bons to hand to one ramasseur: his, planned up to today, then every other one prepared. */
  async departure(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        firstName: true,
        lastName: true,
        courier: { select: { id: true } },
      },
    });
    if (!user?.courier || user.role !== 'RAMASSEUR') {
      throw apiError(
        404,
        CaisseRefusal.PAS_UN_COURSIER,
        CAISSE_REFUSAL_MESSAGES_FR.PAS_UN_COURSIER,
      );
    }
    const today = tunisDayKey(this.clock.now());
    const waiting = await this.waitingBons();
    const his = (bon: (typeof waiting)[number]) =>
      bon.visit?.ramasseurId === user.courier!.id && bon.visitDay! <= today;
    const view = (bon: (typeof waiting)[number]) => ({
      id: bon.id,
      kind: bon.kind,
      number: bon.number,
      shopName: bon.shopName,
      netMillimes: bon.netMillimes,
      lineCount: bon.lineCount,
      plannedDate: bon.visitDay,
    });
    return {
      ramasseur: { userId: user.id, firstName: user.firstName, lastName: user.lastName },
      prevus: waiting.filter(his).map(view),
      autres: waiting.filter((bon) => !his(bon)).map(view),
    };
  }

  private async waitingBons() {
    const [versement, retour] = await Promise.all([
      this.prisma.bonVersement.findMany({
        where: { status: 'PREPARE' },
        orderBy: { preparedAt: 'asc' },
        include: {
          seller: { select: { shopName: true } },
          pickup: { select: { status: true, ramasseurId: true, plannedDate: true } },
          _count: { select: { parcels: { where: { releasedAt: null } } } },
        },
      }),
      this.prisma.bonRetour.findMany({
        where: { status: 'PREPARE', parcels: { some: { receivedAt: null } } },
        orderBy: { preparedAt: 'asc' },
        include: {
          seller: { select: { shopName: true } },
          pickup: { select: { status: true, ramasseurId: true, plannedDate: true } },
          _count: { select: { parcels: { where: { receivedAt: null } } } },
        },
      }),
    ]);
    return [
      ...versement.map((bon) => ({ bon, kind: BonKind.BON_VERSEMENT, net: bon.netMillimes })),
      ...retour.map((bon) => ({ bon, kind: BonKind.BON_RETOUR, net: null })),
    ].map(({ bon, kind, net }) => {
      const visit = bonVisitOf(bon, bon.pickup);
      return {
        id: bon.id,
        kind,
        number: bon.number,
        shopName: bon.seller.shopName,
        netMillimes: net,
        lineCount: bon._count.parcels,
        visit,
        visitDay: visit ? documentDateKey(visit.plannedDate) : null,
      };
    });
  }

  /**
   * Hands bons to a ramasseur as he leaves (D-80, answer 5): each bon de
   * versement goes En route with its cash, added to his caisse of today; each
   * bon de retour's parcels go Retour en route with him (D-81). One
   * transaction: all or nothing.
   */
  async handOut(actor: UserPrincipal, input: HandOutBonsValues) {
    const today = tunisDayKey(this.clock.now());
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: input.ramasseurId },
        select: {
          role: true,
          isActive: true,
          acceptsWork: true,
          courier: { select: { id: true, accountState: true } },
        },
      });
      // No new bon reaches a courier who takes no new work (D-12).
      if (
        !user?.courier ||
        user.role !== 'RAMASSEUR' ||
        !user.isActive ||
        !user.acceptsWork ||
        user.courier.accountState !== 'ACTIF'
      ) {
        throw apiError(409, 'RAMASSEUR_INDISPONIBLE', 'Ramasseur indisponible');
      }
      const courierId = user.courier.id;
      const session = await this.caisse.lockedSession(tx, courierId, today);
      if (session.status === 'CLOTUREE') {
        throw apiError(
          409,
          CaisseRefusal.CAISSE_RAMASSEUR_CLOTUREE,
          CAISSE_REFUSAL_MESSAGES_FR.CAISSE_RAMASSEUR_CLOTUREE,
        );
      }
      const now = this.clock.now();

      for (const id of input.bonsVersement) {
        await tx.$queryRaw`SELECT "id" FROM "bons_versement" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const bon = await tx.bonVersement.findUnique({ where: { id } });
        if (!bon || bon.status !== 'PREPARE') {
          throw apiError(
            409,
            'BON_NON_PREPARE',
            `Bon ${bon?.number ?? ''} : il n’est plus préparé`.trim(),
          );
        }
        await tx.bonVersement.update({
          where: { id },
          data: { status: 'EN_ROUTE', ramasseurId: courierId, enRouteAt: now },
        });
        await tx.caisseSessionBon.upsert({
          where: {
            caisseSessionId_bonVersementId: { caisseSessionId: session.id, bonVersementId: id },
          },
          create: {
            caisseSessionId: session.id,
            bonVersementId: id,
            takenOutMillimes: bon.netMillimes,
          },
          update: { takenOutMillimes: bon.netMillimes, remisMillimes: 0n, returnedMillimes: 0n },
        });
      }

      for (const id of input.bonsRetour) {
        await tx.$queryRaw`SELECT "id" FROM "bons_retour" WHERE "id" = ${id}::uuid FOR UPDATE`;
        const bon = await tx.bonRetour.findUnique({
          where: { id },
          include: { parcels: { where: { receivedAt: null } } },
        });
        if (!bon || bon.status !== 'PREPARE' || bon.parcels.length === 0) {
          throw apiError(
            409,
            'BON_NON_PREPARE',
            `Bon ${bon?.number ?? ''} : rien à remettre`.trim(),
          );
        }
        for (const line of bon.parcels) {
          if (line.itemType === 'COLIS') {
            const outcome = await this.events.apply(tx, {
              parcelId: line.parcelId,
              actor,
              request: { action: ParcelAction.DEPART_RETOUR },
              context: { details: { bonRetour: bon.number } },
            });
            if (!outcome.ok) {
              const parcel = await tx.parcel.findUniqueOrThrow({ where: { id: line.parcelId } });
              throw apiError(409, outcome.refusal, `${parcel.code} : ${outcome.message}`);
            }
          } else {
            await tx.parcel.update({
              where: { id: line.parcelId },
              data: { exchangeItemStatus: 'RETOUR_EN_ROUTE' },
            });
          }
        }
        await tx.bonRetour.update({
          where: { id },
          data: { status: 'EN_ROUTE', ramasseurId: courierId, enRouteAt: now },
        });
      }
    });
    return this.caisse.session(input.ramasseurId, today);
  }

  // ── The ramasseur's app (D-84) ────────────────────────────

  /**
   * À emporter, by seller: the bons he carries (En route), the ones he
   * handed over today (Remis), and the ones prepared for his visits up to
   * today that the depot has still to give him.
   */
  async aEmporter(courierId: string, todayKey: string) {
    const today = new Date(`${todayKey}T00:00:00.000Z`);
    const since = new Date(today.getTime() - 60 * 60_000); // Tunis midnight
    const mine = (extra: object) => ({
      OR: [
        { status: 'EN_ROUTE' as const, ramasseurId: courierId },
        { status: 'REMIS' as const, ramasseurId: courierId, remisAt: { gte: since } },
        {
          status: 'PREPARE' as const,
          OR: [
            {
              pickup: {
                ramasseurId: courierId,
                status: 'PLANIFIE' as const,
                plannedDate: { lte: today },
              },
            },
            { pickupId: null, ramasseurId: courierId, plannedDate: { lte: today } },
          ],
        },
      ],
      ...extra,
    });
    const [versement, retour] = await Promise.all([
      this.prisma.bonVersement.findMany({
        where: mine({}),
        orderBy: { preparedAt: 'asc' },
        select: { id: true, number: true, status: true, netMillimes: true, sellerId: true },
      }),
      this.prisma.bonRetour.findMany({
        where: mine({}),
        orderBy: { preparedAt: 'asc' },
        select: {
          id: true,
          number: true,
          status: true,
          sellerId: true,
          parcels: {
            select: { itemType: true, receivedAt: true, parcel: { select: { code: true } } },
          },
        },
      }),
    ]);
    const bySeller = new Map<string, SellerAEmporter>();
    const entry = (sellerId: string) => {
      if (!bySeller.has(sellerId)) bySeller.set(sellerId, { bonsVersement: [], bonsRetour: [] });
      return bySeller.get(sellerId)!;
    };
    for (const bon of versement) {
      entry(bon.sellerId).bonsVersement.push({
        id: bon.id,
        number: bon.number,
        netMillimes: bon.netMillimes,
        enMain: bon.status === 'EN_ROUTE',
        remis: bon.status === 'REMIS',
      });
    }
    for (const bon of retour) {
      entry(bon.sellerId).bonsRetour.push({
        id: bon.id,
        number: bon.number,
        enMain: bon.status === 'EN_ROUTE',
        remis: bon.status === 'REMIS',
        lines: bon.parcels
          .map((line) => ({
            code: line.parcel.code,
            itemType: line.itemType,
            received: line.receivedAt !== null,
          }))
          .sort((a, b) => a.code.localeCompare(b.code)),
      });
    }
    return bySeller;
  }

  // ── Scans ─────────────────────────────────────────────────

  /**
   * The ramasseur scans a bon de versement's QR at the seller (Coursier 4.6):
   * a bon he carries, En route, becomes Remis and every parcel on it Payé.
   * A QR of a bon de retour is the wrong step.
   */
  async remisFromScan(
    tx: Db,
    actor: UserPrincipal,
    scan: { id: string; rawCode: string; deviceTime: Date },
  ): Promise<BonScanStep> {
    const read = parseBonScan(scan.rawCode);
    if (!read) return { ok: false, refusal: ScanRefusal.BON_INCONNU };
    if (read.kind !== BonKind.BON_VERSEMENT)
      return { ok: false, refusal: ScanRefusal.MAUVAIS_MODE };
    const found = await tx.bonVersement.findFirst({
      where: read.token ? { qrToken: read.token } : { number: read.number! },
      select: { id: true },
    });
    if (!found) return { ok: false, refusal: ScanRefusal.BON_INCONNU };
    await tx.$queryRaw`SELECT "id" FROM "bons_versement" WHERE "id" = ${found.id}::uuid FOR UPDATE`;
    const bon = await tx.bonVersement.findUniqueOrThrow({ where: { id: found.id } });
    const ids = { bonVersementId: bon.id };
    if (bon.status !== 'EN_ROUTE')
      return { ok: false, refusal: ScanRefusal.BON_PAS_EN_ROUTE, ...ids };
    if (bon.ramasseurId !== actor.courierId) {
      return { ok: false, refusal: ScanRefusal.BON_AUTRE_RAMASSEUR, ...ids };
    }

    const now = this.clock.now();
    await tx.bonVersement.update({
      where: { id: bon.id },
      data: { status: 'REMIS', remisAt: now, remisScanId: scan.id },
    });
    // The retenue is paid now: its certificate, numbered this year (D-89).
    await this.retenue.issueAtRemis(tx, bon.id, now);
    const lines = await tx.bonVersementParcel.findMany({
      where: { bonVersementId: bon.id, releasedAt: null },
    });
    for (const line of lines) {
      await this.events.recordCashTransition(tx, {
        parcelId: line.parcelId,
        actor,
        transition: CashTransition.BON_REMIS,
        scanId: scan.id,
        deviceTime: scan.deviceTime,
        metadata: { bonVersement: bon.number },
      });
    }
    // The cash left his hands: his caisse no longer expects it.
    const cashLine = await tx.caisseSessionBon.findFirst({
      where: { bonVersementId: bon.id, caisseSession: { status: { not: 'CLOTUREE' } } },
      orderBy: { caisseSession: { businessDate: 'desc' } },
    });
    if (cashLine) {
      await tx.caisseSessionBon.update({
        where: {
          caisseSessionId_bonVersementId: {
            caisseSessionId: cashLine.caisseSessionId,
            bonVersementId: bon.id,
          },
        },
        data: { remisMillimes: cashLine.takenOutMillimes },
      });
    }
    return { ok: true, message: `Bon ${bon.number} remis`, ...ids };
  }

  /** Archivage bons (Admin 4.2): the signed copy of a bon Remis comes back to the depot. */
  async archiveFromScan(tx: Db, actor: UserPrincipal, rawCode: string): Promise<BonScanStep> {
    const read = parseBonScan(rawCode);
    if (!read) return { ok: false, refusal: ScanRefusal.BON_INCONNU };
    const where = read.token ? { qrToken: read.token } : { number: read.number! };
    const now = this.clock.now();
    const archive = { status: 'ARCHIVE' as const, archivedAt: now, archivedByUserId: actor.userId };

    if (read.kind === BonKind.BON_VERSEMENT) {
      const bon = await tx.bonVersement.findFirst({ where });
      if (!bon) return { ok: false, refusal: ScanRefusal.BON_INCONNU };
      await tx.$queryRaw`SELECT "id" FROM "bons_versement" WHERE "id" = ${bon.id}::uuid FOR UPDATE`;
      const current = await tx.bonVersement.findUniqueOrThrow({ where: { id: bon.id } });
      const refusal = archiveRefusal(current.status);
      if (refusal) return { ok: false, refusal, bonVersementId: bon.id };
      await tx.bonVersement.update({ where: { id: bon.id }, data: archive });
      return { ok: true, message: `Bon ${bon.number} archivé`, bonVersementId: bon.id };
    }
    const bon = await tx.bonRetour.findFirst({ where });
    if (!bon) return { ok: false, refusal: ScanRefusal.BON_INCONNU };
    await tx.$queryRaw`SELECT "id" FROM "bons_retour" WHERE "id" = ${bon.id}::uuid FOR UPDATE`;
    const current = await tx.bonRetour.findUniqueOrThrow({ where: { id: bon.id } });
    const refusal = archiveRefusal(current.status);
    if (refusal) return { ok: false, refusal, bonRetourId: bon.id };
    await tx.bonRetour.update({ where: { id: bon.id }, data: archive });
    return { ok: true, message: `Bon ${bon.number} archivé`, bonRetourId: bon.id };
  }
}

function archiveRefusal(status: string): ScanRefusal | null {
  if (status === 'ARCHIVE') return ScanRefusal.BON_DEJA_ARCHIVE;
  if (status !== 'REMIS') return ScanRefusal.BON_PAS_REMIS;
  return null;
}

export type { ScanStep };
