import { Inject, Injectable } from '@nestjs/common';
import type { Courier, User } from '@prisma/client';
import {
  AUTH_MESSAGES,
  AuthClient,
  AuthErrorCode,
  CourierAccountState,
  PERMISSIONS_BY_ROLE,
  Permission,
  Role,
  STAFF_ROLES,
  impersonationBannerText,
  isAppVersionAllowed,
} from '@faffago/shared';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { LoginThrottleService, type ThrottleKeys } from './login-throttle.service';
import { PasswordsService } from './passwords.service';
import type { Principal } from './principal';
import {
  RevokeReason,
  SessionsService,
  type RequestMeta,
  type SessionTokens,
} from './sessions.service';

/** Thrown before any password check; the controller adds Retry-After. */
export class TooManyAttemptsError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('TROP_DE_TENTATIVES');
  }
}

export interface LoginResult extends SessionTokens {
  user: { id: string; role: Role; firstName: string; lastName: string; langue: string };
}

type Candidate = (User & { courier: Courier | null }) | null;

function identifiantsIncorrects(): Error {
  return apiError(401, AuthErrorCode.IDENTIFIANTS_INCORRECTS, AUTH_MESSAGES.identifiantsIncorrects);
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordsService,
    private readonly sessions: SessionsService,
    private readonly throttle: LoginThrottleService,
    private readonly settings: SettingsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Vendeur: email + password (A-20). */
  loginVendeur(email: string, password: string, meta: RequestMeta): Promise<LoginResult> {
    return this.login({
      keys: { identifier: `email:${email}`, ip: meta.ip ?? 'inconnue' },
      find: () =>
        this.prisma.user.findFirst({
          where: { email, role: Role.VENDEUR },
          include: { courier: true },
        }),
      password,
      meta,
      unknownAccount: identifiantsIncorrects,
    });
  }

  /** Admin, Dépôt, Service client: username + password (A-20). */
  loginStaff(username: string, password: string, meta: RequestMeta): Promise<LoginResult> {
    return this.login({
      keys: { identifier: `username:${username}`, ip: meta.ip ?? 'inconnue' },
      find: () =>
        this.prisma.user.findFirst({
          where: { username, role: { in: [...STAFF_ROLES] } },
          include: { courier: true },
        }),
      password,
      meta,
      unknownAccount: identifiantsIncorrects,
    });
  }

  /** Livreur, Ramasseur: role chosen first, then phone + password (Coursier 2). */
  loginCourier(
    input: {
      role: typeof Role.LIVREUR | typeof Role.RAMASSEUR;
      phone: string;
      password: string;
      deviceId?: string;
    },
    meta: RequestMeta,
  ): Promise<LoginResult> {
    const { role, phone } = input;
    return this.login({
      keys: { identifier: `phone:${role}:${phone}`, ip: meta.ip ?? 'inconnue' },
      find: () =>
        this.prisma.user.findUnique({
          where: { phone_role: { phone, role } },
          include: { courier: true },
        }),
      password: input.password,
      meta: { ...meta, deviceId: input.deviceId ?? null },
      // Worded by Coursier 2: it tells the person which button to press.
      unknownAccount: () =>
        apiError(401, AuthErrorCode.AUCUN_COMPTE_COURSIER, AUTH_MESSAGES.aucunCompteCoursier(role)),
    });
  }

  async refresh(
    refreshToken: string,
    appVersion: string | undefined,
    meta: RequestMeta,
  ): Promise<SessionTokens> {
    return this.sessions.refresh(refreshToken, meta, async (client) => {
      if (client === AuthClient.COURIER_APP) await this.assertCourierAppVersion(appVersion);
    });
  }

  async logout(principal: Principal): Promise<void> {
    await this.prisma.$transaction((tx) =>
      this.sessions.revoke(tx, principal.sessionId, RevokeReason.DECONNEXION),
    );
  }

  /** What the apps build their menus and the impersonation banner from. */
  async me(principal: Principal): Promise<Record<string, unknown>> {
    if (principal.kind === 'impersonation') {
      const [seller, view] = await Promise.all([
        this.prisma.seller.findUniqueOrThrow({
          where: { id: principal.sellerId },
          include: { user: true },
        }),
        this.prisma.impersonationSession.findUniqueOrThrow({
          where: { id: principal.impersonationId },
        }),
      ]);
      return {
        id: seller.user.id,
        role: Role.VENDEUR,
        firstName: seller.user.firstName,
        lastName: seller.user.lastName,
        langue: seller.user.langue,
        permissions: [Permission.ESPACE_VENDEUR],
        readOnly: true,
        seller: { id: seller.id, shopName: seller.shopName, accountState: seller.accountState },
        impersonation: {
          id: view.id,
          shopName: seller.shopName,
          banner: impersonationBannerText(seller.shopName),
          expiresAt: view.expiresAt,
        },
      };
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: principal.userId },
      include: { seller: true },
    });
    return {
      id: user.id,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      langue: user.langue,
      permissions: PERMISSIONS_BY_ROLE[user.role],
      readOnly: false,
      seller: user.seller
        ? {
            id: user.seller.id,
            shopName: user.seller.shopName,
            accountState: user.seller.accountState,
          }
        : null,
      impersonation: null,
    };
  }

  /** Tech-stack 2 and 5: the API refuses app versions below the minimum. */
  async assertCourierAppVersion(version: string | undefined): Promise<void> {
    const minimum = await this.settings.courierMinAppVersion();
    if (!isAppVersionAllowed(version, minimum)) {
      throw apiError(426, AuthErrorCode.VERSION_APP_OBSOLETE, AUTH_MESSAGES.versionAppObsolete, {
        minimumVersion: minimum,
      });
    }
  }

  private async login(attempt: {
    keys: ThrottleKeys;
    find: () => Promise<Candidate>;
    password: string;
    meta: RequestMeta;
    unknownAccount: () => Error;
  }): Promise<LoginResult> {
    const { keys, password } = attempt;
    const wait = this.throttle.retryAfterSeconds(keys);
    if (wait > 0) throw new TooManyAttemptsError(wait);

    const user = await attempt.find();
    if (!user) {
      await this.passwords.verifyNothing(password);
      this.throttle.recordFailure(keys);
      throw attempt.unknownAccount();
    }
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      this.throttle.recordFailure(keys);
      throw identifiantsIncorrects();
    }
    this.throttle.recordSuccess(keys);

    // Checked only once the password is right, so it reveals nothing to a
    // guess. A Suspendu seller still logs in (Vendeur 2.5): that is not isActive.
    if (!user.isActive || user.courier?.accountState === CourierAccountState.INACTIF) {
      throw apiError(403, AuthErrorCode.COMPTE_DESACTIVE, AUTH_MESSAGES.compteDesactive);
    }

    const tokens = await this.sessions.open(user, attempt.meta);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: this.clock.now() },
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        langue: user.langue,
      },
    };
  }
}
