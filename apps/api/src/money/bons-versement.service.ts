import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  BonKind,
  CHARGE_TYPE_LABELS_FR,
  PAYABLE_REFUSAL_MESSAGES_FR,
  PickupStatus,
  bonQrContent,
  bonVisitOf,
  buildBonVersement,
  documentDateKey,
  payableParcelRefusal,
  sumMillimes,
  tunisDayKey,
  type AssignBonValues,
  type ChargeType,
  type Millimes,
  type PrepareBonValues,
} from '@faffago/shared';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { UserPrincipal } from '../auth/principal';
import type { RequestMeta } from '../auth/sessions.service';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { dateColumn, newBonToken, nextDocumentNumber } from './document-numbers';

type Db = Prisma.TransactionClient;

const introuvable = () => apiError(404, 'BON_INTROUVABLE', 'Bon de versement introuvable');

export interface BonVisitView {
  ramasseur: { userId: string; firstName: string; lastName: string } | null;
  plannedDate: string | null;
  viaPickup: boolean;
}

export interface BonVersementView {
  id: string;
  number: string;
  status: string;
  seller: { id: string; shopName: string; contactFullName: string; contactPhone: string };
  preparedAt: Date;
  parcelCount: number;
  totalCodMillimes: Millimes;
  totalFeesMillimes: Millimes;
  baseAfterFeesMillimes: Millimes;
  sellerStatutSnapshot: string;
  retenueRateBps: number;
  retenueMillimes: Millimes;
  netMillimes: Millimes;
  visit: BonVisitView | null;
  enRouteAt: Date | null;
  remisAt: Date | null;
  archivedAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  /** The last Correction Faffa Go (D-88); the seller reads only that and its date. */
  correctedAt: Date | null;
}

export interface BonVersementDetail extends BonVersementView {
  qr: string;
  parcels: {
    code: string;
    recipientName: string;
    deliveredAt: Date | null;
    codMillimes: Millimes;
  }[];
  /** One line per fee, as printed (Vendeur 4.11). */
  charges: {
    type: ChargeType;
    label: string;
    parcelCode: string | null;
    amountMillimes: Millimes;
  }[];
}

const BON_INCLUDE = {
  seller: { select: { id: true, shopName: true, contactFullName: true, contactPhone: true } },
  pickup: { select: { status: true, ramasseurId: true, plannedDate: true } },
  _count: { select: { parcels: { where: { releasedAt: null } } } },
  corrections: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.BonVersementInclude;

type BonRow = Prisma.BonVersementGetPayload<{ include: typeof BON_INCLUDE }>;

/**
 * Bons de versement (Vendeur 4.11, Admin 4.10, D-80): prepared by the admin
 * alone, from the parcels whose cash is at the depot, with the fees oldest
 * first and never negative (A-2), the retenue on its own line (A-3), the
 * statut frozen on the bon (D-34). One transaction per bon.
 */
@Injectable()
export class BonsVersementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  // ── Paiements vendeurs ────────────────────────────────────

  /** Per seller: payable now, still with couriers, fees to deduct, bons under way (Admin 4.10). */
  async sellersSummary() {
    const [payable, withCouriers, charges, bons] = await Promise.all([
      this.prisma.parcel.groupBy({
        by: ['sellerId'],
        where: {
          status: 'LIVRE',
          cashStatus: 'AU_DEPOT',
          bonVersementLines: { none: { releasedAt: null } },
        },
        _sum: { codAmountMillimes: true },
        _count: { _all: true },
      }),
      this.prisma.parcel.groupBy({
        by: ['sellerId'],
        where: { status: 'LIVRE', cashStatus: 'CHEZ_LE_COURSIER' },
        _sum: { codAmountMillimes: true },
      }),
      this.prisma.sellerCharge.groupBy({
        by: ['sellerId'],
        where: { status: 'EN_ATTENTE' },
        _sum: { amountMillimes: true },
      }),
      this.prisma.bonVersement.groupBy({
        by: ['sellerId'],
        where: { status: { in: ['PREPARE', 'EN_ROUTE'] } },
        _count: { _all: true },
      }),
    ]);
    const ids = new Set([
      ...payable.map((row) => row.sellerId),
      ...withCouriers.map((row) => row.sellerId),
      ...charges.map((row) => row.sellerId),
      ...bons.map((row) => row.sellerId),
    ]);
    const sellers = await this.prisma.seller.findMany({
      where: { id: { in: [...ids] } },
      select: { id: true, shopName: true, statut: true },
      orderBy: { shopName: 'asc' },
    });
    const pick = <T extends { sellerId: string }>(rows: T[], id: string) =>
      rows.find((row) => row.sellerId === id);
    return sellers.map((seller) => ({
      seller,
      payableMillimes: pick(payable, seller.id)?._sum.codAmountMillimes ?? 0n,
      payableCount: pick(payable, seller.id)?._count._all ?? 0,
      withCouriersMillimes: pick(withCouriers, seller.id)?._sum.codAmountMillimes ?? 0n,
      pendingChargesMillimes: pick(charges, seller.id)?._sum.amountMillimes ?? 0n,
      bonsEnCours: pick(bons, seller.id)?._count._all ?? 0,
    }));
  }

  /** What the admin ticks, and what the preview computes with (Admin 4.10). */
  async sellerDetail(sellerId: string) {
    const seller = await this.prisma.seller.findUnique({
      where: { id: sellerId },
      select: { id: true, shopName: true, statut: true, contactFullName: true, contactPhone: true },
    });
    if (!seller) throw apiError(404, 'VENDEUR_INTROUVABLE', 'Vendeur introuvable');
    const [parcels, charges, bons, { settings }] = await Promise.all([
      this.prisma.parcel.findMany({
        where: {
          sellerId,
          status: 'LIVRE',
          cashStatus: 'AU_DEPOT',
          bonVersementLines: { none: { releasedAt: null } },
        },
        orderBy: { deliveredAt: 'asc' },
        select: {
          id: true,
          code: true,
          recipientName: true,
          deliveredAt: true,
          codAmountMillimes: true,
        },
      }),
      this.prisma.sellerCharge.findMany({
        where: { sellerId, status: 'EN_ATTENTE' },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          type: true,
          amountMillimes: true,
          createdAt: true,
          parcel: { select: { code: true } },
        },
      }),
      this.list({ sellerId }),
      this.settings.current(this.prisma),
    ]);
    return {
      seller,
      retenueRateBps: settings.retenueRateBps,
      parcels: parcels.map((parcel) => ({
        id: parcel.id,
        code: parcel.code,
        recipientName: parcel.recipientName,
        deliveredAt: parcel.deliveredAt,
        codMillimes: parcel.codAmountMillimes,
      })),
      charges: charges.map((charge) => ({
        id: charge.id,
        type: charge.type,
        label: CHARGE_TYPE_LABELS_FR[charge.type],
        amountMillimes: charge.amountMillimes,
        createdAt: charge.createdAt,
        parcelCode: charge.parcel?.code ?? null,
      })),
      soldeDebiteurMillimes: sumMillimes(charges.map((charge) => charge.amountMillimes)),
      bons,
    };
  }

  // ── Préparer le bon ───────────────────────────────────────

  async prepare(actor: UserPrincipal, input: PrepareBonValues): Promise<BonVersementDetail> {
    const id = await this.prisma.$transaction(async (tx) => {
      // One preparation per seller at a time: the charges and the parcels are his.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "sellers" WHERE "id" = ${input.sellerId}::uuid FOR UPDATE`;
      if (locked.length === 0) throw apiError(404, 'VENDEUR_INTROUVABLE', 'Vendeur introuvable');
      const seller = await tx.seller.findUniqueOrThrow({ where: { id: input.sellerId } });

      await tx.$queryRaw`SELECT "id" FROM "parcels" WHERE "id" = ANY(${input.parcelIds}::uuid[]) FOR UPDATE`;
      const parcels = await tx.parcel.findMany({
        where: { id: { in: input.parcelIds } },
        select: {
          id: true,
          code: true,
          sellerId: true,
          status: true,
          cashStatus: true,
          codAmountMillimes: true,
          bonVersementLines: { where: { releasedAt: null }, select: { bonVersementId: true } },
        },
      });
      if (parcels.length !== input.parcelIds.length) {
        throw apiError(409, 'COLIS_NON_PAYABLE', 'Un colis choisi est introuvable');
      }
      for (const parcel of parcels) {
        const refusal = payableParcelRefusal(
          { ...parcel, inActiveBon: parcel.bonVersementLines.length > 0 },
          seller.id,
        );
        if (refusal) {
          throw apiError(
            409,
            'COLIS_NON_PAYABLE',
            `${parcel.code} : ${PAYABLE_REFUSAL_MESSAGES_FR[refusal]}`,
            { parcelCode: parcel.code, reason: refusal },
          );
        }
      }

      await tx.$queryRaw`SELECT "id" FROM "seller_charges"
        WHERE "sellerId" = ${seller.id}::uuid AND "status" = 'EN_ATTENTE' FOR UPDATE`;
      const charges = await tx.sellerCharge.findMany({
        where: { sellerId: seller.id, status: 'EN_ATTENTE' },
      });
      const { settings } = await this.settings.current(tx);
      const built = buildBonVersement({
        parcels: parcels.map((parcel) => ({
          parcelId: parcel.id,
          codMillimes: parcel.codAmountMillimes,
        })),
        pendingCharges: charges.map((charge) => ({
          chargeId: charge.id,
          type: charge.type,
          amountMillimes: charge.amountMillimes,
          createdAt: charge.createdAt,
        })),
        sellerStatut: seller.statut,
        retenueRateBps: settings.retenueRateBps,
      });
      if (!built.generated) {
        throw apiError(409, 'RIEN_A_PAYER', 'Rien à payer : le total des colis choisis est nul');
      }

      const now = this.clock.now();
      const pickup = await this.nextPlannedPickup(tx, seller.id, tunisDayKey(now));
      const bon = await tx.bonVersement.create({
        data: {
          number: await nextDocumentNumber(tx, 'BON_VERSEMENT', now),
          sellerId: seller.id,
          totalCodMillimes: built.totalCodMillimes,
          totalFeesMillimes: built.totalFeesMillimes,
          baseAfterFeesMillimes: built.baseAfterFeesMillimes,
          sellerStatutSnapshot: seller.statut,
          retenueRateBps: built.retenueMillimes > 0n ? built.retenueRateBps : 0,
          retenueMillimes: built.retenueMillimes,
          netMillimes: built.netMillimes,
          qrToken: newBonToken(),
          preparedByUserId: actor.userId,
          preparedAt: now,
          pickupId: pickup?.id ?? null,
        },
      });
      await tx.bonVersementParcel.createMany({
        data: parcels.map((parcel) => ({
          bonVersementId: bon.id,
          parcelId: parcel.id,
          codMillimes: parcel.codAmountMillimes,
        })),
      });
      if (built.includedChargeIds.length > 0) {
        await tx.sellerCharge.updateMany({
          where: { id: { in: built.includedChargeIds } },
          data: { status: 'DEDUITE', bonVersementId: bon.id },
        });
      }
      return bon.id;
    });
    return this.detail(id);
  }

  /** The seller's next planned pickup, from today on: the bon travels with it (D-80). */
  private nextPlannedPickup(tx: Db, sellerId: string, today: string) {
    return tx.pickup.findFirst({
      where: { sellerId, status: 'PLANIFIE', plannedDate: { gte: dateColumn(today) } },
      orderBy: [{ plannedDate: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
  }

  // ── Reading ───────────────────────────────────────────────

  async list(filter: { sellerId?: string; status?: string } = {}): Promise<BonVersementView[]> {
    const rows = await this.prisma.bonVersement.findMany({
      where: {
        ...(filter.sellerId ? { sellerId: filter.sellerId } : {}),
        ...(filter.status ? { status: filter.status as never } : {}),
      },
      orderBy: { preparedAt: 'desc' },
      take: 200,
      include: BON_INCLUDE,
    });
    return this.views(rows);
  }

  /**
   * A bon, whole. For a seller, only his own: another's does not exist
   * (D-26), nor a cancelled one, which never reached him.
   */
  async detail(id: string, sellerId?: string): Promise<BonVersementDetail> {
    const row = await this.prisma.bonVersement.findUnique({ where: { id }, include: BON_INCLUDE });
    if (!row) throw introuvable();
    if (sellerId && (row.sellerId !== sellerId || row.status === 'ANNULE')) throw introuvable();
    const [view] = await this.views([row]);
    const [lines, charges] = await Promise.all([
      this.prisma.bonVersementParcel.findMany({
        where: { bonVersementId: id },
        include: { parcel: { select: { code: true, recipientName: true, deliveredAt: true } } },
        orderBy: { parcel: { deliveredAt: 'asc' } },
      }),
      // A cancelled bon gave its charges back: they are shown as they were only while it stands.
      this.prisma.sellerCharge.findMany({
        where: { bonVersementId: id },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        include: { parcel: { select: { code: true } } },
      }),
    ]);
    return {
      ...view!,
      qr: bonQrContent(BonKind.BON_VERSEMENT, row.qrToken),
      parcels: lines.map((line) => ({
        code: line.parcel.code,
        recipientName: line.parcel.recipientName,
        deliveredAt: line.parcel.deliveredAt,
        codMillimes: line.codMillimes,
      })),
      charges: charges.map((charge) => ({
        type: charge.type,
        label: CHARGE_TYPE_LABELS_FR[charge.type],
        parcelCode: charge.parcel?.code ?? null,
        amountMillimes: charge.amountMillimes,
      })),
    };
  }

  private async views(rows: BonRow[]): Promise<BonVersementView[]> {
    const visits = rows.map((row) => bonVisitOf(row, row.pickup));
    const courierIds = [...new Set(visits.flatMap((visit) => (visit ? [visit.ramasseurId] : [])))];
    const carriers = [
      ...new Set(
        rows.flatMap((row) =>
          row.status === 'EN_ROUTE' && row.ramasseurId ? [row.ramasseurId] : [],
        ),
      ),
    ];
    const couriers = await this.prisma.courier.findMany({
      where: { id: { in: [...courierIds, ...carriers] } },
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
        parcelCount: row._count.parcels,
        totalCodMillimes: row.totalCodMillimes,
        totalFeesMillimes: row.totalFeesMillimes,
        baseAfterFeesMillimes: row.baseAfterFeesMillimes,
        sellerStatutSnapshot: row.sellerStatutSnapshot,
        retenueRateBps: row.retenueRateBps,
        retenueMillimes: row.retenueMillimes,
        netMillimes: row.netMillimes,
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
        enRouteAt: row.enRouteAt,
        remisAt: row.remisAt,
        archivedAt: row.archivedAt,
        cancelledAt: row.cancelledAt,
        cancelReason: row.cancelReason,
        correctedAt: row.corrections[0]?.createdAt ?? null,
      };
    });
  }

  // ── Affecter, Annuler ─────────────────────────────────────

  /** A ramasseur and a day for a bon with no planned pickup (answer 4). */
  async assign(id: string, input: AssignBonValues): Promise<BonVersementDetail> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "bons_versement" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const bon = await tx.bonVersement.findUnique({ where: { id } });
      if (!bon) throw introuvable();
      if (bon.status !== 'PREPARE') {
        throw apiError(409, 'BON_NON_PREPARE', 'Seul un bon préparé peut être affecté');
      }
      const courierId = await assignableRamasseur(tx, input.ramasseurId);
      if (input.date < tunisDayKey(this.clock.now())) {
        throw apiError(409, 'DATE_PASSEE', 'Choisissez aujourd’hui ou un jour à venir');
      }
      await tx.bonVersement.update({
        where: { id },
        data: { pickupId: null, ramasseurId: courierId, plannedDate: dateColumn(input.date) },
      });
    });
    return this.detail(id);
  }

  /**
   * Annuler le bon (A-5): admin, Préparé only, with a reason, audited. The
   * parcels are free again, the charges back to En attente, the number kept.
   */
  async cancel(
    actor: UserPrincipal,
    id: string,
    reason: string,
    meta: RequestMeta,
  ): Promise<BonVersementDetail> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "bons_versement" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const bon = await tx.bonVersement.findUnique({ where: { id } });
      if (!bon) throw introuvable();
      if (bon.status !== 'PREPARE') {
        throw apiError(
          409,
          'BON_NON_ANNULABLE',
          'Seul un bon préparé, ou rapporté au dépôt, peut être annulé',
        );
      }
      const now = this.clock.now();
      const charges = await tx.sellerCharge.findMany({ where: { bonVersementId: id } });
      await tx.bonVersementParcel.updateMany({
        where: { bonVersementId: id, releasedAt: null },
        data: { releasedAt: now },
      });
      await tx.sellerCharge.updateMany({
        where: { bonVersementId: id },
        data: { status: 'EN_ATTENTE', bonVersementId: null },
      });
      await tx.bonVersement.update({
        where: { id },
        data: {
          status: 'ANNULE',
          cancelledAt: now,
          cancelledByUserId: actor.userId,
          cancelReason: reason,
          pickupId: null,
          ramasseurId: null,
          plannedDate: null,
        },
      });
      await this.audit.record(tx, {
        actor: { userId: actor.userId, role: actor.role },
        action: AuditAction.ANNULATION_BON_VERSEMENT,
        entityType: 'bon_versement',
        entityId: id,
        before: {
          numero: bon.number,
          statut: bon.status,
          net: bon.netMillimes.toString(),
          frais: charges.map((charge) => charge.id),
        },
        after: { statut: 'ANNULE' },
        reason,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    });
    return this.detail(id);
  }
}

/** A ramasseur's account, active and taking work (D-12), as his courier id. */
export async function assignableRamasseur(tx: Db, userId: string): Promise<string> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      isActive: true,
      acceptsWork: true,
      courier: { select: { id: true, accountState: true } },
    },
  });
  if (
    !user?.courier ||
    user.role !== 'RAMASSEUR' ||
    !user.isActive ||
    !user.acceptsWork ||
    user.courier.accountState !== 'ACTIF'
  ) {
    throw apiError(
      409,
      'RAMASSEUR_INDISPONIBLE',
      'Ramasseur indisponible : inactif ou ne reçoit plus de travail',
    );
  }
  return user.courier.id;
}

/**
 * Planning a pickup takes the seller's bons that wait for a visit: never
 * attached, or attached to a pickup cancelled or already done (D-80).
 */
export async function attachWaitingBons(tx: Db, pickup: { id: string; sellerId: string }) {
  const waiting = {
    sellerId: pickup.sellerId,
    status: 'PREPARE' as const,
    OR: [
      { pickupId: null, ramasseurId: null },
      { pickup: { status: { in: [PickupStatus.ANNULE, PickupStatus.EFFECTUE] } } },
    ],
  };
  await tx.bonVersement.updateMany({
    where: waiting,
    data: { pickupId: pickup.id, ramasseurId: null, plannedDate: null },
  });
  await tx.bonRetour.updateMany({
    where: waiting,
    data: { pickupId: pickup.id, ramasseurId: null, plannedDate: null },
  });
}
