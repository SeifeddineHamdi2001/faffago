import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  BON_CORRECTION_REFUSAL_MESSAGES_FR,
  CashTransition,
  ParcelAction,
  ParcelStatus,
  bonRetourLineCorrection,
  bonVersementCorrection,
  documentDateKey,
  sumMillimes,
  type BonCorrectionRefusal,
  type CorrectBonRetourLineValues,
} from '@faffago/shared';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { UserPrincipal } from '../auth/principal';
import type { RequestMeta } from '../auth/sessions.service';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { ParcelEventService } from '../parcels/parcel-event.service';

type Db = Prisma.TransactionClient;

function refused(refusal: BonCorrectionRefusal) {
  return apiError(409, refusal, BON_CORRECTION_REFUSAL_MESSAGES_FR[refusal]);
}

/**
 * Corriger un bon (D-88): a bon de versement scanned Remis, or a line of a bon
 * de retour scanned Retour reçu, by mistake. The admin alone, with a reason;
 * the mistaken scan is marked cancelled with it, every parcel moves through
 * the parcel event service, a `bon_corrections` row and an audit entry are
 * written, all in one transaction. Refused once the bon is Archivé. No fee
 * changes: the charges on the bon stay as they were.
 */
@Injectable()
export class BonCorrectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ParcelEventService,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * A bon de versement back from Remis. His caisse of the day he carried it
   * still open: En route with him, the cash expected from him again. Closed:
   * Préparé and unattached, the cash at the depot where his surplus brought
   * it; what the surplus does not cover is his shortfall, for HR.
   */
  async correctBonVersement(actor: UserPrincipal, id: string, reason: string, meta: RequestMeta) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "bons_versement" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const bon = await tx.bonVersement.findUnique({ where: { id } });
      if (!bon) throw apiError(404, 'BON_INTROUVABLE', 'Bon de versement introuvable');

      // The session of the day he carried it: the last hand-out's.
      const cashLine = await tx.caisseSessionBon.findFirst({
        where: { bonVersementId: id },
        orderBy: { caisseSession: { businessDate: 'desc' } },
      });
      const session = cashLine ? await this.lockedSession(tx, cashLine.caisseSessionId) : null;
      const caisseClosed = session?.status === 'CLOTUREE';
      const surplus =
        caisseClosed && (session!.ecartMillimes ?? 0n) > 0n ? session!.ecartMillimes! : 0n;
      const explained = session
        ? await tx.bonCorrection.findMany({
            where: { caisseSessionId: session.id },
            select: { coveredBySurplusMillimes: true },
          })
        : [];
      const outcome = bonVersementCorrection({
        status: bon.status,
        caisseClosed,
        netMillimes: bon.netMillimes,
        surplusMillimes: surplus,
        surplusAlreadyExplainedMillimes: sumMillimes(
          explained.map((row) => row.coveredBySurplusMillimes),
        ),
      });
      if (!outcome.ok) throw refused(outcome.refusal);
      if (!cashLine || !session) {
        throw apiError(409, 'CAISSE_INTROUVABLE', 'Aucune caisse ne porte ce bon');
      }

      const now = this.clock.now();
      const lines = await tx.bonVersementParcel.findMany({
        where: { bonVersementId: id, releasedAt: null },
      });
      for (const line of lines) {
        await this.events.recordCashTransition(tx, {
          parcelId: line.parcelId,
          actor,
          transition: CashTransition.BON_CORRIGE,
          reason,
          metadata: { bonVersement: bon.number },
        });
      }
      if (bon.remisScanId) await this.cancelScan(tx, bon.remisScanId, actor, reason, now);

      if (outcome.bonStatusAfter === 'EN_ROUTE') {
        await tx.bonVersement.update({
          where: { id },
          data: { status: 'EN_ROUTE', remisAt: null, remisScanId: null },
        });
        // His caisse expects the cash again; a count made since no longer matches.
        await tx.caisseSessionBon.update({
          where: {
            caisseSessionId_bonVersementId: { caisseSessionId: session.id, bonVersementId: id },
          },
          data: { remisMillimes: 0n },
        });
      } else {
        await tx.bonVersement.update({
          where: { id },
          data: {
            status: 'PREPARE',
            remisAt: null,
            remisScanId: null,
            ramasseurId: null,
            pickupId: null,
            plannedDate: null,
            enRouteAt: null,
          },
        });
        if (outcome.surplusExplained && !session.ecartCheckedAt) {
          await tx.caisseSession.update({
            where: { id: session.id },
            data: {
              ecartCheckedAt: now,
              ecartCheckedByUserId: actor.userId,
              ecartNote: `Expliqué par la correction du bon ${bon.number}`,
            },
          });
        }
      }

      const correction = await tx.bonCorrection.create({
        data: {
          bonVersementId: id,
          scanId: bon.remisScanId,
          statusBefore: bon.status,
          statusAfter: outcome.bonStatusAfter,
          courierId: session.courierId,
          caisseSessionId: session.id,
          caisseClosed,
          coveredBySurplusMillimes: outcome.coveredBySurplusMillimes,
          shortfallMillimes: outcome.shortfallMillimes,
          reason,
          actorUserId: actor.userId,
          createdAt: now,
        },
      });
      await this.audit.record(tx, {
        actor: { userId: actor.userId, role: actor.role },
        action: AuditAction.CORRECTION_BON_VERSEMENT,
        entityType: 'bon_versement',
        entityId: id,
        before: { numero: bon.number, statut: bon.status, net: bon.netMillimes.toString() },
        after: {
          statut: outcome.bonStatusAfter,
          caisse: documentDateKey(session.businessDate),
          caisseCloturee: caisseClosed,
          couvertParSurplus: outcome.coveredBySurplusMillimes.toString(),
          manquant: outcome.shortfallMillimes.toString(),
          colis: lines.length,
        },
        reason,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return correctionView(correction);
    });
  }

  /**
   * A line of a bon de retour back from Retour reçu. His caisse of the day he
   * received it still open and the bon still his: the parcel Retour en route
   * with him, the bon En route. Closed: the parcel Retour au dépôt, at the
   * depot, the bon Préparé and unattached (the new transition out of Retour
   * reçu). The old item of an échange follows its line without a status.
   */
  async correctBonRetourLine(
    actor: UserPrincipal,
    id: string,
    input: CorrectBonRetourLineValues,
    meta: RequestMeta,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "bons_retour" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const bon = await tx.bonRetour.findUnique({ where: { id } });
      if (!bon) throw apiError(404, 'BON_INTROUVABLE', 'Bon de retour introuvable');
      const line = await tx.bonRetourParcel.findFirst({
        where: { bonRetourId: id, itemType: input.itemType, parcel: { code: input.parcelCode } },
      });
      if (!line) throw apiError(404, 'LIGNE_INTROUVABLE', 'Ce colis n’est pas sur ce bon');
      await tx.$queryRaw`SELECT "id" FROM "parcels" WHERE "id" = ${line.parcelId}::uuid FOR UPDATE`;

      const scan = line.scanId ? await tx.scan.findUnique({ where: { id: line.scanId } }) : null;
      const scanCourier = scan
        ? await tx.courier.findUnique({ where: { userId: scan.actorUserId }, select: { id: true } })
        : null;
      const session =
        scan && scanCourier
          ? await tx.caisseSession.findUnique({
              where: {
                courierId_businessDate: {
                  courierId: scanCourier.id,
                  businessDate: scan.businessDate,
                },
              },
            })
          : null;
      const caisseClosed = session?.status === 'CLOTUREE';
      const outcome = bonRetourLineCorrection({
        bonStatus: bon.status,
        lineReceived: line.receivedAt !== null,
        caisseClosed,
        sameCarrier: scanCourier !== null && bon.ramasseurId === scanCourier.id,
      });
      if (!outcome.ok) throw refused(outcome.refusal);

      const now = this.clock.now();
      const withRamasseur = outcome.parcelTo === 'RAMASSEUR';
      if (line.itemType === 'COLIS') {
        const moved = await this.events.apply(tx, {
          parcelId: line.parcelId,
          actor,
          request: { action: ParcelAction.CORRECTION_RETOUR_RECU, correctionTo: outcome.parcelTo },
          context: { note: input.reason, details: { bonRetour: bon.number } },
        });
        if (!moved.ok) throw apiError(409, moved.refusal, moved.message);
      } else {
        await this.events.recordExchangeItemCorrection(tx, {
          parcelId: line.parcelId,
          actor,
          itemStatus: withRamasseur ? ParcelStatus.RETOUR_EN_ROUTE : ParcelStatus.RETOUR_AU_DEPOT,
          reason: input.reason,
          bonNumber: bon.number,
        });
      }
      await tx.bonRetourParcel.update({
        where: {
          bonRetourId_parcelId_itemType: {
            bonRetourId: id,
            parcelId: line.parcelId,
            itemType: line.itemType,
          },
        },
        data: { receivedAt: null, scanId: null },
      });
      if (scan && !scan.cancelledAt) await this.cancelScan(tx, scan.id, actor, input.reason, now);
      await tx.bonRetour.update({
        where: { id },
        data: withRamasseur
          ? { status: 'EN_ROUTE', remisAt: null }
          : {
              status: 'PREPARE',
              remisAt: null,
              ramasseurId: null,
              pickupId: null,
              plannedDate: null,
              enRouteAt: null,
            },
      });

      const correction = await tx.bonCorrection.create({
        data: {
          bonRetourId: id,
          parcelId: line.parcelId,
          itemType: line.itemType,
          scanId: line.scanId,
          statusBefore: bon.status,
          statusAfter: outcome.bonStatusAfter,
          courierId: scanCourier?.id ?? null,
          caisseSessionId: session?.id ?? null,
          caisseClosed,
          reason: input.reason,
          actorUserId: actor.userId,
          createdAt: now,
        },
      });
      await this.audit.record(tx, {
        actor: { userId: actor.userId, role: actor.role },
        action: AuditAction.CORRECTION_BON_RETOUR,
        entityType: 'bon_retour',
        entityId: id,
        before: {
          numero: bon.number,
          statut: bon.status,
          colis: input.parcelCode,
          ligne: line.itemType,
          recu: true,
        },
        after: { statut: outcome.bonStatusAfter, recu: false, vers: outcome.parcelTo },
        reason: input.reason,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return correctionView(correction);
    });
  }

  /** The corrections of one bon, for staff: when, who, why, the money it moved. */
  async ofBon(filter: { bonVersementId: string } | { bonRetourId: string }) {
    const rows = await this.prisma.bonCorrection.findMany({
      where: filter,
      orderBy: { createdAt: 'asc' },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.actorUserId))] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const codes = await this.prisma.parcel.findMany({
      where: { id: { in: rows.flatMap((row) => (row.parcelId ? [row.parcelId] : [])) } },
      select: { id: true, code: true },
    });
    return rows.map((row) => {
      const user = users.find((u) => u.id === row.actorUserId);
      return {
        ...correctionView(row),
        parcelCode: codes.find((p) => p.id === row.parcelId)?.code ?? null,
        by: user ? `${user.firstName} ${user.lastName}` : null,
      };
    });
  }

  private async lockedSession(tx: Db, sessionId: string) {
    await tx.$queryRaw`SELECT "id" FROM "caisse_sessions" WHERE "id" = ${sessionId}::uuid FOR UPDATE`;
    return tx.caisseSession.findUniqueOrThrow({ where: { id: sessionId } });
  }

  /** The mistaken scan, cancelled by the admin with the reason (as D-56 does for a depot scan). */
  private async cancelScan(tx: Db, scanId: string, actor: UserPrincipal, why: string, now: Date) {
    await tx.scan.update({
      where: { id: scanId },
      data: { cancelledAt: now, cancelledByUserId: actor.userId, cancelReason: why },
    });
  }
}

function correctionView(row: {
  id: string;
  statusBefore: string;
  statusAfter: string;
  itemType: string | null;
  caisseClosed: boolean;
  coveredBySurplusMillimes: bigint;
  shortfallMillimes: bigint;
  reason: string;
  createdAt: Date;
}) {
  return {
    id: row.id,
    statusBefore: row.statusBefore,
    statusAfter: row.statusAfter,
    itemType: row.itemType,
    caisseClosed: row.caisseClosed,
    coveredBySurplusMillimes: row.coveredBySurplusMillimes,
    shortfallMillimes: row.shortfallMillimes,
    reason: row.reason,
    createdAt: row.createdAt,
  };
}
