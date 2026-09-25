import { Inject, Injectable } from '@nestjs/common';
import type { Parcel, Prisma } from '@prisma/client';
import {
  DECISION_MESSAGES_FR,
  DecisionErrorCode,
  PARCEL_MESSAGES,
  ParcelAction,
  ParcelErrorCode,
  ParcelLocation,
  ParcelStatus,
  RELANCER_CORRECTION_FIELDS,
  ScanRefusal,
  labelNeedsReprint,
  normalizeParcelCode,
  relaunchDateFromKey,
  type ChangerClientValues,
  type ChangerDateValues,
  type RelancerCorrectionField,
  type RelancerValues,
} from '@faffago/shared';
import { sellerIdOf, type UserPrincipal } from '../auth/principal';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { ParcelEventService, type ParcelActionResult } from '../parcels/parcel-event.service';
import { ParcelsService, type SellerParcelView } from '../parcels/parcels.service';

type Tx = Prisma.TransactionClient;

/** Another seller's parcel gets exactly the answer of an unknown code (D-26). */
const colisIntrouvable = () =>
  apiError(404, ParcelErrorCode.COLIS_INTROUVABLE, PARCEL_MESSAGES.COLIS_INTROUVABLE);
const decisionError = (code: DecisionErrorCode) => apiError(409, code, DECISION_MESSAGES_FR[code]);

export interface DecisionResult {
  parcel: SellerParcelView;
  /** A field printed on the label changed: the depot reprints it (A-9). */
  reprintLabel: boolean;
}

/** Money as its digit string in the event, like every amount (D-20). */
function asJson(value: unknown): Prisma.InputJsonValue | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  return value as Prisma.InputJsonValue;
}

/**
 * The seller's decisions on a failed delivery (Vendeur 4.9): Relancer,
 * Changer la date, Retourner, Changer de client. The seller's alone (D-4),
 * and taken even while suspended (D-25). Each runs the state machine through
 * the parcel event service, in one transaction with what it writes beside
 * the status: the corrections of a Relancer (D-70), the new customer of a
 * Changer de client with its history row and fee (A-17, D-74).
 */
@Injectable()
export class DecisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ParcelEventService,
    private readonly parcels: ParcelsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Relancer (D-29, D-70): a date and a slot, and the corrections applied
   * directly. The localité is not among them: it stays a change request.
   */
  async relancer(
    principal: UserPrincipal,
    code: string,
    values: RelancerValues,
  ): Promise<DecisionResult> {
    const reprintLabel = await this.prisma.$transaction(async (tx) => {
      const parcel = await this.owned(tx, principal, code);
      if (parcel.status !== ParcelStatus.A_VERIFIER) {
        throw decisionError(DecisionErrorCode.DECISION_IMPOSSIBLE);
      }

      const data: Prisma.ParcelUncheckedUpdateInput = {};
      const changes: Record<
        string,
        { before: Prisma.InputJsonValue | null; after: Prisma.InputJsonValue | null }
      > = {};
      const changed: RelancerCorrectionField[] = [];
      for (const field of RELANCER_CORRECTION_FIELDS) {
        const next = values[field];
        if (next === undefined) continue;
        if (asJson(parcel[field]) === asJson(next)) continue;
        changes[field] = { before: asJson(parcel[field]), after: asJson(next) };
        changed.push(field);
        (data as Record<string, unknown>)[field] = next;
      }
      const reprint = labelNeedsReprint(changed);

      this.assertApplied(
        await this.events.apply(tx, {
          parcelId: parcel.id,
          actor: principal,
          request: {
            action: ParcelAction.DECISION_RELANCER,
            postponedTo: relaunchDateFromKey(values.date),
            relaunchSlot: values.slot ?? null,
          },
          context: changed.length > 0 ? { details: { changes } } : undefined,
        }),
      );
      if (changed.length > 0) {
        // The label on the parcel carries the old details: the depot reprints
        // it with the same code before it goes out again (A-9, D-57).
        if (reprint) data.labelReprintNeeded = true;
        await tx.parcel.update({ where: { id: parcel.id }, data });
      }
      return reprint;
    });
    return { parcel: await this.parcels.get(principal, code), reprintLabel };
  }

  /** Changer la date of a relance or a customer postponement (D-9). */
  async changerDate(
    principal: UserPrincipal,
    code: string,
    values: ChangerDateValues,
  ): Promise<DecisionResult> {
    await this.prisma.$transaction(async (tx) => {
      const parcel = await this.owned(tx, principal, code);
      if (parcel.status !== ParcelStatus.RELANCE) {
        throw decisionError(DecisionErrorCode.DECISION_IMPOSSIBLE);
      }
      this.assertApplied(
        await this.events.apply(tx, {
          parcelId: parcel.id,
          actor: principal,
          request: {
            action: ParcelAction.DECISION_CHANGER_DATE,
            postponedTo: relaunchDateFromKey(values.date),
            relaunchSlot: values.slot ?? null,
          },
        }),
      );
    });
    return { parcel: await this.parcels.get(principal, code), reprintLabel: false };
  }

  /** Retourner: the return fee frozen on the parcel, the clock stopped (A-7). */
  async retourner(principal: UserPrincipal, code: string): Promise<DecisionResult> {
    await this.prisma.$transaction(async (tx) => {
      const parcel = await this.owned(tx, principal, code);
      if (parcel.status !== ParcelStatus.A_VERIFIER && parcel.status !== ParcelStatus.RELANCE) {
        throw decisionError(DecisionErrorCode.DECISION_IMPOSSIBLE);
      }
      this.assertApplied(
        await this.events.apply(tx, {
          parcelId: parcel.id,
          actor: principal,
          request: { action: ParcelAction.DECISION_RETOURNER },
        }),
      );
    });
    return { parcel: await this.parcels.get(principal, code), reprintLabel: false };
  }

  /**
   * Changer de client (Vendeur 4.9, A-6, A-17, D-8, D-72, D-74): only at the
   * depot, once per parcel. The parcel shows the new customer everywhere; the
   * previous one is kept in `parcel_client_changes`. The fee is the one frozen
   * on the parcel. A change request filed for the old customer is withdrawn.
   */
  async changerClient(
    principal: UserPrincipal,
    code: string,
    values: ChangerClientValues,
  ): Promise<DecisionResult> {
    await this.prisma.$transaction(async (tx) => {
      const parcel = await this.owned(tx, principal, code);
      if (parcel.status !== ParcelStatus.A_VERIFIER && parcel.status !== ParcelStatus.RELANCE) {
        throw decisionError(DecisionErrorCode.DECISION_IMPOSSIBLE);
      }
      if (parcel.location !== ParcelLocation.AU_DEPOT) {
        throw decisionError(DecisionErrorCode.CHANGEMENT_CLIENT_AU_RETOUR_DEPOT);
      }
      const localite = await tx.localite.findUnique({ where: { id: values.localiteId } });
      if (!localite) throw apiError(400, 'LOCALITE_INTROUVABLE', 'Localité introuvable.');
      if (!localite.isActive) {
        // Closed to new parcels, and the new customer is one (D-27).
        throw apiError(
          400,
          'LOCALITE_INACTIVE',
          'Cette localité n’est plus proposée. Choisissez-en une autre.',
        );
      }

      const result = this.assertApplied(
        await this.events.apply(tx, {
          parcelId: parcel.id,
          actor: principal,
          request: { action: ParcelAction.DECISION_CHANGER_CLIENT },
          context: {
            details: {
              changementClient: {
                codAvant: parcel.codAmountMillimes.toString(),
                codApres: values.codAmountMillimes.toString(),
              },
            },
          },
        }),
      );
      const fee = result.charges.find((charge) => charge.type === 'CHANGEMENT_CLIENT');

      await tx.parcelClientChange.create({
        data: {
          parcelId: parcel.id,
          previousName: parcel.recipientName,
          previousPhone: parcel.recipientPhone,
          previousPhone2: parcel.recipientPhone2,
          previousDelegationId: parcel.delegationId,
          previousLocaliteId: parcel.localiteId,
          previousAddress: parcel.address,
          previousLandmark: parcel.landmark,
          previousCourierNote: parcel.courierNote,
          previousIsExchange: parcel.isExchange,
          previousOpeningAllowed: parcel.openingAllowed,
          previousCodMillimes: parcel.codAmountMillimes,
          newCodMillimes: values.codAmountMillimes,
          feeMillimes: parcel.changeClientFeeMillimes,
          chargeId: fee?.id ?? null,
          decidedByUserId: principal.userId,
          createdAt: this.clock.now(),
        },
      });

      await tx.parcel.update({
        where: { id: parcel.id },
        data: {
          recipientName: values.recipientName,
          recipientPhone: values.recipientPhone,
          recipientPhone2: values.recipientPhone2 ?? null,
          delegationId: localite.delegationId,
          localiteId: localite.id,
          address: values.address,
          landmark: values.landmark ?? null,
          codAmountMillimes: values.codAmountMillimes,
          isExchange: values.isExchange,
          openingAllowed: values.openingAllowed,
          courierNote: values.courierNote ?? null,
          // A new customer, like a new parcel: nothing of the old one's
          // delivery carries over — the failure, the meeting point, the plan
          // of Tournées (the zone may have changed).
          lastFailureReason: null,
          lastFailureNote: null,
          meetingPoint: null,
          plannedLivreurId: null,
          // Every printed field changed: the depot reprints with the same code (A-9).
          labelReprintNeeded: true,
        },
      });

      // Filed for the old customer, it must never be applied to the new one (D-72).
      await tx.sellerChangeRequest.updateMany({
        where: { parcelId: parcel.id, status: 'EN_ATTENTE' },
        data: { status: 'RETIREE', handledByUserId: principal.userId, handledAt: this.clock.now() },
      });
    });
    return { parcel: await this.parcels.get(principal, code), reprintLabel: true };
  }

  // ── helpers ────────────────────────────────────────────────

  /** The seller's own parcel, locked until the transaction ends (D-26). */
  private async owned(tx: Tx, principal: UserPrincipal, rawCode: string): Promise<Parcel> {
    const code = normalizeParcelCode(rawCode);
    await tx.$queryRaw`SELECT "id" FROM "parcels" WHERE "code" = ${code} FOR UPDATE`;
    const parcel = await tx.parcel.findUnique({ where: { code } });
    if (!parcel || parcel.sellerId !== sellerIdOf(principal)) throw colisIntrouvable();
    return parcel;
  }

  private assertApplied(result: ParcelActionResult) {
    if (result.ok) return result;
    if (result.refusal === ScanRefusal.CODE_INCONNU) throw colisIntrouvable();
    throw apiError(409, result.refusal, result.message);
  }
}
