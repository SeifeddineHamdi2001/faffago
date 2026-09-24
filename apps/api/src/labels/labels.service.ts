import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PARCEL_MESSAGES,
  ParcelErrorCode,
  isValidParcelCode,
  normalizeParcelCode,
  type LabelFormat,
} from '@faffago/shared';
import { sellerIdOf, type Principal } from '../auth/principal';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { labelContent, siteUrlFrom, type LabelParcel } from './label-content';
import { renderLabels } from './label-renderer';

const colisIntrouvable = () =>
  apiError(404, ParcelErrorCode.COLIS_INTROUVABLE, PARCEL_MESSAGES.COLIS_INTROUVABLE);

/**
 * Étiquettes (Vendeur 4.4): single, a batch, or every parcel of an import,
 * any time, with the same code (A-9). The seller prints his own parcels only;
 * one code that is not his refuses the whole batch as unknown (D-26).
 */
@Injectable()
export class LabelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async forCodes(principal: Principal, codes: readonly string[], format: LabelFormat) {
    const wanted = codes.map(normalizeParcelCode);
    if (wanted.some((code) => !isValidParcelCode(code))) throw colisIntrouvable();
    const parcels = await this.load(sellerIdOf(principal), { code: { in: wanted } });
    const byCode = new Map(parcels.map((parcel) => [parcel.code, parcel]));
    const ordered = [...new Set(wanted)].map((code) => byCode.get(code));
    if (ordered.some((parcel) => !parcel)) throw colisIntrouvable();
    return this.render(ordered as LabelParcel[], format);
  }

  /**
   * Réimprimer l'étiquette (A-9): Dépôt and Admin, any seller's parcel, the
   * same code. The route's permission is the check; there is no seller scope.
   */
  async forStaff(rawCode: string, format: LabelFormat) {
    const code = normalizeParcelCode(rawCode);
    if (!isValidParcelCode(code)) throw colisIntrouvable();
    const parcels = await this.load(null, { code: { in: [code] } });
    if (parcels.length === 0) throw colisIntrouvable();
    return this.render(parcels, format);
  }

  /** "Imprimer toutes les étiquettes" after an Import CSV, in file order. */
  async forImport(principal: Principal, importId: string, format: LabelFormat) {
    const sellerId = sellerIdOf(principal);
    const found = await this.prisma.parcelImport.findUnique({ where: { id: importId } });
    if (!found || found.sellerId !== sellerId) {
      throw apiError(404, 'IMPORT_INTROUVABLE', 'Import introuvable.');
    }
    return this.render(await this.load(sellerId, { importId }), format);
  }

  private async load(
    /** Null for the team's reprint (A-9); the seller's own otherwise. */
    sellerId: string | null,
    where: { code?: { in: string[] }; importId?: string },
  ): Promise<LabelParcel[]> {
    const parcels = await this.prisma.parcel.findMany({
      where: { ...where, ...(sellerId ? { sellerId } : {}) },
      orderBy: [{ importLine: 'asc' }, { createdAt: 'asc' }],
      include: {
        seller: { select: { shopName: true } },
        localite: { select: { nameFr: true } },
        delegation: { select: { nameFr: true, gouvernorat: { select: { nameFr: true } } } },
      },
    });
    return parcels.map((parcel) => ({
      code: parcel.code,
      shopName: parcel.seller.shopName,
      recipientName: parcel.recipientName,
      recipientPhone: parcel.recipientPhone,
      recipientPhone2: parcel.recipientPhone2,
      localiteNameFr: parcel.localite.nameFr,
      delegationNameFr: parcel.delegation.nameFr,
      gouvernoratNameFr: parcel.delegation.gouvernorat.nameFr,
      address: parcel.address,
      landmark: parcel.landmark,
      codAmountMillimes: parcel.codAmountMillimes,
      isExchange: parcel.isExchange,
      openingAllowed: parcel.openingAllowed,
    }));
  }

  private async render(parcels: LabelParcel[], format: LabelFormat): Promise<Buffer> {
    const siteUrl = siteUrlFrom(this.config.get<string>('NEXT_PUBLIC_SITE_URL'));
    if (!siteUrl) {
      // The QR code would lead nowhere, and a printed label never changes (D-43).
      throw apiError(
        503,
        'ETIQUETTES_INDISPONIBLES',
        'Impression impossible pour le moment : l’adresse du site n’est pas configurée.',
      );
    }
    return renderLabels(
      parcels.map((parcel) => labelContent(parcel, siteUrl)),
      format,
    );
  }
}
