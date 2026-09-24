import { Injectable } from '@nestjs/common';
import {
  FORCAGE_MESSAGES_FR,
  ForcageRefusal,
  PARCEL_MESSAGES,
  ParcelErrorCode,
  forcedStatusRefusal,
  isValidParcelCode,
  normalizeParcelCode,
  targetNeedsLivreur,
  type ForcerStatutValues,
} from '@faffago/shared';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { UserPrincipal } from '../auth/principal';
import type { RequestMeta } from '../auth/sessions.service';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { ParcelEventService } from '../parcels/parcel-event.service';

const colisIntrouvable = () =>
  apiError(404, ParcelErrorCode.COLIS_INTROUVABLE, PARCEL_MESSAGES.COLIS_INTROUVABLE);
const refused = (refusal: ForcageRefusal) => apiError(409, refusal, FORCAGE_MESSAGES_FR[refusal]);

/**
 * Forcer un statut (Admin 4.3, 4.17, D-56): the admin alone, a reason
 * required, one FORCAGE_STATUT event and an audit entry before and after.
 * Phase 5 allows only the moves that involve no money and no seller
 * decision, and runs no effect.
 */
@Injectable()
export class ForcageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ParcelEventService,
    private readonly audit: AuditService,
  ) {}

  async force(actor: UserPrincipal, rawCode: string, input: ForcerStatutValues, meta: RequestMeta) {
    const code = normalizeParcelCode(rawCode);
    if (!isValidParcelCode(code)) throw colisIntrouvable();

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "parcels" WHERE "code" = ${code} FOR UPDATE`;
      const parcel = await tx.parcel.findUnique({ where: { code } });
      if (!parcel) throw colisIntrouvable();

      const target = { status: input.status, location: input.location };
      const refusal = forcedStatusRefusal(
        { status: parcel.status, location: parcel.location },
        target,
      );
      if (refusal) throw refused(refusal);

      let livreurCourierId: string | null = null;
      if (targetNeedsLivreur(target)) {
        const livreur = await tx.courier.findFirst({
          where: { user: { id: input.livreurId, role: 'LIVREUR' } },
          select: { id: true },
        });
        if (!livreur) throw refused(ForcageRefusal.LIVREUR_INVALIDE);
        livreurCourierId = livreur.id;
      }

      const updated = await this.events.forceStatus(tx, {
        parcelId: parcel.id,
        actor,
        target,
        livreurCourierId,
        reason: input.reason,
      });
      await this.audit.record(tx, {
        actor: { userId: actor.userId, role: actor.role },
        action: AuditAction.FORCAGE_STATUT,
        entityType: 'parcel',
        entityId: parcel.id,
        before: {
          status: parcel.status,
          location: parcel.location,
          currentLivreurId: parcel.currentLivreurId,
        },
        after: {
          status: updated.status,
          location: updated.location,
          currentLivreurId: updated.currentLivreurId,
        },
        reason: input.reason,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      const livreur = updated.currentLivreurId
        ? await tx.courier.findUnique({
            where: { id: updated.currentLivreurId },
            select: { user: { select: { id: true, firstName: true, lastName: true } } },
          })
        : null;
      return {
        code: updated.code,
        status: updated.status,
        location: updated.location,
        currentLivreur: livreur?.user ?? null,
      };
    });
  }
}
