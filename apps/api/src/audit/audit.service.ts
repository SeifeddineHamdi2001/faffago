import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, Role } from '@prisma/client';
import { CLOCK, type Clock } from '../common/clock';

/** Actions written by the auth and account work (Journal d'audit, Admin 4.17). */
export const AuditAction = {
  CREATION_COMPTE: 'CREATION_COMPTE',
  REGENERATION_MOT_DE_PASSE: 'REGENERATION_MOT_DE_PASSE',
  DESACTIVATION_COMPTE: 'DESACTIVATION_COMPTE',
  /** Step 1 of a courier deactivation: no new work from now on (D-12). */
  ARRET_NOUVEAU_TRAVAIL: 'ARRET_NOUVEAU_TRAVAIL',
  REACTIVATION_COMPTE: 'REACTIVATION_COMPTE',
  VOIR_COMME_VENDEUR_DEBUT: 'VOIR_COMME_VENDEUR_DEBUT',
  VOIR_COMME_VENDEUR_FIN: 'VOIR_COMME_VENDEUR_FIN',
} as const;
export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];

export interface AuditActor {
  userId: string;
  role: Role;
}

export interface AuditEntry {
  /** Null for the system (a scheduled job). */
  actor: AuditActor | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  reason?: string;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Appends to `audit_log`. Always called with the transaction of the change it
 * records, so an action and its audit entry commit or roll back together.
 * Never pass a password or a hash in `before` / `after`.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  async record(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorUserId: entry.actor?.userId ?? null,
        actorRole: entry.actor?.role ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before,
        after: entry.after,
        reason: entry.reason,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
        createdAt: this.clock.now(),
      },
    });
  }
}
