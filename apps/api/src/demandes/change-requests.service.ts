import { Inject, Injectable } from '@nestjs/common';
import type { Parcel, Prisma, SellerChangeRequest } from '@prisma/client';
import {
  CHANGE_REQUEST_APPLY_MESSAGES_FR,
  CHANGE_REQUEST_FIELDS,
  ChangeRequestApplyRefusal,
  ChangeRequestStatus,
  changeRequestApplyRefusal,
  labelNeedsReprint,
  type ChangeRequestField,
  type RefuseChangeRequestValues,
} from '@faffago/shared';
import type { UserPrincipal } from '../auth/principal';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { ParcelEventService } from '../parcels/parcel-event.service';

/** A request as the team reads it (Admin 4.7, D-57): each field, now and asked. */
export interface ChangeRequestRow {
  id: string;
  status: string;
  createdAt: Date;
  editedAt: Date | null;
  handledAt: Date | null;
  sellerNote: string | null;
  refusalReason: string | null;
  parcel: { code: string; status: string; location: string; shopName: string };
  /** `before` is the parcel's value now, for a request still waiting. */
  fields: { field: ChangeRequestField; before: string | null; after: string | null }[];
  /** Why it cannot be applied now, for a request still waiting. */
  applyRefusal: ChangeRequestApplyRefusal | null;
  applyRefusalMessage: string | null;
}

type Fields = Partial<Record<ChangeRequestField, string>>;

const introuvable = () =>
  apiError(404, 'DEMANDE_INTROUVABLE', 'Demande de modification introuvable.');
const refused = (refusal: ChangeRequestApplyRefusal) =>
  apiError(409, refusal, CHANGE_REQUEST_APPLY_MESSAGES_FR[refusal]);

const REQUEST_INCLUDE = {
  parcel: {
    include: {
      seller: { select: { shopName: true } },
      localite: { include: { delegation: { select: { nameFr: true } } } },
    },
  },
} satisfies Prisma.SellerChangeRequestInclude;

type RequestRow = Prisma.SellerChangeRequestGetPayload<{ include: typeof REQUEST_INCLUDE }>;

function fieldsOf(request: SellerChangeRequest): Fields {
  const raw = (request.requestedFields ?? {}) as Record<string, unknown>;
  const out: Fields = {};
  for (const field of CHANGE_REQUEST_FIELDS) {
    if (typeof raw[field] === 'string') out[field] = raw[field];
  }
  return out;
}

/**
 * Applying seller change requests (Vendeur 4.6, D-44, D-57): Service client
 * and Admin apply a waiting request as a whole, or refuse it with a reason the
 * seller reads. The parcel is locked like the seller's own actions on it, so
 * the seller editing or withdrawing at the same moment waits for the team.
 */
@Injectable()
export class ChangeRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ParcelEventService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** The waiting requests, oldest first. */
  async waiting(): Promise<ChangeRequestRow[]> {
    const rows = await this.prisma.sellerChangeRequest.findMany({
      where: { status: ChangeRequestStatus.EN_ATTENTE },
      orderBy: { createdAt: 'asc' },
      include: REQUEST_INCLUDE,
    });
    return this.rows(rows);
  }

  /** Every request of one parcel, newest first: the Colis page. */
  async forParcel(parcelId: string): Promise<ChangeRequestRow[]> {
    const rows = await this.prisma.sellerChangeRequest.findMany({
      where: { parcelId },
      orderBy: { createdAt: 'desc' },
      include: REQUEST_INCLUDE,
    });
    return this.rows(rows);
  }

  async apply(actor: UserPrincipal, id: string): Promise<ChangeRequestRow> {
    await this.prisma.$transaction(async (tx) => {
      const { request, parcel } = await this.lockWaiting(tx, id);
      const fields = fieldsOf(request);
      const refusal = changeRequestApplyRefusal({
        status: parcel.status,
        location: parcel.location,
        fields,
      });
      if (refusal) throw refused(refusal);

      const data: Prisma.ParcelUncheckedUpdateInput = {};
      const changes: Record<string, { before: string | null; after: string | null }> = {};
      for (const field of CHANGE_REQUEST_FIELDS) {
        const after = fields[field];
        if (after === undefined) continue;
        const before = parcel[field];
        if (before === after) continue;
        changes[field] = { before, after };
        data[field] = after;
      }

      if (changes.localiteId) {
        const localite = await tx.localite.findUnique({
          where: { id: fields.localiteId! },
          include: { delegation: { select: { zoneId: true } } },
        });
        if (!localite?.isActive) throw refused(ChangeRequestApplyRefusal.LOCALITE_INACTIVE);
        const current = await tx.delegation.findUniqueOrThrow({
          where: { id: parcel.delegationId },
        });
        data.delegationId = localite.delegationId;
        // Another zone: a move to a livreur of the old one no longer holds (D-55).
        if (localite.delegation.zoneId !== current.zoneId) data.plannedLivreurId = null;
      }
      if (labelNeedsReprint(Object.keys(changes))) data.labelReprintNeeded = true;

      await this.events.recordAppliedChange(tx, {
        parcelId: parcel.id,
        actor,
        data,
        metadata: { changeRequestId: request.id, ...changes },
      });
      await tx.sellerChangeRequest.update({
        where: { id: request.id },
        data: {
          status: ChangeRequestStatus.APPLIQUEE,
          handledByUserId: actor.userId,
          handledAt: this.clock.now(),
        },
      });
    });
    return this.row(id);
  }

  async refuse(
    actor: UserPrincipal,
    id: string,
    input: RefuseChangeRequestValues,
  ): Promise<ChangeRequestRow> {
    await this.prisma.$transaction(async (tx) => {
      const { request } = await this.lockWaiting(tx, id);
      await tx.sellerChangeRequest.update({
        where: { id: request.id },
        data: {
          status: ChangeRequestStatus.REFUSEE,
          refusalReason: input.reason,
          handledByUserId: actor.userId,
          handledAt: this.clock.now(),
        },
      });
    });
    return this.row(id);
  }

  /** The request and its parcel, the parcel locked as the seller's routes lock it. */
  private async lockWaiting(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<{ request: SellerChangeRequest; parcel: Parcel }> {
    const found = await tx.sellerChangeRequest.findUnique({ where: { id } });
    if (!found) throw introuvable();
    await tx.$queryRaw`SELECT "id" FROM "parcels" WHERE "id" = ${found.parcelId}::uuid FOR UPDATE`;
    const request = await tx.sellerChangeRequest.findUniqueOrThrow({ where: { id } });
    if (request.status !== ChangeRequestStatus.EN_ATTENTE) {
      throw refused(ChangeRequestApplyRefusal.DEMANDE_TRAITEE);
    }
    const parcel = await tx.parcel.findUniqueOrThrow({ where: { id: request.parcelId } });
    return { request, parcel };
  }

  private async row(id: string): Promise<ChangeRequestRow> {
    const request = await this.prisma.sellerChangeRequest.findUniqueOrThrow({
      where: { id },
      include: REQUEST_INCLUDE,
    });
    return (await this.rows([request]))[0]!;
  }

  private async rows(requests: RequestRow[]): Promise<ChangeRequestRow[]> {
    // The localités asked for, named as the team reads them.
    const asked = requests
      .map((r) => fieldsOf(r).localiteId)
      .filter((value): value is string => value !== undefined);
    const localites = new Map(
      (
        await this.prisma.localite.findMany({
          where: { id: { in: [...new Set(asked)] } },
          include: { delegation: { select: { nameFr: true } } },
        })
      ).map((l) => [l.id, `${l.nameFr} — ${l.delegation.nameFr}`]),
    );

    return requests.map((request) => {
      const fields = fieldsOf(request);
      const parcel = request.parcel;
      const waiting = request.status === ChangeRequestStatus.EN_ATTENTE;
      const refusal = waiting
        ? changeRequestApplyRefusal({ status: parcel.status, location: parcel.location, fields })
        : null;
      return {
        id: request.id,
        status: request.status,
        createdAt: request.createdAt,
        editedAt: request.editedAt,
        handledAt: request.handledAt,
        sellerNote: request.sellerNote,
        refusalReason: request.refusalReason,
        parcel: {
          code: parcel.code,
          status: parcel.status,
          location: parcel.location,
          shopName: parcel.seller.shopName,
        },
        fields: CHANGE_REQUEST_FIELDS.filter((field) => fields[field] !== undefined).map(
          (field) => {
            if (field === 'localiteId') {
              return {
                field,
                before: waiting
                  ? `${parcel.localite.nameFr} — ${parcel.localite.delegation.nameFr}`
                  : null,
                after: localites.get(fields.localiteId!) ?? null,
              };
            }
            return { field, before: waiting ? parcel[field] : null, after: fields[field]! };
          },
        ),
        applyRefusal: refusal,
        applyRefusalMessage: refusal ? CHANGE_REQUEST_APPLY_MESSAGES_FR[refusal] : null,
      };
    });
  }
}
