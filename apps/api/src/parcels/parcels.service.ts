import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type Parcel,
  type SellerChangeRequest,
  type Delegation,
  type Gouvernorat,
  type Localite,
} from '@prisma/client';
import {
  CHANGE_REQUEST_FIELDS,
  PARCEL_MESSAGES,
  ParcelAction,
  ParcelErrorCode,
  ParcelStatus,
  ScanRefusal,
  can,
  canCancel,
  canRequestChange,
  labelNeedsReprint,
  normalizeParcelCode,
  Permission,
  type CreateParcelRequestValues,
  type CreateParcelValues,
  type ParcelChangeRequestValues,
  type UpdateParcelValues,
} from '@faffago/shared';
import { sellerIdOf, type Principal, type UserPrincipal } from '../auth/principal';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ParcelCodeGenerator } from './parcel-code.generator';
import { ParcelEventService, type ParcelActionResult } from './parcel-event.service';

type Tx = Prisma.TransactionClient;

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
const parcelError = (status: number, code: ParcelErrorCode) =>
  apiError(status, code, PARCEL_MESSAGES[code]);
/** Another seller's parcel gets exactly the answer of an unknown code (D-26). */
const colisIntrouvable = () => parcelError(404, ParcelErrorCode.COLIS_INTROUVABLE);

/** A retried creation found its parcel: handed back instead of a second one. */
class AlreadyCreated extends Error {
  constructor(readonly parcel: Parcel) {
    super('ALREADY_CREATED');
  }
}

/** What the seller reads of a change request: never the staff's internal note. */
export interface ChangeRequestView {
  id: string;
  requestedFields: Prisma.JsonValue;
  sellerNote: string | null;
  status: string;
  createdAt: Date;
  handledAt: Date | null;
}

/**
 * A parcel as its seller sees it. Money stays bigint here and leaves the API
 * as a string. The timeline, the money block and the courier come with
 * Détail du colis.
 */
export interface SellerParcelView {
  id: string;
  code: string;
  status: string;
  location: string;
  cashStatus: string | null;
  recipientName: string;
  recipientPhone: string;
  recipientPhone2: string | null;
  localite: { id: string; nameFr: string };
  delegation: { id: string; nameFr: string; gouvernoratNameFr: string };
  address: string;
  landmark: string | null;
  productDescription: string;
  pieceCount: number;
  codAmountMillimes: bigint;
  isExchange: boolean;
  openingAllowed: boolean;
  courierNote: string | null;
  deliveryFeeMillimes: bigint;
  returnFeeMillimes: bigint;
  createdAt: Date;
  cancelledAt: Date | null;
  changeRequests: ChangeRequestView[];
}

type ParcelWithPlace = Parcel & {
  localite: Localite;
  delegation: Delegation & { gouvernorat: Gouvernorat };
  changeRequests: SellerChangeRequest[];
};

const WITH_PLACE = {
  localite: true,
  delegation: { include: { gouvernorat: true } },
  changeRequests: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.ParcelInclude;

function changeRequestView(request: SellerChangeRequest): ChangeRequestView {
  return {
    id: request.id,
    requestedFields: request.requestedFields,
    sellerNote: request.sellerNote,
    status: request.status,
    createdAt: request.createdAt,
    handledAt: request.handledAt,
  };
}

function sellerView(parcel: ParcelWithPlace): SellerParcelView {
  return {
    id: parcel.id,
    code: parcel.code,
    status: parcel.status,
    location: parcel.location,
    cashStatus: parcel.cashStatus,
    recipientName: parcel.recipientName,
    recipientPhone: parcel.recipientPhone,
    recipientPhone2: parcel.recipientPhone2,
    localite: { id: parcel.localite.id, nameFr: parcel.localite.nameFr },
    delegation: {
      id: parcel.delegation.id,
      nameFr: parcel.delegation.nameFr,
      gouvernoratNameFr: parcel.delegation.gouvernorat.nameFr,
    },
    address: parcel.address,
    landmark: parcel.landmark,
    productDescription: parcel.productDescription,
    pieceCount: parcel.pieceCount,
    codAmountMillimes: parcel.codAmountMillimes,
    isExchange: parcel.isExchange,
    openingAllowed: parcel.openingAllowed,
    courierNote: parcel.courierNote,
    deliveryFeeMillimes: parcel.deliveryFeeMillimes,
    returnFeeMillimes: parcel.returnFeeMillimes,
    createdAt: parcel.createdAt,
    cancelledAt: parcel.cancelledAt,
    changeRequests: parcel.changeRequests.map(changeRequestView),
  };
}

/** The fields Modifier may touch, in the order the form shows them. */
const EDITABLE_FIELDS = [
  'recipientName',
  'recipientPhone',
  'recipientPhone2',
  'localiteId',
  'address',
  'landmark',
  'productDescription',
  'pieceCount',
  'codAmountMillimes',
  'isExchange',
  'openingAllowed',
  'courierNote',
] as const satisfies readonly (keyof UpdateParcelValues & keyof Parcel)[];

type EditableField = (typeof EDITABLE_FIELDS)[number];

/** How a value is written into the event: money as its digit string, like everywhere. */
function asJson(value: unknown): Prisma.InputJsonValue | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  return value as Prisma.InputJsonValue;
}

export interface ParcelEdit {
  parcel: SellerParcelView;
  changedFields: EditableField[];
  /** A field printed on the label changed: the old label is wrong (D-41). */
  reprintLabel: boolean;
}

/**
 * The seller's parcels (Vendeur 4.2, 4.6). Every status change goes through
 * ParcelEventService; a Modifier writes its MODIFICATION_VENDEUR event with
 * what changed in the same transaction as the change itself.
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
  async create(
    principal: UserPrincipal,
    values: CreateParcelValues & { clientRequestId?: string },
  ): Promise<Parcel> {
    if (!can(principal.role, Permission.ESPACE_VENDEUR)) throw nonAutorise();
    const sellerId = sellerIdOf(principal);

    // Suspended: he still logs in and reads, but creates nothing (Vendeur 2.5, D-25).
    const seller = await this.prisma.seller.findUniqueOrThrow({ where: { id: sellerId } });
    if (seller.accountState === 'SUSPENDU') throw compteSuspendu();

    const localite = await this.activeLocalite(this.prisma, values.localiteId);
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
              clientRequestId: values.clientRequestId ?? null,
            },
          });
          await this.events.recordCreation(tx, parcel, principal);
          return parcel;
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          // The same request, sent again while the first was being written.
          if (values.clientRequestId) {
            const existing = await this.prisma.parcel.findUnique({
              where: { clientRequestId: values.clientRequestId },
            });
            if (existing) throw new AlreadyCreated(existing);
          }
          // Otherwise the code is the only unique column a new parcel can clash on.
          continue;
        }
        throw error;
      }
    }
    throw codeIndisponible();
  }

  /**
   * Créer un colis from the screen. A request sent twice gets the parcel of
   * the first, `replayed`; another seller's request id is refused without
   * showing his parcel.
   */
  async createFromRequest(
    principal: UserPrincipal,
    values: CreateParcelRequestValues,
  ): Promise<{ parcel: SellerParcelView; replayed: boolean }> {
    const sellerId = sellerIdOf(principal);
    let parcel: Parcel;
    let replayed = false;
    const earlier = values.clientRequestId
      ? await this.prisma.parcel.findUnique({ where: { clientRequestId: values.clientRequestId } })
      : null;
    if (earlier) {
      parcel = earlier;
      replayed = true;
    } else {
      try {
        parcel = await this.create(principal, values);
      } catch (error) {
        if (!(error instanceof AlreadyCreated)) throw error;
        parcel = error.parcel;
        replayed = true;
      }
    }
    if (parcel.sellerId !== sellerId) {
      throw parcelError(409, ParcelErrorCode.REQUETE_DEJA_UTILISEE);
    }
    return { parcel: await this.viewOf(this.prisma, parcel.id), replayed };
  }

  async get(principal: Principal, code: string): Promise<SellerParcelView> {
    const parcel = await this.owned(this.prisma, principal, code);
    return this.viewOf(this.prisma, parcel.id);
  }

  /**
   * Modifier (Vendeur 4.6, D-41): any field while the parcel is Créé. The
   * fees stay as frozen at creation. Nothing changed, nothing written.
   */
  async update(
    principal: UserPrincipal,
    code: string,
    values: UpdateParcelValues,
  ): Promise<ParcelEdit> {
    return this.prisma.$transaction(async (tx) => {
      const parcel = await this.owned(tx, principal, code, { lock: true });
      if (parcel.status !== ParcelStatus.CREE) {
        throw parcelError(
          409,
          canRequestChange(parcel.status)
            ? ParcelErrorCode.MODIFICATION_IMPOSSIBLE
            : ParcelErrorCode.DEMANDE_IMPOSSIBLE,
        );
      }

      const data: Prisma.ParcelUncheckedUpdateInput = {};
      const changes: Record<
        string,
        { before: Prisma.InputJsonValue | null; after: Prisma.InputJsonValue | null }
      > = {};
      const changedFields: EditableField[] = [];
      for (const field of EDITABLE_FIELDS) {
        const next = values[field];
        if (next === undefined) continue;
        const before = asJson(parcel[field]);
        const after = asJson(next);
        if (before === after) continue;
        changes[field] = { before, after };
        changedFields.push(field);
        (data as Record<string, unknown>)[field] = next;
      }
      if (changedFields.length === 0) {
        return { parcel: await this.viewOf(tx, parcel.id), changedFields, reprintLabel: false };
      }
      if (changes.localiteId) {
        // The délégation always follows the localité (D-17); a closed one takes nothing new (D-27).
        const localite = await this.activeLocalite(tx, values.localiteId!);
        data.delegationId = localite.delegationId;
      }

      this.assertApplied(
        await this.events.apply(tx, {
          parcelId: parcel.id,
          actor: principal,
          request: { action: ParcelAction.MODIFIER },
          context: { details: { changes } },
        }),
      );
      await tx.parcel.update({ where: { id: parcel.id }, data });
      return {
        parcel: await this.viewOf(tx, parcel.id),
        changedFields,
        reprintLabel: labelNeedsReprint(changedFields),
      };
    });
  }

  /**
   * Annuler (Vendeur 4.6): before pickup, Annulé; after it, the return flow
   * with the return fee frozen on the parcel (D-28). The state machine
   * decides which.
   */
  async cancel(principal: UserPrincipal, code: string): Promise<SellerParcelView> {
    return this.prisma.$transaction(async (tx) => {
      const parcel = await this.owned(tx, principal, code, { lock: true });
      if (!canCancel(parcel)) throw parcelError(409, ParcelErrorCode.ANNULATION_IMPOSSIBLE);
      this.assertApplied(
        await this.events.apply(tx, {
          parcelId: parcel.id,
          actor: principal,
          request: { action: ParcelAction.ANNULER },
        }),
      );
      return this.viewOf(tx, parcel.id);
    });
  }

  /**
   * Demander une modification (Vendeur 4.6): after pickup the seller asks,
   * Faffa Go applies it (phase 5). The parcel itself does not change here.
   */
  async requestChange(
    principal: UserPrincipal,
    code: string,
    values: ParcelChangeRequestValues,
  ): Promise<ChangeRequestView> {
    return this.prisma.$transaction(async (tx) => {
      const parcel = await this.owned(tx, principal, code, { lock: true });
      if (parcel.status === ParcelStatus.CREE) {
        throw parcelError(409, ParcelErrorCode.DEMANDE_AVANT_RAMASSAGE);
      }
      if (!canRequestChange(parcel.status)) {
        throw parcelError(409, ParcelErrorCode.DEMANDE_IMPOSSIBLE);
      }
      const requestedFields: Record<string, string> = {};
      for (const field of CHANGE_REQUEST_FIELDS) {
        const value = values[field];
        if (value !== undefined) requestedFields[field] = value;
      }
      const request = await tx.sellerChangeRequest.create({
        data: {
          parcelId: parcel.id,
          sellerId: parcel.sellerId,
          requestedFields,
          sellerNote: values.note || null,
        },
      });
      return changeRequestView(request);
    });
  }

  // ── helpers ────────────────────────────────────────────────

  /**
   * The seller's own parcel by its code, however typed. Anyone else's is
   * "Code inconnu" (D-26). With `lock`, the row is held until the transaction
   * ends, as ParcelEventService does.
   */
  private async owned(
    db: Tx,
    principal: Principal,
    rawCode: string,
    options: { lock?: boolean } = {},
  ): Promise<Parcel> {
    const sellerId = sellerIdOf(principal);
    const code = normalizeParcelCode(rawCode);
    if (options.lock) {
      await db.$queryRaw`SELECT "id" FROM "parcels" WHERE "code" = ${code} FOR UPDATE`;
    }
    const parcel = await db.parcel.findUnique({ where: { code } });
    if (!parcel || parcel.sellerId !== sellerId) throw colisIntrouvable();
    return parcel;
  }

  private async viewOf(db: Tx, parcelId: string): Promise<SellerParcelView> {
    const parcel = await db.parcel.findUniqueOrThrow({
      where: { id: parcelId },
      include: WITH_PLACE,
    });
    return sellerView(parcel);
  }

  private async activeLocalite(db: Tx, localiteId: string): Promise<Localite> {
    const localite = await db.localite.findUnique({ where: { id: localiteId } });
    if (!localite) throw localiteIntrouvable();
    // A deactivated localité is closed to new parcels; old ones keep it (D-27).
    if (!localite.isActive) throw localiteInactive();
    return localite;
  }

  /** The checks above run first; this is the state machine's own last word. */
  private assertApplied(result: ParcelActionResult): void {
    if (result.ok) return;
    if (result.refusal === ScanRefusal.CODE_INCONNU) throw colisIntrouvable();
    throw apiError(409, result.refusal, result.message);
  }
}
