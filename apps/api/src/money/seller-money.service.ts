import { Injectable } from '@nestjs/common';
import {
  addTunisDays,
  aRecevoirOf,
  deliveryRateBps,
  tunisDayStart,
  type ARecevoir,
} from '@faffago/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { BonsRetourService } from './bons-retour.service';
import { BonsVersementService } from './bons-versement.service';

export interface DeliveryRate {
  delivered: number;
  returned: number;
  /** Null when nothing ended in the period: shown "—". */
  rateBps: number | null;
  days: { day: string; delivered: number; returned: number }[];
}

/**
 * What the seller sees of his money (Vendeur 4.1, 4.11, 4.12, D-83). Always
 * scoped by the seller of the session; the caller passes it.
 */
@Injectable()
export class SellerMoneyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bonsVersement: BonsVersementService,
    private readonly bonsRetour: BonsRetourService,
  ) {}

  /** À recevoir (D-83): the delivered parcels not yet paid, and the other fees waiting. */
  async aRecevoir(sellerId: string) {
    const [parcels, charges] = await Promise.all([
      this.prisma.parcel.findMany({
        where: { sellerId, status: 'LIVRE', cashStatus: { in: ['CHEZ_LE_COURSIER', 'AU_DEPOT'] } },
        orderBy: { deliveredAt: 'desc' },
        select: {
          code: true,
          recipientName: true,
          deliveredAt: true,
          cashStatus: true,
          codAmountMillimes: true,
          deliveryFeeMillimes: true,
          bonVersementLines: {
            where: { releasedAt: null },
            select: { bonVersement: { select: { number: true, status: true } } },
          },
        },
      }),
      this.prisma.sellerCharge.findMany({
        where: { sellerId, status: 'EN_ATTENTE', type: { not: 'LIVRAISON' } },
        select: { amountMillimes: true },
      }),
    ]);
    const totals: ARecevoir = aRecevoirOf(
      parcels,
      charges.map((charge) => charge.amountMillimes),
    );
    return {
      ...totals,
      parcels: parcels.map((parcel) => ({
        code: parcel.code,
        recipientName: parcel.recipientName,
        deliveredAt: parcel.deliveredAt,
        cashStatus: parcel.cashStatus!,
        codMillimes: parcel.codAmountMillimes,
        deliveryFeeMillimes: parcel.deliveryFeeMillimes,
        netMillimes: parcel.codAmountMillimes - parcel.deliveryFeeMillimes,
        bon: parcel.bonVersementLines[0]?.bonVersement ?? null,
      })),
    };
  }

  /** Paiements (Vendeur 4.11): À recevoir and his bons de versement. */
  async paiements(sellerId: string) {
    const [aRecevoir, bons] = await Promise.all([
      this.aRecevoir(sellerId),
      this.bonsVersement.list({ sellerId }),
    ]);
    // A bon he never received is not his to read: cancelled ones stay staff-side.
    return { aRecevoir, bons: bons.filter((bon) => bon.status !== 'ANNULE') };
  }

  /** Retours (Vendeur 4.12): his returns on their way back, and his bons de retour. */
  async retours(sellerId: string) {
    const [open, history] = await Promise.all([
      this.bonsRetour.bySeller(sellerId),
      this.bonsRetour.list({ sellerId }),
    ]);
    const received = await this.prisma.parcel.count({ where: { sellerId, status: 'RETOUR_RECU' } });
    return {
      returns: open[0]?.returns ?? [],
      bons: history.filter((bon) => bon.status !== 'ANNULE'),
      receivedCount: received,
    };
  }

  /** The menu badges (Vendeur 3, D-83): bons on their way to him. */
  async badges(sellerId: string) {
    const [versement, retour] = await Promise.all([
      this.prisma.bonVersement.count({ where: { sellerId, status: 'EN_ROUTE' } }),
      this.prisma.bonRetour.count({ where: { sellerId, status: 'EN_ROUTE' } }),
    ]);
    return { bonsVersementEnRoute: versement, bonsRetourEnRoute: retour };
  }

  /** À traiter (Vendeur 4.1): bons on their way, returns at the depot. */
  async aTraiter(sellerId: string) {
    const [badges, retoursAuDepot] = await Promise.all([
      this.badges(sellerId),
      this.prisma.parcel.count({ where: { sellerId, status: 'RETOUR_AU_DEPOT' } }),
    ]);
    return { ...badges, retoursAuDepot };
  }

  /**
   * Taux de livraison over the dashboard's period (D-48, D-83): distinct
   * parcels delivered, and received back, on the Tunis day of their event —
   * the phone's clock for a scan — a cancelled scan taken back (A-11).
   */
  async deliveryRate(sellerId: string, from: string, to: string): Promise<DeliveryRate> {
    const start = tunisDayStart(from);
    const end = tunisDayStart(addTunisDays(to, 1));
    const rows = await this.prisma.$queryRaw<{ day: string; type: string; parcels: number }[]>`
      SELECT to_char((COALESCE(e."deviceTime", e."serverTime") + INTERVAL '1 hour'), 'YYYY-MM-DD') AS "day",
             e."type"::text AS "type",
             COUNT(DISTINCT e."parcelId")::int AS "parcels"
      FROM "parcel_events" e
      JOIN "parcels" p ON p."id" = e."parcelId"
      LEFT JOIN "scans" s ON s."id" = e."scanId"
      WHERE p."sellerId" = ${sellerId}::uuid
        AND e."type" IN ('LIVRAISON'::"ParcelEventType", 'RETOUR_RECU'::"ParcelEventType")
        AND COALESCE(e."deviceTime", e."serverTime") >= ${start}
        AND COALESCE(e."deviceTime", e."serverTime") < ${end}
        AND s."cancelledAt" IS NULL
      GROUP BY 1, 2
      ORDER BY 1
    `;
    // A parcel counts once over the period, whatever its day.
    const totals = await this.prisma.$queryRaw<{ type: string; parcels: number }[]>`
      SELECT e."type"::text AS "type", COUNT(DISTINCT e."parcelId")::int AS "parcels"
      FROM "parcel_events" e
      JOIN "parcels" p ON p."id" = e."parcelId"
      LEFT JOIN "scans" s ON s."id" = e."scanId"
      WHERE p."sellerId" = ${sellerId}::uuid
        AND e."type" IN ('LIVRAISON'::"ParcelEventType", 'RETOUR_RECU'::"ParcelEventType")
        AND COALESCE(e."deviceTime", e."serverTime") >= ${start}
        AND COALESCE(e."deviceTime", e."serverTime") < ${end}
        AND s."cancelledAt" IS NULL
      GROUP BY 1
    `;
    const delivered = totals.find((row) => row.type === 'LIVRAISON')?.parcels ?? 0;
    const returned = totals.find((row) => row.type === 'RETOUR_RECU')?.parcels ?? 0;
    const days: DeliveryRate['days'] = [];
    for (let day = from; day <= to; day = addTunisDays(day, 1)) {
      const of = (type: string) =>
        rows.find((row) => row.day === day && row.type === type)?.parcels ?? 0;
      days.push({ day, delivered: of('LIVRAISON'), returned: of('RETOUR_RECU') });
      if (days.length > 366) break;
    }
    return { delivered, returned, rateBps: deliveryRateBps(delivered, returned), days };
  }
}
