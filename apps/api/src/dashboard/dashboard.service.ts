import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DASHBOARD_TILES,
  FailureReason,
  addTunisDays,
  countedEventTypes,
  dashboardTileOf,
  tunisDayKey,
  tunisDayStart,
  type DashboardQuery,
  type DashboardTile,
  type ParcelEventType,
} from '@faffago/shared';
import { sellerIdOf, type Principal } from '../auth/principal';
import { CLOCK, type Clock } from '../common/clock';
import { PrismaService } from '../common/prisma/prisma.service';
import { SellerMoneyService, type DeliveryRate } from '../money/seller-money.service';

export interface SellerDashboard {
  from: string;
  to: string;
  counts: Record<DashboardTile, number>;
  /** The money part (D-39, D-83): À recevoir, À traiter, and the rate over the same period. */
  aRecevoir: {
    parcelCount: number;
    chezLesCoursiersMillimes: bigint;
    auDepotMillimes: bigint;
    totalMillimes: bigint;
    fraisADeduireMillimes: bigint;
  };
  aTraiter: { bonsVersementEnRoute: number; bonsRetourEnRoute: number; retoursAuDepot: number };
  deliveryRate: DeliveryRate;
}

/**
 * Tableau de bord (Vendeur 4.1, D-48): what happened to the seller's parcels
 * over a period of Tunis days. The seller id comes from the session, never
 * from the request.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly money: SellerMoneyService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async forSeller(principal: Principal, query: DashboardQuery): Promise<SellerDashboard> {
    const sellerId = sellerIdOf(principal);
    const today = tunisDayKey(this.clock.now());
    const from = query.from ?? today;
    const to = query.to ?? today;
    const start = tunisDayStart(from);
    const end = tunisDayStart(addTunisDays(to, 1));
    const types = countedEventTypes().map((type) => Prisma.sql`${type}::"ParcelEventType"`);

    // Distinct parcels per event type, a postponement (D-9) apart from the
    // other failures. An event belongs to the day it was made: the phone's
    // clock for a scan, synced later or not (A-12), the server's otherwise.
    // A scan cancelled since (A-11) is taken back.
    const rows = await this.prisma.$queryRaw<
      { type: ParcelEventType; postponed: boolean; parcels: number }[]
    >`
      SELECT e."type"::text AS "type",
             COALESCE(e."reasonCode" = ${FailureReason.REPORTE_PAR_LE_CLIENT}::"FailureReason", false)
               AS "postponed",
             COUNT(DISTINCT e."parcelId")::int AS "parcels"
      FROM "parcel_events" e
      JOIN "parcels" p ON p."id" = e."parcelId"
      LEFT JOIN "scans" s ON s."id" = e."scanId"
      WHERE p."sellerId" = ${sellerId}::uuid
        AND e."type" IN (${Prisma.join(types)})
        AND COALESCE(e."deviceTime", e."serverTime") >= ${start}
        AND COALESCE(e."deviceTime", e."serverTime") < ${end}
        AND s."cancelledAt" IS NULL
      GROUP BY 1, 2
    `;

    const counts = Object.fromEntries(DASHBOARD_TILES.map((tile) => [tile, 0])) as Record<
      DashboardTile,
      number
    >;
    for (const row of rows) {
      const tile = dashboardTileOf({
        type: row.type,
        reasonCode: row.postponed ? FailureReason.REPORTE_PAR_LE_CLIENT : null,
      });
      if (tile) counts[tile] += row.parcels;
    }
    const [{ parcels: _parcels, ...aRecevoir }, aTraiter, deliveryRate] = await Promise.all([
      this.money.aRecevoir(sellerId),
      this.money.aTraiter(sellerId),
      this.money.deliveryRate(sellerId, from, to),
    ]);
    return { from, to, counts, aRecevoir, aTraiter, deliveryRate };
  }
}
