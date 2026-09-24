import { randomBytes, randomUUID } from 'node:crypto';
import { generateParcelCode } from '@faffago/shared';
import type {
  ParcelCashStatus,
  ParcelLocation,
  ParcelStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';

/**
 * Just enough operational data to put work "in a courier's hands": parcels,
 * pickups and bons, written straight to the tables. The services that will
 * write them for real come in phases 3 to 8.
 */

let counter = 0;

/** A localité and its délégation (D-17): the pair a parcel or an address names. */
export async function place(
  prisma: PrismaClient,
): Promise<{ delegationId: string; localiteId: string }> {
  const existing = await prisma.localite.findFirst();
  if (existing) return { delegationId: existing.delegationId, localiteId: existing.id };
  const gouvernorat = await prisma.gouvernorat.create({
    data: { code: 'TUN', nameFr: 'Tunis', nameAr: 'تونس' },
  });
  const delegation = await prisma.delegation.create({
    data: { gouvernoratId: gouvernorat.id, code: 'TUN-BARDO', nameFr: 'Le Bardo', nameAr: 'باردو' },
  });
  const localite = await prisma.localite.create({
    data: { delegationId: delegation.id, nameFr: 'Khaznadar', postalCode: '2017' },
  });
  return { delegationId: delegation.id, localiteId: localite.id };
}

export async function createParcel(
  prisma: PrismaClient,
  input: {
    sellerId: string;
    createdByUserId: string;
    status?: ParcelStatus;
    location?: ParcelLocation;
    cashStatus?: ParcelCashStatus | null;
    currentLivreurId?: string | null;
    /** Defaults to the first localité there is. */
    where?: { delegationId: string; localiteId: string };
    address?: string;
    /** Any other column, e.g. the relance date of a Relancé parcel. */
    extra?: Partial<Prisma.ParcelUncheckedCreateInput>;
  },
): Promise<string> {
  const where = input.where ?? (await place(prisma));
  const status = input.status ?? 'CREE';
  const location = input.location ?? 'CHEZ_LE_VENDEUR';
  // A parcel placed straight into a later state still needs an event of its
  // own transaction ending in that state, or the database refuses it (D-21).
  return prisma.$transaction(async (tx) => {
    const parcel = await tx.parcel.create({
      data: {
        code: generateParcelCode(randomBytes),
        sellerId: input.sellerId,
        recipientName: 'Client',
        recipientPhone: '29876543',
        ...where,
        address: input.address ?? 'Rue de Test',
        productDescription: 'Article',
        codAmountMillimes: 85000n,
        deliveryFeeMillimes: 7000n,
        returnFeeMillimes: 5000n,
        changeClientFeeMillimes: 1000n,
        createdByUserId: input.createdByUserId,
        status,
        location,
        cashStatus: input.cashStatus ?? null,
        currentLivreurId: input.currentLivreurId ?? null,
        ...input.extra,
      },
    });
    await tx.parcelEvent.create({
      data: {
        parcelId: parcel.id,
        type: 'FORCAGE_STATUT',
        newStatus: status,
        newLocation: location,
        actorUserId: input.createdByUserId,
        reasonText: 'Fixture de test',
      },
    });
    return parcel.id;
  });
}

/** A pickup of the ramasseur, with the parcel he has scanned and still carries. */
export async function createPickupWithParcel(
  prisma: PrismaClient,
  input: { sellerId: string; ramasseurId: string; parcelId: string },
): Promise<void> {
  const address = await prisma.pickupAddress.create({
    data: {
      sellerId: input.sellerId,
      ...(await place(prisma)),
      address: 'Entrepôt du vendeur',
    },
  });
  const pickup = await prisma.pickup.create({
    data: {
      sellerId: input.sellerId,
      pickupAddressId: address.id,
      status: 'PLANIFIE',
      ramasseurId: input.ramasseurId,
    },
  });
  await prisma.pickupParcel.create({
    data: { pickupId: pickup.id, parcelId: input.parcelId, scannedAt: new Date() },
  });
}

export async function createBonVersement(
  prisma: PrismaClient,
  input: {
    sellerId: string;
    ramasseurId: string;
    preparedByUserId: string;
    status: 'PREPARE' | 'EN_ROUTE' | 'REMIS';
  },
): Promise<void> {
  counter += 1;
  await prisma.bonVersement.create({
    data: {
      number: `BV-TEST-${counter}`,
      sellerId: input.sellerId,
      status: input.status,
      totalCodMillimes: 85000n,
      totalFeesMillimes: 7000n,
      baseAfterFeesMillimes: 78000n,
      sellerStatutSnapshot: 'PATENTE',
      netMillimes: 78000n,
      qrToken: randomUUID(),
      preparedByUserId: input.preparedByUserId,
      ramasseurId: input.ramasseurId,
    },
  });
}

export async function createBonRetour(
  prisma: PrismaClient,
  input: {
    sellerId: string;
    ramasseurId: string;
    preparedByUserId: string;
    status: 'PREPARE' | 'EN_ROUTE' | 'REMIS';
  },
): Promise<void> {
  counter += 1;
  await prisma.bonRetour.create({
    data: {
      number: `BR-TEST-${counter}`,
      sellerId: input.sellerId,
      status: input.status,
      parcelCount: 1,
      qrToken: randomUUID(),
      preparedByUserId: input.preparedByUserId,
      ramasseurId: input.ramasseurId,
    },
  });
}
