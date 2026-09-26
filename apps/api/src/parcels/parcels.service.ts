import { Inject, Injectable } from '@nestjs/common';
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
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { NotificationsService } from '../notifications/notifications.service';
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
  /** The localité asked for, named, when the request carries one (D-44). */
  requestedLocalite: { id: string; nameFr: string; delegationNameFr: string } | null;
  sellerNote: string | null;
  status: string;
  createdAt: Date;
  editedAt: Date | null;
  handledAt: Date | null;
  /** Why Faffa Go refused it: the seller reads it (D-57). */
  refusalReason: string | null;
}

type NamedLocalite = Localite & { delegation: Delegation };

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
  /** Changer de client, frozen at creation like the others (Vendeur 4.9). */
  changeClientFeeMillimes: bigint;
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

function requestedLocaliteId(request: SellerChangeRequest): string | null {
  const fields = request.requestedFields as Record<string, unknown> | null;
  return typeof fields?.localiteId === 'string' ? fields.localiteId : null;
}

function changeRequestView(
  request: SellerChangeRequest,
  localites: ReadonlyMap<string, NamedLocalite>,
): ChangeRequestView {
  const localiteId = requestedLocaliteId(request);
  const localite = localiteId ? localites.get(localiteId) : undefined;
  return {
    id: request.id,
    requestedFields: request.requestedFields,
    requestedLocalite: localite
      ? { id: localite.id, nameFr: localite.nameFr, delegationNameFr: localite.delegation.nameFr }
      : null,
    sellerNote: request.sellerNote,
    status: request.status,
    createdAt: request.createdAt,
    editedAt: request.editedAt,
    handledAt: request.handledAt,
    refusalReason: request.refusalReason,
  };
}

function sellerView(
  parcel: ParcelWithPlace,
  localites: ReadonlyMap<string, NamedLocalite>,
): SellerParcelView {
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
    changeClientFeeMillimes: parcel.changeClientFeeMillimes,
    createdAt: parcel.createdAt,
    cancelledAt: parcel.cancelledAt,
    changeRequests: parcel.changeRequests.map((r) => changeRequestView(r, localites)),
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
    private readonly notifications: NotificationsService,
    @Inject(CLOCK) private readonly clock: Clock,
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
   * Demander une modification (Vendeur 4.6, D-44): after pickup the seller
   * asks, Faffa Go applies it (phase 5). The parcel itself does not change
   * here. One request waits at a time; the seller edits or withdraws it.
   */
  async requestChange(
    principal: UserPrincipal,
    code: string,
    values: ParcelChangeRequestValues,
  ): Promise<ChangeRequestView> {
    return this.prisma.$transaction(async (tx) => {
      const parcel = await this.owned(tx, principal, code, { lock: true });
      this.assertCanRequest(parcel);
      const waiting = await tx.sellerChangeRequest.findFirst({
        where: { parcelId: parcel.id, status: 'EN_ATTENTE' },
      });
      if (waiting) throw parcelError(409, ParcelErrorCode.DEMANDE_EN_ATTENTE);
      const request = await tx.sellerChangeRequest.create({
        data: {
          parcelId: parcel.id,
          sellerId: parcel.sellerId,
          ...(await this.requestContent(tx, values)),
        },
      });
      const seller = await tx.seller.findUniqueOrThrow({
        where: { id: parcel.sellerId },
        select: { shopName: true },
      });
      // Service client and the admin, who apply it (Admin 4.18).
      await this.notifications.send(
        tx,
        { permission: Permission.DEMANDES_VENDEUR },
        'DEMANDE_MODIFICATION',
        { code: parcel.code, shopName: seller.shopName },
        { parcelId: parcel.id },
      );
      return this.requestView(tx, request);
    });
  }

  /** The waiting request, replaced by what the seller sends now (D-44). */
  async editChangeRequest(
    principal: UserPrincipal,
    code: string,
    requestId: string,
    values: ParcelChangeRequestValues,
  ): Promise<ChangeRequestView> {
    return this.prisma.$transaction(async (tx) => {
      const parcel = await this.owned(tx, principal, code, { lock: true });
      const request = await this.waitingRequest(tx, parcel, requestId);
      this.assertCanRequest(parcel);
      const updated = await tx.sellerChangeRequest.update({
        where: { id: request.id },
        data: { ...(await this.requestContent(tx, values)), editedAt: this.clock.now() },
      });
      return this.requestView(tx, updated);
    });
  }

  /** Retirée: kept, with who withdrew it and when (D-44). */
  async withdrawChangeRequest(
    principal: UserPrincipal,
    code: string,
    requestId: string,
  ): Promise<ChangeRequestView> {
    return this.prisma.$transaction(async (tx) => {
      const parcel = await this.owned(tx, principal, code, { lock: true });
      const request = await this.waitingRequest(tx, parcel, requestId);
      const updated = await tx.sellerChangeRequest.update({
        where: { id: request.id },
        data: {
          status: 'RETIREE',
          handledByUserId: principal.userId,
          handledAt: this.clock.now(),
        },
      });
      return this.requestView(tx, updated);
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
    return sellerView(parcel, await this.localitesOf(db, parcel.changeRequests));
  }

  private async requestView(db: Tx, request: SellerChangeRequest): Promise<ChangeRequestView> {
    return changeRequestView(request, await this.localitesOf(db, [request]));
  }

  /** The localités the requests ask for, with their délégation, to name them. */
  private async localitesOf(
    db: Tx,
    requests: readonly SellerChangeRequest[],
  ): Promise<Map<string, NamedLocalite>> {
    const ids = [
      ...new Set(requests.map(requestedLocaliteId).filter((id): id is string => id !== null)),
    ];
    if (ids.length === 0) return new Map();
    const localites = await db.localite.findMany({
      where: { id: { in: ids } },
      include: { delegation: true },
    });
    return new Map(localites.map((localite) => [localite.id, localite]));
  }

  private assertCanRequest(parcel: Parcel): void {
    if (parcel.status === ParcelStatus.CREE) {
      throw parcelError(409, ParcelErrorCode.DEMANDE_AVANT_RAMASSAGE);
    }
    if (!canRequestChange(parcel.status)) {
      throw parcelError(409, ParcelErrorCode.DEMANDE_IMPOSSIBLE);
    }
  }

  /** The fields asked for, checked: a new localité must exist and be open (D-27). */
  private async requestContent(
    db: Tx,
    values: ParcelChangeRequestValues,
  ): Promise<{ requestedFields: Record<string, string>; sellerNote: string | null }> {
    const requestedFields: Record<string, string> = {};
    for (const field of CHANGE_REQUEST_FIELDS) {
      const value = values[field];
      if (value !== undefined) requestedFields[field] = value;
    }
    if (values.localiteId) await this.activeLocalite(db, values.localiteId);
    return { requestedFields, sellerNote: values.note || null };
  }

  /** A request of this very parcel, still waiting. */
  private async waitingRequest(
    db: Tx,
    parcel: Parcel,
    requestId: string,
  ): Promise<SellerChangeRequest> {
    const request = await db.sellerChangeRequest.findFirst({
      where: { id: requestId, parcelId: parcel.id },
    });
    if (!request) throw parcelError(404, ParcelErrorCode.DEMANDE_INTROUVABLE);
    if (request.status !== 'EN_ATTENTE') throw parcelError(409, ParcelErrorCode.DEMANDE_CLOSE);
    return request;
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
