import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type Pickup } from '@prisma/client';
import {
  PARCEL_MESSAGES,
  PICKUP_MESSAGES,
  ParcelErrorCode,
  ParcelStatus,
  PickupErrorCode,
  PickupStatus,
  canCancelPickup,
  documentDateKey,
  normalizeParcelCode,
  type PickupRequestValues,
} from '@faffago/shared';
import { sellerIdOf, type Principal, type UserPrincipal } from '../auth/principal';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import {
  PickupAddressesService,
  WITH_PLACE,
  addressView,
  type PickupAddressView,
} from './pickup-addresses.service';

type Tx = Prisma.TransactionClient;

/** A request still to be done: the only kind a parcel or an address can have one of. */
const OPEN: PickupStatus[] = [PickupStatus.DEMANDE, PickupStatus.PLANIFIE];

export interface PickupView {
  id: string;
  status: PickupStatus;
  requestedSlot: string | null;
  note: string | null;
  declaredCount: number | null;
  /** The parcels listed, or the number declared. */
  expectedCount: number;
  scannedCount: number;
  plannedDate: string | null;
  plannedSlot: string | null;
  /** First name only (Vendeur 1). */
  ramasseurFirstName: string | null;
  createdAt: Date;
  completedAt: Date | null;
  cancelledAt: Date | null;
  address: PickupAddressView;
}

export interface PickupDetail extends PickupView {
  /** Which parcels were picked up and which were not (Vendeur 4.5). */
  parcels: { code: string; recipientName: string; status: string; pickedUp: boolean }[];
}

export interface ReadyParcel {
  code: string;
  recipientName: string;
  delegationNameFr: string;
  codAmountMillimes: bigint;
  createdAt: Date;
}

const INCLUDE = {
  pickupAddress: { include: WITH_PLACE },
  ramasseur: { include: { user: { select: { firstName: true } } } },
  _count: { select: { parcels: true } },
} satisfies Prisma.PickupInclude;

type PickupWithAll = Prisma.PickupGetPayload<{ include: typeof INCLUDE }>;

function pickupView(pickup: PickupWithAll): PickupView {
  return {
    id: pickup.id,
    status: pickup.status,
    requestedSlot: pickup.requestedSlot,
    note: pickup.note,
    declaredCount: pickup.declaredCount,
    expectedCount: pickup._count.parcels || pickup.declaredCount || 0,
    scannedCount: pickup.scannedCount,
    plannedDate: pickup.plannedDate ? documentDateKey(pickup.plannedDate) : null,
    plannedSlot: pickup.plannedSlot,
    ramasseurFirstName: pickup.ramasseur?.user.firstName ?? null,
    createdAt: pickup.createdAt,
    completedAt: pickup.completedAt,
    cancelledAt: pickup.cancelledAt,
    address: addressView(pickup.pickupAddress),
  };
}

const ramassageIntrouvable = () =>
  apiError(404, PickupErrorCode.RAMASSAGE_INTROUVABLE, PICKUP_MESSAGES.ramassageIntrouvable);
const ramassageEnCours = () =>
  apiError(409, PickupErrorCode.RAMASSAGE_EN_COURS, PICKUP_MESSAGES.ramassageEnCours);

/**
 * Demander un ramassage (Vendeur 4.5, D-35): the parcels ready or how many,
 * a window, a note, at an address saved or filled now. One open request per
 * address; a parcel in one open request at most. The seller cancels while
 * Demandé or Planifié, at no cost. The team plans in RamassagesService
 * (D-58); the scans come with the courier app (phase 6).
 */
@Injectable()
export class PickupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly addresses: PickupAddressesService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async request(
    principal: UserPrincipal,
    values: PickupRequestValues,
  ): Promise<{ pickup: PickupView; replayed: boolean }> {
    const sellerId = sellerIdOf(principal);
    if (values.clientRequestId) {
      const earlier = await this.prisma.pickup.findUnique({
        where: { clientRequestId: values.clientRequestId },
      });
      if (earlier) return { pickup: await this.replay(earlier, sellerId), replayed: true };
    }

    // Suspended: he reads and cancels, but asks for nothing new (D-25).
    const seller = await this.prisma.seller.findUniqueOrThrow({ where: { id: sellerId } });
    if (seller.accountState === 'SUSPENDU') {
      throw apiError(403, PickupErrorCode.COMPTE_SUSPENDU, PICKUP_MESSAGES.compteSuspendu);
    }

    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const addressId = values.newAddress
          ? (await this.addresses.createIn(tx, sellerId, values.newAddress, false)).id
          : (await this.addresses.owned(tx, sellerId, values.pickupAddressId!)).id;
        const open = await tx.pickup.findFirst({
          where: { pickupAddressId: addressId, status: { in: OPEN } },
        });
        if (open) throw ramassageEnCours();

        const parcelIds = values.parcelCodes?.length
          ? await this.availableParcels(tx, sellerId, values.parcelCodes)
          : [];
        const pickup = await tx.pickup.create({
          data: {
            sellerId,
            pickupAddressId: addressId,
            declaredCount: parcelIds.length > 0 ? null : (values.declaredCount ?? null),
            requestedSlot: values.requestedSlot,
            note: values.note || null,
            clientRequestId: values.clientRequestId ?? null,
          },
        });
        if (parcelIds.length > 0) {
          await tx.pickupParcel.createMany({
            data: parcelIds.map((parcelId) => ({ pickupId: pickup.id, parcelId, expected: true })),
          });
        }
        return pickup.id;
      });
      return { pickup: await this.view(id), replayed: false };
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
      // Two requests at the same instant: the same one sent twice, or a
      // second request at an address that now has one (D-35).
      if (values.clientRequestId) {
        const same = await this.prisma.pickup.findUnique({
          where: { clientRequestId: values.clientRequestId },
        });
        if (same) return { pickup: await this.replay(same, sellerId), replayed: true };
      }
      throw ramassageEnCours();
    }
  }

  async list(principal: Principal): Promise<PickupView[]> {
    const pickups = await this.prisma.pickup.findMany({
      where: { sellerId: sellerIdOf(principal) },
      orderBy: { createdAt: 'desc' },
      include: INCLUDE,
    });
    return pickups.map(pickupView);
  }

  async detail(principal: Principal, id: string): Promise<PickupDetail> {
    const pickup = await this.prisma.pickup.findUnique({
      where: { id },
      include: {
        ...INCLUDE,
        parcels: {
          include: { parcel: { select: { code: true, recipientName: true, status: true } } },
          orderBy: { parcel: { createdAt: 'asc' } },
        },
      },
    });
    if (!pickup || pickup.sellerId !== sellerIdOf(principal)) throw ramassageIntrouvable();
    return {
      ...pickupView(pickup),
      parcels: pickup.parcels.map((link) => ({
        code: link.parcel.code,
        recipientName: link.parcel.recipientName,
        status: link.parcel.status,
        pickedUp: link.scannedAt !== null,
      })),
    };
  }

  /** The parcels the request form offers: Créé, and in no open request. */
  async readyParcels(principal: Principal): Promise<ReadyParcel[]> {
    const parcels = await this.prisma.parcel.findMany({
      where: {
        sellerId: sellerIdOf(principal),
        status: ParcelStatus.CREE,
        pickupLinks: { none: { pickup: { status: { in: OPEN } } } },
      },
      orderBy: { createdAt: 'desc' },
      include: { delegation: true },
    });
    return parcels.map((parcel) => ({
      code: parcel.code,
      recipientName: parcel.recipientName,
      delegationNameFr: parcel.delegation.nameFr,
      codAmountMillimes: parcel.codAmountMillimes,
      createdAt: parcel.createdAt,
    }));
  }

  /** While Demandé or Planifié, at no cost (D-35, A-13). */
  async cancel(principal: UserPrincipal, id: string): Promise<PickupView> {
    const sellerId = sellerIdOf(principal);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "pickups" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const pickup = await tx.pickup.findUnique({ where: { id } });
      if (!pickup || pickup.sellerId !== sellerId) throw ramassageIntrouvable();
      if (!canCancelPickup(pickup.status)) {
        throw apiError(
          409,
          PickupErrorCode.ANNULATION_IMPOSSIBLE,
          PICKUP_MESSAGES.annulationImpossible,
        );
      }
      await tx.pickup.update({
        where: { id },
        data: {
          status: PickupStatus.ANNULE,
          cancelledAt: this.clock.now(),
          cancelledByUserId: principal.userId,
        },
      });
    });
    return this.view(id);
  }

  // ── helpers ────────────────────────────────────────────────

  /**
   * The ids of the parcels asked for, each the seller's, Créé and in no open
   * request, locked until the request is written. Any other is refused, with
   * its code; another seller's reads like an unknown one (D-26).
   */
  private async availableParcels(tx: Tx, sellerId: string, rawCodes: string[]): Promise<string[]> {
    const codes = [...new Set(rawCodes.map(normalizeParcelCode))];
    await tx.$queryRaw`SELECT "id" FROM "parcels" WHERE "code" = ANY(${codes}::text[]) FOR UPDATE`;
    const parcels = await tx.parcel.findMany({
      where: { code: { in: codes }, sellerId },
      include: { pickupLinks: { include: { pickup: { select: { status: true } } } } },
    });
    const ready = new Map(
      parcels
        .filter(
          (parcel) =>
            parcel.status === ParcelStatus.CREE &&
            !parcel.pickupLinks.some((link) => OPEN.includes(link.pickup.status)),
        )
        .map((parcel) => [parcel.code, parcel.id]),
    );
    const refused = codes.filter((code) => !ready.has(code));
    if (refused.length > 0) {
      throw apiError(
        409,
        PickupErrorCode.COLIS_NON_DISPONIBLE,
        PICKUP_MESSAGES.colisNonDisponible(refused),
      );
    }
    return codes.map((code) => ready.get(code)!);
  }

  private async replay(pickup: Pickup, sellerId: string): Promise<PickupView> {
    if (pickup.sellerId !== sellerId) {
      throw apiError(
        409,
        ParcelErrorCode.REQUETE_DEJA_UTILISEE,
        PARCEL_MESSAGES.REQUETE_DEJA_UTILISEE,
      );
    }
    return this.view(pickup.id);
  }

  private async view(id: string): Promise<PickupView> {
    return pickupView(
      await this.prisma.pickup.findUniqueOrThrow({ where: { id }, include: INCLUDE }),
    );
  }
}
