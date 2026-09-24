import { Injectable } from '@nestjs/common';
import type { Delegation, Gouvernorat, Localite, PickupAddress, Prisma } from '@prisma/client';
import {
  PICKUP_MESSAGES,
  PickupErrorCode,
  type CreatePickupAddressValues,
  type PickupAddressValues,
} from '@faffago/shared';
import { sellerIdOf, type Principal } from '../auth/principal';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';

type Tx = Prisma.TransactionClient;

export interface PickupAddressView {
  id: string;
  label: string | null;
  localiteId: string;
  localiteNameFr: string;
  delegationNameFr: string;
  gouvernoratNameFr: string;
  address: string;
  landmark: string | null;
  isDefault: boolean;
}

type AddressWithPlace = PickupAddress & {
  localite: Localite;
  delegation: Delegation & { gouvernorat: Gouvernorat };
};

export const WITH_PLACE = {
  localite: true,
  delegation: { include: { gouvernorat: true } },
} satisfies Prisma.PickupAddressInclude;

export function addressView(address: AddressWithPlace): PickupAddressView {
  return {
    id: address.id,
    label: address.label,
    localiteId: address.localiteId,
    localiteNameFr: address.localite.nameFr,
    delegationNameFr: address.delegation.nameFr,
    gouvernoratNameFr: address.delegation.gouvernorat.nameFr,
    address: address.address,
    landmark: address.landmark,
    isDefault: address.isDefault,
  };
}

const adresseIntrouvable = () =>
  apiError(404, PickupErrorCode.ADRESSE_INTROUVABLE, PICKUP_MESSAGES.adresseIntrouvable);
const adresseInactive = () =>
  apiError(409, PickupErrorCode.ADRESSE_INACTIVE, PICKUP_MESSAGES.adresseInactive);

/**
 * Pickup addresses (Vendeur 4.5, 4.14, D-35): filled at the first request,
 * several per seller, one default. An address no pickup used is corrected in
 * place; one a pickup used is never rewritten: it is deactivated, kept for
 * that pickup, and a new address takes its place.
 */
@Injectable()
export class PickupAddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(principal: Principal): Promise<PickupAddressView[]> {
    const addresses = await this.prisma.pickupAddress.findMany({
      where: { sellerId: sellerIdOf(principal), isActive: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: WITH_PLACE,
    });
    return addresses.map(addressView);
  }

  async create(
    principal: Principal,
    values: CreatePickupAddressValues,
  ): Promise<PickupAddressView> {
    const sellerId = sellerIdOf(principal);
    return this.prisma.$transaction(async (tx) =>
      addressView(await this.createIn(tx, sellerId, values, values.isDefault ?? false)),
    );
  }

  /**
   * In the caller's transaction: the request of a first pickup creates its
   * address with it. The seller's first address becomes the default.
   */
  async createIn(
    tx: Tx,
    sellerId: string,
    values: PickupAddressValues,
    makeDefault: boolean,
  ): Promise<AddressWithPlace> {
    const localite = await this.activeLocalite(tx, values.localiteId);
    await this.lockSeller(tx, sellerId);
    const hasDefault = await tx.pickupAddress.findFirst({
      where: { sellerId, isDefault: true },
    });
    const isDefault = makeDefault || !hasDefault;
    if (isDefault && hasDefault) {
      await tx.pickupAddress.update({ where: { id: hasDefault.id }, data: { isDefault: false } });
    }
    return tx.pickupAddress.create({
      data: {
        sellerId,
        label: values.label || null,
        localiteId: localite.id,
        delegationId: localite.delegationId,
        address: values.address,
        landmark: values.landmark || null,
        isDefault,
      },
      include: WITH_PLACE,
    });
  }

  /** Corrected in place when no pickup used it; replaced otherwise (D-35). */
  async update(
    principal: Principal,
    id: string,
    values: PickupAddressValues,
  ): Promise<PickupAddressView> {
    const sellerId = sellerIdOf(principal);
    return this.prisma.$transaction(async (tx) => {
      await this.lockSeller(tx, sellerId);
      const current = await this.owned(tx, sellerId, id);
      const localite = await this.activeLocalite(tx, values.localiteId);
      const data = {
        label: values.label || null,
        localiteId: localite.id,
        delegationId: localite.delegationId,
        address: values.address,
        landmark: values.landmark || null,
      };
      const used = await tx.pickup.count({ where: { pickupAddressId: id } });
      if (used === 0) {
        return addressView(
          await tx.pickupAddress.update({ where: { id }, data, include: WITH_PLACE }),
        );
      }
      // The pickups that used it keep it; the default moves to the new one.
      if (current.isDefault) {
        await tx.pickupAddress.update({ where: { id }, data: { isDefault: false } });
      }
      const replacement = await tx.pickupAddress.create({
        data: { sellerId, ...data, isDefault: current.isDefault },
        include: WITH_PLACE,
      });
      await tx.pickupAddress.update({
        where: { id },
        data: { isActive: false, replacedById: replacement.id },
      });
      return addressView(replacement);
    });
  }

  async setDefault(principal: Principal, id: string): Promise<PickupAddressView> {
    const sellerId = sellerIdOf(principal);
    return this.prisma.$transaction(async (tx) => {
      await this.lockSeller(tx, sellerId);
      await this.owned(tx, sellerId, id);
      await tx.pickupAddress.updateMany({
        where: { sellerId, isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
      return addressView(
        await tx.pickupAddress.update({
          where: { id },
          data: { isDefault: true },
          include: WITH_PLACE,
        }),
      );
    });
  }

  /** The seller's own active address; another seller's does not exist (D-26). */
  async owned(tx: Tx, sellerId: string, id: string): Promise<PickupAddress> {
    const address = await tx.pickupAddress.findUnique({ where: { id } });
    if (!address || address.sellerId !== sellerId) throw adresseIntrouvable();
    if (!address.isActive) throw adresseInactive();
    return address;
  }

  /** One change to a seller's addresses at a time: the default stays single. */
  private async lockSeller(tx: Tx, sellerId: string): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "sellers" WHERE "id" = ${sellerId}::uuid FOR UPDATE`;
  }

  private async activeLocalite(tx: Tx, localiteId: string): Promise<Localite> {
    const localite = await tx.localite.findUnique({ where: { id: localiteId } });
    if (!localite) throw apiError(400, 'LOCALITE_INTROUVABLE', 'Localité introuvable.');
    // A deactivated localité takes nothing new (D-27).
    if (!localite.isActive) {
      throw apiError(
        400,
        'LOCALITE_INACTIVE',
        'Cette localité n’est plus proposée. Choisissez-en une autre.',
      );
    }
    return localite;
  }
}
