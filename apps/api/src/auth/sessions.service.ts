import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, RefreshToken, User } from '@prisma/client';
import {
  AUTH_MESSAGES,
  AuthErrorCode,
  Permission,
  Role,
  SESSION_POLICY,
  can,
  sessionPolicyFor,
  type AuthClient,
} from '@faffago/shared';
import { AuditAction, AuditService } from '../audit/audit.service';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import type { Principal } from './principal';
import { TokensService, type TokenClaims } from './tokens.service';

/** Why a session ended, kept on the row. */
export const RevokeReason = {
  DECONNEXION: 'DECONNEXION',
  INACTIVITE: 'INACTIVITE',
  /** An already-rotated refresh token came back: it was copied. */
  REUTILISATION: 'REUTILISATION',
  REGENERATION_MOT_DE_PASSE: 'REGENERATION_MOT_DE_PASSE',
  DESACTIVATION: 'DESACTIVATION',
} as const;
export type RevokeReason = (typeof RevokeReason)[keyof typeof RevokeReason];

export const ImpersonationEndReason = {
  SORTIE: 'SORTIE',
  EXPIRATION: 'EXPIRATION',
  SESSION_REVOQUEE: 'SESSION_REVOQUEE',
} as const;
export type ImpersonationEndReason =
  (typeof ImpersonationEndReason)[keyof typeof ImpersonationEndReason];

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  deviceId?: string | null;
}

export interface SessionTokens {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

/** lastUsedAt is written at most once a minute per session, not on every request. */
const TOUCH_EVERY_MS = 60_000;

function sessionExpired(): Error {
  return apiError(401, AuthErrorCode.SESSION_EXPIREE, AUTH_MESSAGES.sessionExpiree);
}

type Tx = Prisma.TransactionClient;

interface RotationResult {
  tokens: SessionTokens;
  sessionId: string;
  client: AuthClient;
}

/** A refresh made with a given token, kept for the grace window (D-13). */
interface RecentRotation {
  result: Promise<RotationResult>;
  until: number;
}

/**
 * Sessions (Q11). One `refresh_tokens` row per logged-in device; its id is the
 * `sid` in every access token, and the guard reloads it on every request, so a
 * revocation — Régénérer le mot de passe, deactivation, logout — takes effect
 * at the device's very next call rather than when its access token expires.
 */
@Injectable()
export class SessionsService {
  /**
   * Keyed by the hash of the token that was rotated. In memory, like the login
   * throttle (D-6): one process, and losing it on a restart only means a tab
   * refreshing in that very second has to log in again.
   */
  private readonly recentRotations = new Map<string, RecentRotation>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async open(user: Pick<User, 'id' | 'role'>, meta: RequestMeta): Promise<SessionTokens> {
    const now = this.clock.now();
    const policy = sessionPolicyFor(user.role);
    const refresh = this.tokens.newRefreshToken();
    const session = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        client: policy.client,
        tokenHash: refresh.hash,
        deviceId: meta.deviceId ?? null,
        ip: meta.ip,
        userAgent: meta.userAgent,
        expiresAt: new Date(now.getTime() + policy.refreshTtlSeconds * 1000),
        lastUsedAt: now,
        createdAt: now,
      },
    });
    return this.tokensFor(user, session, refresh.token);
  }

  /** The session a refresh token belongs to, before anything else is checked. */
  private async findForRefresh(refreshToken: string): Promise<RefreshToken & { user: User }> {
    const hash = this.tokens.hashRefreshToken(refreshToken);
    const session = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
    });
    if (session) return session;

    const replayed = await this.prisma.refreshToken.findUnique({
      where: { previousTokenHash: hash },
    });
    if (replayed && !replayed.revokedAt) {
      await this.prisma.$transaction((tx) =>
        this.revoke(tx, replayed.id, RevokeReason.REUTILISATION),
      );
    }
    throw sessionExpired();
  }

  /**
   * Refresh with rotation and a 10-second grace window (D-13).
   *
   * The attempt is registered under the presented token before the first
   * await, so a second tab sending the same token — at the same instant or a
   * few seconds later — gets the same new token instead of looking like a
   * replay and revoking the session. After the window, a replay revokes.
   *
   * `check` runs before the rotation and again for every tab served from the
   * window: the courier app version (tech-stack 5).
   */
  async refresh(
    refreshToken: string,
    meta: RequestMeta,
    check: (client: AuthClient) => Promise<void>,
  ): Promise<SessionTokens> {
    const hash = this.tokens.hashRefreshToken(refreshToken);
    const now = this.clock.now().getTime();
    const recent = this.recentRotations.get(hash);

    if (recent && recent.until > now) {
      const done = await recent.result;
      await check(done.client);
      await this.assertStillOpen(done.sessionId);
      return done.tokens;
    }

    const result = (async (): Promise<RotationResult> => {
      const session = await this.findForRefresh(refreshToken);
      await check(session.client);
      const tokens = await this.rotate(session, hash, meta);
      return { tokens, sessionId: session.id, client: session.client };
    })();

    this.forgetExpiredRotations();
    this.recentRotations.set(hash, {
      result,
      until: now + SESSION_POLICY.refreshGraceSeconds * 1000,
    });
    // A failed attempt is not a rotation: the next one goes to the database.
    result.catch(() => this.recentRotations.delete(hash));

    return (await result).tokens;
  }

  /** Grace-window answers are served only while the session is still open. */
  private async assertStillOpen(sessionId: string): Promise<void> {
    const session = await this.prisma.refreshToken.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (!session) throw sessionExpired();
    await this.assertUsable(session, session.user);
  }

  /**
   * Swaps the token and slides the expiry. Conditional on the old hash, so two
   * rotations of one token can never both write.
   */
  private async rotate(
    session: RefreshToken & { user: User },
    oldHash: string,
    meta: RequestMeta,
  ): Promise<SessionTokens> {
    await this.assertUsable(session, session.user);

    const now = this.clock.now();
    const policy = sessionPolicyFor(session.user.role);
    const next = this.tokens.newRefreshToken();
    const expiresAt = new Date(now.getTime() + policy.refreshTtlSeconds * 1000);

    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: session.id, tokenHash: oldHash, revokedAt: null },
      data: {
        tokenHash: next.hash,
        previousTokenHash: oldHash,
        expiresAt,
        lastUsedAt: now,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });
    if (count !== 1) throw sessionExpired();

    return this.tokensFor(session.user, { ...session, expiresAt }, next.token);
  }

  private forgetExpiredRotations(): void {
    const now = this.clock.now().getTime();
    for (const [hash, entry] of this.recentRotations) {
      if (entry.until <= now) this.recentRotations.delete(hash);
    }
  }

  /** Turns verified token claims into a principal, from the database. */
  async authenticate(claims: TokenClaims): Promise<Principal> {
    const session = await this.prisma.refreshToken.findUnique({
      where: { id: claims.sid },
      include: {
        user: { include: { seller: { select: { id: true } }, courier: { select: { id: true } } } },
      },
    });
    if (!session || session.userId !== claims.sub) throw sessionExpired();
    await this.assertUsable(session, session.user);

    if (claims.typ === 'access') {
      // The role in the token must still be the role in the database.
      if (claims.role !== session.user.role) throw sessionExpired();
      await this.touch(session);
      return {
        kind: 'user',
        userId: session.user.id,
        role: session.user.role,
        sessionId: session.id,
        sellerId: session.user.seller?.id ?? null,
        courierId: session.user.courier?.id ?? null,
      };
    }

    // Voir comme le vendeur: the admin must still be an admin, and this view
    // must still be open (D-5).
    if (!can(session.user.role, Permission.VOIR_COMME_VENDEUR)) throw sessionExpired();
    const view = await this.prisma.impersonationSession.findUnique({ where: { id: claims.iid } });
    if (
      !view ||
      view.adminSessionId !== session.id ||
      view.sellerId !== claims.sellerId ||
      view.endedAt ||
      view.expiresAt <= this.clock.now()
    ) {
      throw sessionExpired();
    }
    await this.touch(session);
    return {
      kind: 'impersonation',
      role: Role.VENDEUR,
      adminUserId: session.user.id,
      sessionId: session.id,
      impersonationId: view.id,
      sellerId: view.sellerId,
    };
  }

  /** Ends one session, and any "Voir comme le vendeur" opened from it. */
  async revoke(tx: Tx, sessionId: string, reason: RevokeReason): Promise<void> {
    const now = this.clock.now();
    await tx.refreshToken.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: now, revokedReason: reason },
    });
    await this.endImpersonations(
      tx,
      { adminSessionId: sessionId },
      ImpersonationEndReason.SESSION_REVOQUEE,
    );
  }

  /** Every device of an account, at once. */
  async revokeAllForUser(tx: Tx, userId: string, reason: RevokeReason): Promise<void> {
    const sessions = await tx.refreshToken.findMany({
      where: { userId, revokedAt: null },
      select: { id: true },
    });
    for (const { id } of sessions) await this.revoke(tx, id, reason);
  }

  /**
   * Closes open impersonation views matching `where` and audits each end
   * exactly once: the update is conditional on the view still being open.
   */
  async endImpersonations(
    tx: Tx,
    where: Prisma.ImpersonationSessionWhereInput,
    reason: ImpersonationEndReason,
  ): Promise<number> {
    const open = await tx.impersonationSession.findMany({ where: { ...where, endedAt: null } });
    let ended = 0;
    for (const view of open) {
      // An expired view ended when its time ran out, not when the job noticed.
      const endedAt =
        reason === ImpersonationEndReason.EXPIRATION ? view.expiresAt : this.clock.now();
      const { count } = await tx.impersonationSession.updateMany({
        where: { id: view.id, endedAt: null },
        data: { endedAt, endReason: reason },
      });
      if (count !== 1) continue;
      ended += 1;
      await this.audit.record(tx, {
        actor: { userId: view.adminUserId, role: Role.ADMIN },
        action: AuditAction.VOIR_COMME_VENDEUR_FIN,
        entityType: 'seller',
        entityId: view.sellerId,
        reason,
        after: {
          impersonationId: view.id,
          startedAt: view.startedAt.toISOString(),
          endedAt: endedAt.toISOString(),
        },
      });
    }
    return ended;
  }

  private async assertUsable(session: RefreshToken, user: User): Promise<void> {
    const now = this.clock.now();
    if (session.revokedAt || session.expiresAt <= now || !user.isActive) throw sessionExpired();

    const { idleTimeoutSeconds } = sessionPolicyFor(user.role);
    if (
      idleTimeoutSeconds !== null &&
      now.getTime() - session.lastUsedAt.getTime() > idleTimeoutSeconds * 1000
    ) {
      await this.prisma.$transaction((tx) => this.revoke(tx, session.id, RevokeReason.INACTIVITE));
      throw sessionExpired();
    }
  }

  private async touch(session: RefreshToken): Promise<void> {
    const now = this.clock.now();
    if (now.getTime() - session.lastUsedAt.getTime() < TOUCH_EVERY_MS) return;
    await this.prisma.refreshToken.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { lastUsedAt: now },
    });
  }

  private tokensFor(
    user: Pick<User, 'id' | 'role'>,
    session: Pick<RefreshToken, 'id' | 'expiresAt'>,
    refreshToken: string,
  ): SessionTokens {
    const access = this.tokens.signAccess({ sub: user.id, sid: session.id, role: user.role });
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken,
      refreshTokenExpiresAt: session.expiresAt,
    };
  }
}
