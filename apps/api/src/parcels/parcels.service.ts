import { Injectable } from '@nestjs/common';
import { Prisma, type Parcel } from '@prisma/client';
import { can, Permission, type CreateParcelValues } from '@faffago/shared';
import { sellerIdOf, type UserPrincipal } from '../auth/principal';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ParcelCodeGenerator } from './parcel-code.generator';
import { ParcelEventService } from './parcel-event.service';

/** 32^8 codes: a collision is already rare, five in a row means something else is wrong. */
const MAX_CODE_ATTEMPTS = 5;

const nonAutorise = () => apiError(403, 'NON_AUTORISE', "Vous n'avez pas accès à cette action.");
const compteSuspendu = () =>
  apiError(
    403,
    'COMPTE_SUSPENDU',
    'Votre compte est suspendu : vous ne pouvez pas créer de colis.',
  );
const localiteIntrouvable = () => apiError(400, 'LOCALITE_INTROUVABLE', 'Localité introuvable.');
const localiteInactive = () =>
  apiError(
    400,
    'LOCALITE_INACTIVE',
    'Cette localité n’est plus proposée. Choisissez-en une autre.',
  );
const codeIndisponible = () =>
  apiError(
    503,
    'CODE_COLIS_INDISPONIBLE',
    'Impossible d’attribuer un code au colis pour le moment. Réessayez.',
  );

/**
 * Créer un colis (Vendeur 4.2). The endpoint and its screen come in phase 4
 * (D-22); this is the part the rules live in.
 */
@Injectable()
export class ParcelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly events: ParcelEventService,
    private readonly codes: ParcelCodeGenerator,
  ) {}

  /**
   * The values have been through `createParcelSchema`. The délégation is
   * taken from the localité, never from the form (D-17), and the fees are
   * copied from Paramètres now, never read again (CLAUDE.md, Money).
   */
  async create(principal: UserPrincipal, values: CreateParcelValues): Promise<Parcel> {
    if (!can(principal.role, Permission.ESPACE_VENDEUR)) throw nonAutorise();
    const sellerId = sellerIdOf(principal);

    // Suspended: he still logs in and reads, but creates nothing (Vendeur 2.5, D-25).
    const seller = await this.prisma.seller.findUniqueOrThrow({ where: { id: sellerId } });
    if (seller.accountState === 'SUSPENDU') throw compteSuspendu();

    const localite = await this.prisma.localite.findUnique({ where: { id: values.localiteId } });
    if (!localite) throw localiteIntrouvable();
    // A deactivated localité is closed to new parcels; old ones keep it (D-27).
    if (!localite.isActive) throw localiteInactive();

    const fees = await this.settings.feesForNewParcel();

    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
      const code = this.codes.next();
      try {
        return await this.prisma.$transaction(async (tx) => {
          const parcel = await tx.parcel.create({
            data: {
              code,
              sellerId,
              recipientName: values.recipientName,
              recipientPhone: values.recipientPhone,
              recipientPhone2: values.recipientPhone2 ?? null,
              delegationId: localite.delegationId,
              localiteId: localite.id,
              address: values.address,
              landmark: values.landmark ?? null,
              productDescription: values.productDescription,
              pieceCount: values.pieceCount,
              isExchange: values.isExchange,
              openingAllowed: values.openingAllowed,
              courierNote: values.courierNote ?? null,
              codAmountMillimes: values.codAmountMillimes,
              deliveryFeeMillimes: fees.deliveryFeeMillimes,
              returnFeeMillimes: fees.returnFeeMillimes,
              changeClientFeeMillimes: fees.changeClientFeeMillimes,
              createdByUserId: principal.userId,
            },
          });
          await this.events.recordCreation(tx, parcel, principal);
          return parcel;
        });
      } catch (error) {
        // The code is the only unique column a new parcel can clash on.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          continue;
        }
        throw error;
      }
    }
    throw codeIndisponible();
  }
}
