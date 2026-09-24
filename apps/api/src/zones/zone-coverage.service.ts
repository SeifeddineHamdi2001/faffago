import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { coveringCourier, type Coverage, type ZoneRole, type ZoneSlot } from '@faffago/shared';

/** The UTC midnight a `@db.Date` column stores for a Tunis day `AAAA-MM-JJ`. */
export function dateColumnOf(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

export type ZoneCoverage = Record<ZoneRole, Coverage>;

/**
 * Who covers each zone on a given day (Admin 4.5, D-52): the titular, else
 * the backup, else nobody. A courier can work that day when his account is
 * active, he still accepts new work (D-12) and he is not marked absent.
 *
 * Worked out when read, never stored, so an absence or a new assignment
 * takes effect everywhere at once: Tournées, pickup planning.
 */
@Injectable()
export class ZoneCoverageService {
  async forDay(tx: Prisma.TransactionClient, dayKey: string): Promise<Map<string, ZoneCoverage>> {
    const date = dateColumnOf(dayKey);
    const zones = await tx.zone.findMany({
      where: { isActive: true },
      include: {
        assignments: {
          include: {
            courier: {
              include: {
                user: { select: { isActive: true, acceptsWork: true } },
                absences: { where: { date }, select: { id: true } },
              },
            },
          },
        },
      },
    });

    const available = new Set<string>();
    for (const zone of zones) {
      for (const { courier } of zone.assignments) {
        if (
          courier.accountState === 'ACTIF' &&
          courier.user.isActive &&
          courier.user.acceptsWork &&
          courier.absences.length === 0
        ) {
          available.add(courier.id);
        }
      }
    }
    const isAvailable = (id: string) => available.has(id);

    const coverage = new Map<string, ZoneCoverage>();
    for (const zone of zones) {
      const slot = (role: ZoneRole): ZoneSlot => ({
        titulaireId:
          zone.assignments.find((a) => a.role === role && a.kind === 'TITULAIRE')?.courierId ??
          null,
        backupId:
          zone.assignments.find((a) => a.role === role && a.kind === 'BACKUP')?.courierId ?? null,
      });
      coverage.set(zone.id, {
        LIVREUR: coveringCourier(slot('LIVREUR'), isAvailable),
        RAMASSEUR: coveringCourier(slot('RAMASSEUR'), isAvailable),
      });
    }
    return coverage;
  }
}
