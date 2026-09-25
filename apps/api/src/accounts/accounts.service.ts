import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import {
  businessDateOf,
  AUTH_MESSAGES,
  AuthErrorCode,
  COURIER_DEACTIVATION_REFUSED,
  COURIER_ROLES,
  Permission,
  Role,
  STAFF_ROLES,
  can,
  tunisDayKey,
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
import {
  identifiantDejaUtilise,
  telephoneDejaUtilise,
  withUniqueAccountErrors,
} from './account-errors';
import { TourneesService } from '../tournees/tournees.service';
import { courierOpenWork } from './courier-open-work';

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

const introuvable = () => apiError(404, 'INTROUVABLE', 'Compte introuvable');

/**
 * Identifiants et mots de passe (Admin v1.10, A-20). Every account is created
 * by the admin with a generated password shown once; only the admin can
 * regenerate it. Each change and its audit entry commit together.
 *
 * Seller accounts arrive with the seller module (phase 4), because creating
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
    private readonly tournees: TourneesService,
  ) {}

  /** Paramètres › Utilisateurs. Admin only, by the route's permission. */
  async listStaff(): Promise<(AccountView & { lastLoginAt: Date | null })[]> {
    const users = await this.prisma.user.findMany({
      where: { role: { in: [...STAFF_ROLES] } },
      orderBy: [{ role: 'asc' }, { username: 'asc' }],
    });
    return users.map((user) => ({ ...view(user), lastLoginAt: user.lastLoginAt }));
  }

  /**
   * Coursiers (D-11). Dépôt and Service client read name, phone, role and
   * zones of the active couriers, and whether they are absent today (D-52);
   * the admin also reads the account (state, CIN, vehicle) and, with
   * PAIE_COURSIERS, the pay plan. A livreur's parcels today: those he
   * carries and those Tournées plans for him (D-11, D-55).
   */
  async listCouriers(role: Role): Promise<Record<string, unknown>[]> {
    const withAccount = can(role, Permission.GERER_VENDEURS_COURSIERS);
    const withPay = can(role, Permission.PAIE_COURSIERS);
    const today = new Date(`${tunisDayKey(this.clock.now())}T00:00:00.000Z`);
    const todayByCourier = await this.tournees.parcelsToday();
    const users = await this.prisma.user.findMany({
      where: { role: { in: [...COURIER_ROLES] }, ...(withAccount ? {} : { isActive: true }) },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      include: {
        courier: {
          include: {
            zoneAssignments: { include: { zone: true } },
            absences: { where: { date: today }, select: { id: true } },
          },
        },
      },
    });
    return users.map((user) => {
      const courier = user.courier!;
      const row: Record<string, unknown> = {
        id: user.id,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        zones: courier.zoneAssignments.map((a) => ({
          name: a.zone.name,
          role: a.role,
          kind: a.kind,
        })),
        absentToday: courier.absences.length > 0,
        parcelsToday: user.role === 'LIVREUR' ? (todayByCourier.get(courier.id) ?? null) : null,
      };
      if (withAccount) {
        Object.assign(row, {
          isActive: user.isActive,
          acceptsWork: user.acceptsWork,
          accountState: courier.accountState,
          cin: courier.cin,
          vehicle: courier.vehicle,
        });
      }
      if (withPay) row.payPlan = courier.payPlan;
      return row;
    });
  }

  async createStaff(
    actor: UserPrincipal,
    input: CreateStaffAccountValues,
    meta: RequestMeta,
  ): Promise<CreatedAccount> {
    const password = this.passwords.generate();
    const passwordHash = await this.passwords.hash(password);

    const user = await withUniqueAccountErrors(() =>
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

  /** Admin 4.15. Zones are assigned in Paramètres › Zones (D-51). */
  async createCourier(
    actor: UserPrincipal,
    input: CreateCourierAccountValues,
    meta: RequestMeta,
  ): Promise<CreatedAccount> {
    const password = this.passwords.generate();
    const passwordHash = await this.passwords.hash(password);

    const user = await withUniqueAccountErrors(() =>
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
                // His plan runs from his first day (A-16, D-82).
                payPlanSince: businessDateOf(this.clock.now()),
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
   * Désactiver un coursier (Admin 4.15, D-12), in two steps.
   *
   * 1. At once, in its own transaction so it holds even if step 2 refuses:
   *    acceptsWork = false, so no new parcel, pickup or bon reaches him.
   * 2. The deactivation, refused with the full list of what is still open.
   *    Step 1 is what makes that check stable: nothing new can be assigned
   *    between the check and the deactivation.
   */
  async deactivateCourier(
    actor: UserPrincipal,
    userId: string,
    meta: RequestMeta,
  ): Promise<AccountView> {
    const target = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: userId, role: { in: [...COURIER_ROLES] } },
        include: { courier: true },
      });
      if (!user?.courier) throw introuvable();
      if (user.acceptsWork) {
        await tx.user.update({ where: { id: user.id }, data: { acceptsWork: false } });
        await this.audit.record(tx, {
          actor: actorOf(actor),
          action: AuditAction.ARRET_NOUVEAU_TRAVAIL,
          entityType: 'user',
          entityId: user.id,
          before: { acceptsWork: true },
          after: { acceptsWork: false },
          ip: meta.ip,
          userAgent: meta.userAgent,
        });
      }
      return user;
    });
    const courierId = target.courier!.id;

    const user = await this.prisma.$transaction(async (tx) => {
      const current = await tx.user.findUniqueOrThrow({ where: { id: target.id } });
      if (!current.isActive) return current;

      const blockers = await courierOpenWork(tx, courierId);
      if (blockers.length > 0) {
        throw apiError(
          409,
          AuthErrorCode.COURSIER_ENGAGEMENTS_OUVERTS,
          COURIER_DEACTIVATION_REFUSED,
          {
            blockers,
          },
        );
      }

      const updated = await tx.user.update({
        where: { id: target.id },
        data: { isActive: false, courier: { update: { accountState: 'INACTIF' } } },
      });
      await this.sessions.revokeAllForUser(tx, target.id, RevokeReason.DESACTIVATION);
      await this.audit.record(tx, {
        actor: actorOf(actor),
        action: AuditAction.DESACTIVATION_COMPTE,
        entityType: 'user',
        entityId: target.id,
        before: { isActive: true, accountState: 'ACTIF' },
        after: { isActive: false, accountState: 'INACTIF' },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return updated;
    });
    return view(user);
  }

  /** Réactiver: the courier logs in and receives work again. */
  async activateCourier(
    actor: UserPrincipal,
    userId: string,
    meta: RequestMeta,
  ): Promise<AccountView> {
    const user = await this.prisma.$transaction(async (tx) => {
      const target = await tx.user.findFirst({
        where: { id: userId, role: { in: [...COURIER_ROLES] } },
        include: { courier: true },
      });
      if (!target?.courier) throw introuvable();
      const before = {
        isActive: target.isActive,
        acceptsWork: target.acceptsWork,
        accountState: target.courier.accountState,
      };
      const after = { isActive: true, acceptsWork: true, accountState: 'ACTIF' as const };
      if (
        before.isActive === after.isActive &&
        before.acceptsWork === after.acceptsWork &&
        before.accountState === after.accountState
      ) {
        return target;
      }
      const updated = await tx.user.update({
        where: { id: target.id },
        data: { isActive: true, acceptsWork: true, courier: { update: { accountState: 'ACTIF' } } },
      });
      await this.audit.record(tx, {
        actor: actorOf(actor),
        action: AuditAction.REACTIVATION_COMPTE,
        entityType: 'user',
        entityId: target.id,
        before,
        after,
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
}
