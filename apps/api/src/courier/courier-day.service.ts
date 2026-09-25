import { Inject, Injectable } from '@nestjs/common';
import {
  ParcelCashStatus,
  ParcelLocation,
  ParcelStatus,
  Role,
  ScanAction,
  businessDateOf,
  documentDateKey,
  sumMillimes,
  type Millimes,
} from '@faffago/shared';
import type { UserPrincipal } from '../auth/principal';
import { CLOCK, type Clock } from '../common/clock';
import { PrismaService } from '../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { AddressMemoryService, type AddressMemoryView } from './address-memory.service';

/** One stop of Ma tournée, as the livreur reads it (Coursier 4.2, 4.3). */
export interface CourierStopView {
  code: string;
  status: string;
  recipientName: string;
  recipientPhone: string;
  recipientPhone2: string | null;
  address: string;
  landmark: string | null;
  localiteNameFr: string;
  localiteNameAr: string | null;
  delegationNameFr: string;
  delegationNameAr: string;
  codAmountMillimes: Millimes;
  /** This attempt, e.g. 2 of 3. */
  attemptNumber: number;
  maxAttempts: number;
  /** The seller's note to the courier. */
  sellerNote: string | null;
  isExchange: boolean;
  openingAllowed: boolean;
  relaunchDate: string | null;
  relaunchSlot: string | null;
  relaunchOrigin: string | null;
  lastFailureReason: string | null;
  shopName: string;
  /** The courier sees the seller's phone (Coursier rule 12). */
  sellerPhone: string;
  meetingPoint: string | null;
  memory: AddressMemoryView | null;
}

/**
 * The courier's own day: Ma tournée and Retour au dépôt (livreur), Ma caisse,
 * Profil. Always the principal's own work, never another courier's
 * (Coursier 1: "he only sees his own work").
 */
@Injectable()
export class CourierDayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly memory: AddressMemoryService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Ma tournée (Coursier 4.2): what he carries to deliver; Retour au dépôt
   * (4.5): the failed parcels he must bring back tonight; and how many stops
   * he has done today, by the phone's day (A-12).
   */
  async tour(actor: UserPrincipal) {
    const now = this.clock.now();
    const { settings } = await this.settings.current();
    const courierId = actor.courierId ?? '';
    const carried = await this.prisma.parcel.findMany({
      where: { currentLivreurId: courierId, location: ParcelLocation.AVEC_LE_LIVREUR },
      orderBy: [{ delegation: { nameFr: 'asc' } }, { localite: { nameFr: 'asc' } }, { code: 'asc' }],
      include: {
        seller: { select: { shopName: true, contactPhone: true } },
        localite: { select: { nameFr: true, nameAr: true } },
        delegation: { select: { nameFr: true, nameAr: true } },
      },
    });
    const memories = await this.memory.forPhones(carried.map((p) => p.recipientPhone));
    const done = await this.prisma.scan.findMany({
      where: {
        actorUserId: actor.userId,
        action: { in: [ScanAction.LIVRE, ScanAction.ECHEC] },
        accepted: true,
        cancelledAt: null,
        businessDate: businessDateOf(now),
      },
      distinct: ['parcelId'],
      select: { parcelId: true },
    });

    const stop = (p: (typeof carried)[number]): CourierStopView => ({
      code: p.code,
      status: p.status,
      recipientName: p.recipientName,
      recipientPhone: p.recipientPhone,
      recipientPhone2: p.recipientPhone2,
      address: p.address,
      landmark: p.landmark,
      localiteNameFr: p.localite.nameFr,
      localiteNameAr: p.localite.nameAr,
      delegationNameFr: p.delegation.nameFr,
      delegationNameAr: p.delegation.nameAr,
      codAmountMillimes: p.codAmountMillimes,
      attemptNumber: p.status === ParcelStatus.EN_LIVRAISON ? p.attemptCount + 1 : p.attemptCount,
      maxAttempts: settings.maxDeliveryAttempts,
      sellerNote: p.courierNote,
      isExchange: p.isExchange,
      openingAllowed: p.openingAllowed,
      relaunchDate: p.relaunchDate ? documentDateKey(p.relaunchDate) : null,
      relaunchSlot: p.relaunchSlot,
      relaunchOrigin: p.relaunchOrigin,
      lastFailureReason: p.lastFailureReason,
      shopName: p.seller.shopName,
      sellerPhone: p.seller.contactPhone,
      meetingPoint: p.meetingPoint,
      memory: memories.get(p.recipientPhone) ?? null,
    });

    const toDeliver = carried.filter((p) => p.status === ParcelStatus.EN_LIVRAISON).map(stop);
    const toBringBack = carried.filter((p) => p.status !== ParcelStatus.EN_LIVRAISON).map(stop);
    return {
      toDeliver,
      toBringBack,
      doneToday: done.length,
      serverTime: now.toISOString(),
    };
  }

  /**
   * Ma caisse (Coursier 4.7): the cash of his deliveries not yet handed to the
   * depot, parcel by parcel. The ramasseur's bon cash comes with the bons in
   * phase 8 (D-61); the depot's count and the écart with the Caisse (phase 8).
   */
  async cash(actor: UserPrincipal) {
    const parcels =
      actor.role === Role.LIVREUR
        ? await this.prisma.parcel.findMany({
            where: {
              currentLivreurId: actor.courierId ?? '',
              status: ParcelStatus.LIVRE,
              cashStatus: ParcelCashStatus.CHEZ_LE_COURSIER,
            },
            orderBy: { deliveredAt: 'asc' },
            select: {
              code: true,
              recipientName: true,
              codAmountMillimes: true,
              deliveredAt: true,
            },
          })
        : [];
    return {
      parcels,
      totalMillimes: sumMillimes(parcels.map((p) => p.codAmountMillimes)),
    };
  }

  /** Profil (Coursier 4.12): read-only, set by the admin; language on the phone. */
  async profile(actor: UserPrincipal) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.userId },
      include: {
        courier: {
          include: { zoneAssignments: { include: { zone: { select: { name: true } } } } },
        },
      },
    });
    const { settings } = await this.settings.current();
    return {
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      role: user.role,
      langue: user.langue,
      // Ramasseurs are paid by HR outside the app (Coursier 2).
      payPlan: user.role === Role.LIVREUR ? (user.courier?.payPlan ?? null) : null,
      zones: (user.courier?.zoneAssignments ?? [])
        .filter((a) => a.role === user.role)
        .map((a) => ({ name: a.zone.name, kind: a.kind }))
        .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name)),
      rules: {
        scanCancelWindowSeconds: settings.scanCancelWindowSeconds,
        maxDeliveryAttempts: settings.maxDeliveryAttempts,
      },
    };
  }

  async setLanguage(actor: UserPrincipal, langue: 'FR' | 'AR') {
    await this.prisma.user.update({ where: { id: actor.userId }, data: { langue } });
    return { langue };
  }
}
