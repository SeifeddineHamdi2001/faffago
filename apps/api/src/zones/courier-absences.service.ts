import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  COURIER_ROLES,
  canMarkAbsentOn,
  isTunisDayKey,
  tunisDayKey,
  type CourierAbsenceValues,
} from '@faffago/shared';
import { AuditAction, AuditService } from '../audit/audit.service';
import type { UserPrincipal } from '../auth/principal';
import type { RequestMeta } from '../auth/sessions.service';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { ZoneCoverageService, dateColumnOf } from './zone-coverage.service';

export interface AbsenceView {
  date: string;
  reason: string | null;
}

export interface AbsenceResult {
  absence: AbsenceView;
  /** The ramasseur's pickups of that day, handed to whoever covers their zone (D-52). */
  pickupsMoved: Array<{
    id: string;
    shopName: string;
    ramasseur: { id: string; firstName: string };
  }>;
  /** Those nobody else could take: they keep their ramasseur and must be re-planned. */
  pickupsNotMoved: Array<{ id: string; shopName: string }>;
}

const coursierIntrouvable = () => apiError(404, 'COURSIER_INTROUVABLE', 'Coursier introuvable.');
const absenceExiste = () =>
  apiError(409, 'ABSENCE_EXISTE', 'Ce coursier est déjà marqué absent ce jour-là.');
const absenceIntrouvable = () => apiError(404, 'ABSENCE_INTROUVABLE', 'Aucune absence ce jour-là.');
const datePassee = () =>
  apiError(409, 'ABSENCE_DATE_PASSEE', 'Choisissez aujourd’hui ou un jour à venir.');
const dateInvalide = () => apiError(400, 'DATE_INVALIDE', 'Date invalide.');

function dayKeyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Marking a courier absent for a day (Admin 4.5, D-52). Admin and Dépôt,
 * audited. His zones switch to their backup for that day, which Tournées and
 * pickup planning work out when they read; the pickups a ramasseur already
 * had planned that day move in the same transaction.
 */
@Injectable()
export class CourierAbsencesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly coverage: ZoneCoverageService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Today's absence and those to come. */
  async list(userId: string): Promise<AbsenceView[]> {
    const courier = await this.courierOf(this.prisma, userId);
    const rows = await this.prisma.courierAbsence.findMany({
      where: { courierId: courier.id, date: { gte: dateColumnOf(this.today()) } },
      orderBy: { date: 'asc' },
    });
    return rows.map((row) => ({ date: dayKeyOf(row.date), reason: row.reason }));
  }

  async mark(
    actor: UserPrincipal,
    userId: string,
    input: CourierAbsenceValues,
    meta: RequestMeta,
  ): Promise<AbsenceResult> {
    if (!canMarkAbsentOn(input.date, this.today())) throw datePassee();
    const date = dateColumnOf(input.date);

    return this.prisma.$transaction(async (tx) => {
      const courier = await this.courierOf(tx, userId);
      if (
        await tx.courierAbsence.findUnique({
          where: { courierId_date: { courierId: courier.id, date } },
        })
      ) {
        throw absenceExiste();
      }
      await tx.courierAbsence.create({
        data: {
          courierId: courier.id,
          date,
          reason: input.reason ?? null,
          createdByUserId: actor.userId,
        },
      });

      const result: AbsenceResult = {
        absence: { date: input.date, reason: input.reason ?? null },
        pickupsMoved: [],
        pickupsNotMoved: [],
      };

      const pickups = await tx.pickup.findMany({
        where: { ramasseurId: courier.id, status: 'PLANIFIE', plannedDate: date },
        orderBy: { createdAt: 'asc' },
        include: {
          seller: { select: { shopName: true } },
          pickupAddress: { select: { delegation: { select: { zoneId: true } } } },
        },
      });
      if (pickups.length > 0) {
        // Read after the absence is written, so he no longer covers his zones.
        const coverage = await this.coverage.forDay(tx, input.date);
        for (const pickup of pickups) {
          const zoneId = pickup.pickupAddress.delegation.zoneId;
          const replacement = zoneId ? coverage.get(zoneId)?.RAMASSEUR.courierId : null;
          if (!replacement || replacement === courier.id) {
            result.pickupsNotMoved.push({ id: pickup.id, shopName: pickup.seller.shopName });
            continue;
          }
          await tx.pickup.update({ where: { id: pickup.id }, data: { ramasseurId: replacement } });
          const user = await tx.user.findFirstOrThrow({
            where: { courier: { id: replacement } },
            select: { id: true, firstName: true },
          });
          result.pickupsMoved.push({
            id: pickup.id,
            shopName: pickup.seller.shopName,
            ramasseur: user,
          });
        }
      }

      await this.audit.record(tx, {
        actor: { userId: actor.userId, role: actor.role },
        action: AuditAction.MARQUAGE_ABSENCE,
        entityType: 'courier',
        entityId: userId,
        after: {
          date: input.date,
          reason: input.reason ?? null,
          pickupsMoved: result.pickupsMoved.map((p) => p.id),
          pickupsNotMoved: result.pickupsNotMoved.map((p) => p.id),
        },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return result;
    });
  }

  /**
   * Removes an absence of today or later. Pickups moved when it was marked
   * stay with the ramasseur who took them: the team re-plans if it wants.
   */
  async remove(actor: UserPrincipal, userId: string, day: string, meta: RequestMeta) {
    if (!isTunisDayKey(day)) throw dateInvalide();
    if (!canMarkAbsentOn(day, this.today())) throw datePassee();
    const date = dateColumnOf(day);

    await this.prisma.$transaction(async (tx) => {
      const courier = await this.courierOf(tx, userId);
      const absence = await tx.courierAbsence.findUnique({
        where: { courierId_date: { courierId: courier.id, date } },
      });
      if (!absence) throw absenceIntrouvable();
      await tx.courierAbsence.delete({ where: { id: absence.id } });
      await this.audit.record(tx, {
        actor: { userId: actor.userId, role: actor.role },
        action: AuditAction.SUPPRESSION_ABSENCE,
        entityType: 'courier',
        entityId: userId,
        before: { date: day, reason: absence.reason },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    });
  }

  private today(): string {
    return tunisDayKey(this.clock.now());
  }

  private async courierOf(db: Prisma.TransactionClient, userId: string): Promise<{ id: string }> {
    const user = await db.user.findFirst({
      where: { id: userId, role: { in: [...COURIER_ROLES] } },
      select: { courier: { select: { id: true } } },
    });
    if (!user?.courier) throw coursierIntrouvable();
    return user.courier;
  }
}
