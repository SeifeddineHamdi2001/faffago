import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  ParcelStatus,
  isVerifyDeadlineNear,
  sellerDecisionsFor,
  type FailureReason,
  type SellerDecisions,
} from '@faffago/shared';
import { sellerIdOf, type Principal } from '../auth/principal';
import { CLOCK, type Clock } from '../common/clock';
import { PrismaService } from '../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

/** One parcel waiting on its seller (Vendeur 4.9). */
export interface SellerVerifyItem {
  code: string;
  recipientName: string;
  recipientPhone: string;
  localiteNameFr: string;
  delegationNameFr: string;
  codAmountMillimes: bigint;
  failureReason: FailureReason | null;
  /** The courier's own words, which the seller reads (D-71). */
  courierFailureNote: string | null;
  attemptCount: number;
  maxAttempts: number;
  location: string;
  verifyDeadlineAt: Date | null;
  decisions: SellerDecisions;
  callCount: number;
}

export interface SellerVerifyList {
  /** The server's clock, so the screen counts down from the same instant. */
  now: Date;
  items: SellerVerifyItem[];
}

/** The menu badge and the Tableau de bord banner (in-app, notifications are post-launch). */
export interface SellerVerifySummary {
  now: Date;
  count: number;
  /** Under 24 hours left, soonest first. */
  urgent: { code: string; recipientName: string; verifyDeadlineAt: Date }[];
}

/** One line of Service client's follow-up (Admin 4.6). */
export interface FollowUpItem {
  code: string;
  shopName: string;
  /** The seller's contact, whom Service client chases (D-4, D-11). */
  sellerContactName: string;
  sellerContactPhone: string;
  recipientName: string;
  recipientPhone: string;
  recipientPhone2: string | null;
  delegationNameFr: string;
  failureReason: FailureReason | null;
  courierFailureNote: string | null;
  attemptCount: number;
  maxAttempts: number;
  location: string;
  verifyDeadlineAt: Date | null;
  lastCall: { calledAt: Date; answered: boolean; note: string | null } | null;
  callCount: number;
}

export interface FollowUpList {
  now: Date;
  items: FollowUpItem[];
}

const WITH_PLACE = {
  localite: { select: { nameFr: true } },
  delegation: { select: { nameFr: true } },
  _count: { select: { calls: true } },
} satisfies Prisma.ParcelInclude;

/**
 * Who is waiting on whom: the seller's À vérifier (Vendeur 4.9) and Service
 * client's follow-up (Admin 4.6), both sorted by time left, soonest first.
 */
@Injectable()
export class AVerifierQueriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async sellerList(principal: Principal): Promise<SellerVerifyList> {
    const { settings } = await this.settings.current();
    const limits = {
      maxAttempts: settings.maxDeliveryAttempts,
      maxClientChanges: settings.maxClientChangesPerParcel,
    };
    const rows = await this.prisma.parcel.findMany({
      where: { sellerId: sellerIdOf(principal), status: ParcelStatus.A_VERIFIER },
      orderBy: [{ verifyDeadlineAt: 'asc' }, { code: 'asc' }],
      include: WITH_PLACE,
    });
    return {
      now: this.clock.now(),
      items: rows.map((parcel) => ({
        code: parcel.code,
        recipientName: parcel.recipientName,
        recipientPhone: parcel.recipientPhone,
        localiteNameFr: parcel.localite.nameFr,
        delegationNameFr: parcel.delegation.nameFr,
        codAmountMillimes: parcel.codAmountMillimes,
        failureReason: parcel.lastFailureReason,
        courierFailureNote: parcel.lastFailureNote,
        attemptCount: parcel.attemptCount,
        maxAttempts: settings.maxDeliveryAttempts,
        location: parcel.location,
        verifyDeadlineAt: parcel.verifyDeadlineAt,
        decisions: sellerDecisionsFor(parcel, limits),
        callCount: parcel._count.calls,
      })),
    };
  }

  async sellerSummary(principal: Principal): Promise<SellerVerifySummary> {
    const now = this.clock.now();
    const rows = await this.prisma.parcel.findMany({
      where: { sellerId: sellerIdOf(principal), status: ParcelStatus.A_VERIFIER },
      orderBy: [{ verifyDeadlineAt: 'asc' }, { code: 'asc' }],
      select: { code: true, recipientName: true, verifyDeadlineAt: true },
    });
    return {
      now,
      count: rows.length,
      urgent: rows
        .filter(
          (row): row is typeof row & { verifyDeadlineAt: Date } =>
            row.verifyDeadlineAt !== null && isVerifyDeadlineNear(row.verifyDeadlineAt, now),
        )
        .map((row) => ({
          code: row.code,
          recipientName: row.recipientName,
          verifyDeadlineAt: row.verifyDeadlineAt,
        })),
    };
  }

  /** Every seller's À vérifier, for Admin and Service client (SUIVI_A_VERIFIER). */
  async followUp(): Promise<FollowUpList> {
    const { settings } = await this.settings.current();
    const rows = await this.prisma.parcel.findMany({
      where: { status: ParcelStatus.A_VERIFIER },
      orderBy: [{ verifyDeadlineAt: 'asc' }, { code: 'asc' }],
      include: {
        delegation: { select: { nameFr: true } },
        seller: {
          select: { shopName: true, contactFullName: true, contactPhone: true },
        },
        calls: { orderBy: { calledAt: 'desc' }, take: 1 },
        _count: { select: { calls: true } },
      },
    });
    return {
      now: this.clock.now(),
      items: rows.map((parcel) => {
        const last = parcel.calls[0];
        return {
          code: parcel.code,
          shopName: parcel.seller.shopName,
          sellerContactName: parcel.seller.contactFullName,
          sellerContactPhone: parcel.seller.contactPhone,
          recipientName: parcel.recipientName,
          recipientPhone: parcel.recipientPhone,
          recipientPhone2: parcel.recipientPhone2,
          delegationNameFr: parcel.delegation.nameFr,
          failureReason: parcel.lastFailureReason,
          courierFailureNote: parcel.lastFailureNote,
          attemptCount: parcel.attemptCount,
          maxAttempts: settings.maxDeliveryAttempts,
          location: parcel.location,
          verifyDeadlineAt: parcel.verifyDeadlineAt,
          lastCall: last
            ? { calledAt: last.calledAt, answered: last.answered, note: last.note }
            : null,
          callCount: parcel._count.calls,
        };
      }),
    };
  }
}
