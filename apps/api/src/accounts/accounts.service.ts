import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import {
  AUTH_MESSAGES,
  AuthErrorCode,
  Role,
  STAFF_ROLES,
  type CreateCourierAccountValues,
  type CreateStaffAccountValues,
} from '@faffago/shared';
import { AuditAction, AuditService, type AuditActor } from '../audit/audit.service';
import { PasswordsService } from '../auth/passwords.service';
import type { UserPrincipal } from '../auth/principal';
import { RevokeReason, SessionsService, type RequestMeta } from '../auth/sessions.service';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';

type Tx = Prisma.TransactionClient;

export interface AccountView {
  id: string;
  role: Role;
  username: string | null;
  email: string | null;
  phone: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
}

/** Shown once in the copy box, "Copier les identifiants" (Admin v1.10). */
export interface CreatedAccount {
  user: AccountView;
  password: string;
}

function view(user: User): AccountView {
  return {
    id: user.id,
    role: user.role,
    username: user.username,
    email: user.email,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    isActive: user.isActive,
  };
}

function actorOf(principal: UserPrincipal): AuditActor {
  return { userId: principal.userId, role: principal.role };
}

const identifiantDejaUtilise = () =>
  apiError(409, AuthErrorCode.IDENTIFIANT_DEJA_UTILISE, AUTH_MESSAGES.identifiantDejaUtilise);
const telephoneDejaUtilise = () =>
  apiError(409, AuthErrorCode.TELEPHONE_DEJA_UTILISE, AUTH_MESSAGES.telephoneDejaUtilise);
const introuvable = () => apiError(404, 'INTROUVABLE', 'Compte introuvable');

/**
 * Identifiants et mots de passe (Admin v1.10, A-20). Every account is created
 * by the admin with a generated password shown once; only the admin can
 * regenerate it. Each change and its audit entry commit together.
 *
 * Seller accounts arrive with the seller module (phase 3), because creating
 * one needs the CIN documents in private storage.
 */
@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordsService,
    private readonly sessions: SessionsService,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async createStaff(
    actor: UserPrincipal,
    input: CreateStaffAccountValues,
    meta: RequestMeta,
  ): Promise<CreatedAccount> {
    const password = this.passwords.generate();
    const passwordHash = await this.passwords.hash(password);

    const user = await this.withUniqueErrors(() =>
      this.prisma.$transaction(async (tx) => {
        if (await tx.user.findFirst({ where: { username: input.username } })) {
          throw identifiantDejaUtilise();
        }
        // Q8: two staff members never share a phone, whatever their roles.
        if (
          await tx.user.findFirst({ where: { phone: input.phone, role: { in: [...STAFF_ROLES] } } })
        ) {
          throw telephoneDejaUtilise();
        }
        const created = await tx.user.create({
          data: {
            role: input.role,
            username: input.username,
            phone: input.phone,
            firstName: input.firstName,
            lastName: input.lastName,
            passwordHash,
          },
        });
        await this.auditCreation(tx, actor, created, meta);
        return created;
      }),
    );
    return { user: view(user), password };
  }

  /** Admin 4.15. Zones are assigned separately (phase 4). */
  async createCourier(
    actor: UserPrincipal,
    input: CreateCourierAccountValues,
    meta: RequestMeta,
  ): Promise<CreatedAccount> {
    const password = this.passwords.generate();
    const passwordHash = await this.passwords.hash(password);

    const user = await this.withUniqueErrors(() =>
      this.prisma.$transaction(async (tx) => {
        // One livreur and one ramasseur account may share a phone, never two
        // of the same role (Admin 4.15).
        if (
          await tx.user.findUnique({
            where: { phone_role: { phone: input.phone, role: input.role } },
          })
        ) {
          throw telephoneDejaUtilise();
        }
        const created = await tx.user.create({
          data: {
            role: input.role,
            phone: input.phone,
            firstName: input.firstName,
            lastName: input.lastName,
            langue: input.langue,
            passwordHash,
            courier: {
              create: {
                cin: input.cin,
                vehicle: input.vehicle ?? null,
                payPlan: input.role === Role.LIVREUR ? input.payPlan : null,
              },
            },
          },
        });
        await this.auditCreation(tx, actor, created, meta, {
          cin: input.cin,
          payPlan: input.payPlan ?? null,
        });
        return created;
      }),
    );
    return { user: view(user), password };
  }

  /**
   * Régénérer le mot de passe: any account, at any time, every session
   * revoked. Refused for the last active admin, who uses admin:reset (Q9).
   */
  async regeneratePassword(
    actor: UserPrincipal,
    userId: string,
    meta: RequestMeta,
  ): Promise<{ password: string }> {
    const password = this.passwords.generate();
    const passwordHash = await this.passwords.hash(password);

    await this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id: userId } });
      if (!target) throw introuvable();
      if (target.role === Role.ADMIN && target.isActive) await this.assertNotLastAdmin(tx);

      const updated = await tx.user.update({
        where: { id: target.id },
        data: { passwordHash, passwordUpdatedAt: this.clock.now() },
      });
      await this.sessions.revokeAllForUser(tx, target.id, RevokeReason.REGENERATION_MOT_DE_PASSE);
      await this.audit.record(tx, {
        actor: actorOf(actor),
        action: AuditAction.REGENERATION_MOT_DE_PASSE,
        entityType: 'user',
        entityId: target.id,
        after: { role: target.role, passwordUpdatedAt: updated.passwordUpdatedAt.toISOString() },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
    });
    return { password };
  }

  /** Staff only. The last active admin cannot be deactivated (Q9). */
  async setStaffActive(
    actor: UserPrincipal,
    userId: string,
    isActive: boolean,
    meta: RequestMeta,
  ): Promise<AccountView> {
    const user = await this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findFirst({
        where: { id: userId, role: { in: [...STAFF_ROLES] } },
      });
      if (!target) throw introuvable();
      if (target.isActive === isActive) return target;
      if (!isActive && target.role === Role.ADMIN) await this.assertNotLastAdmin(tx);

      const updated = await tx.user.update({ where: { id: target.id }, data: { isActive } });
      if (!isActive) {
        await this.sessions.revokeAllForUser(tx, target.id, RevokeReason.DESACTIVATION);
      }
      await this.audit.record(tx, {
        actor: actorOf(actor),
        action: isActive ? AuditAction.REACTIVATION_COMPTE : AuditAction.DESACTIVATION_COMPTE,
        entityType: 'user',
        entityId: target.id,
        before: { isActive: target.isActive },
        after: { isActive },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return updated;
    });
    return view(user);
  }

  /**
   * Locks the active admin rows, so two admins deactivating each other at the
   * same moment cannot both succeed and leave nobody.
   */
  private async assertNotLastAdmin(tx: Tx): Promise<void> {
    const admins = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM users WHERE role = 'ADMIN' AND "isActive" = true FOR UPDATE`;
    if (admins.length <= 1) {
      throw apiError(409, AuthErrorCode.DERNIER_ADMIN, AUTH_MESSAGES.dernierAdmin);
    }
  }

  /** The password and its hash are never part of the entry. */
  private auditCreation(
    tx: Tx,
    actor: UserPrincipal,
    user: User,
    meta: RequestMeta,
    extra: Record<string, string | null> = {},
  ): Promise<void> {
    return this.audit.record(tx, {
      actor: actorOf(actor),
      action: AuditAction.CREATION_COMPTE,
      entityType: 'user',
      entityId: user.id,
      after: {
        role: user.role,
        username: user.username,
        phone: user.phone,
        firstName: user.firstName,
        lastName: user.lastName,
        ...extra,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  /** A concurrent creation that slipped past the checks still gets a clear answer. */
  private async withUniqueErrors<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = JSON.stringify(error.meta ?? {});
        throw target.includes('phone') ? telephoneDejaUtilise() : identifiantDejaUtilise();
      }
      throw error;
    }
  }
}
