import { Inject, Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { SESSION_POLICY, impersonationBannerText } from '@faffago/shared';
import { AuditAction, AuditService } from '../audit/audit.service';
import { CLOCK, type Clock } from '../common/clock';
import { apiError } from '../common/errors';
import { PrismaService } from '../common/prisma/prisma.service';
import type { ImpersonationPrincipal, UserPrincipal } from './principal';
import { ImpersonationEndReason, SessionsService, type RequestMeta } from './sessions.service';
import { TokensService } from './tokens.service';

export interface ImpersonationStarted {
  impersonationToken: string;
  impersonationId: string;
  expiresAt: Date;
  sellerId: string;
  shopName: string;
  banner: string;
}

/**
 * Voir comme le vendeur (D-5). The token opens the seller's view for 30
 * minutes with no refresh; the guards let it through GET routes of the seller
 * space only. Its start and its end are both audited, whether the admin exits,
 * the time runs out, or his own session is revoked.
 */
@Injectable()
export class ImpersonationService {
  private readonly logger = new Logger(ImpersonationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly tokens: TokensService,
    private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async start(
    admin: UserPrincipal,
    sellerId: string,
    meta: RequestMeta,
  ): Promise<ImpersonationStarted> {
    const seller = await this.prisma.seller.findUnique({ where: { id: sellerId } });
    if (!seller) throw apiError(404, 'INTROUVABLE', 'Vendeur introuvable');

    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + SESSION_POLICY.impersonationTtlSeconds * 1000);

    const view = await this.prisma.$transaction(async (tx) => {
      const created = await tx.impersonationSession.create({
        data: {
          adminUserId: admin.userId,
          adminSessionId: admin.sessionId,
          sellerId: seller.id,
          startedAt: now,
          expiresAt,
        },
      });
      await this.audit.record(tx, {
        actor: { userId: admin.userId, role: admin.role },
        action: AuditAction.VOIR_COMME_VENDEUR_DEBUT,
        entityType: 'seller',
        entityId: seller.id,
        after: {
          impersonationId: created.id,
          shopName: seller.shopName,
          expiresAt: expiresAt.toISOString(),
        },
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      return created;
    });

    const token = this.tokens.signImpersonation(
      { sub: admin.userId, sid: admin.sessionId, iid: view.id, sellerId: seller.id },
      expiresAt,
    );
    return {
      impersonationToken: token.token,
      impersonationId: view.id,
      expiresAt,
      sellerId: seller.id,
      shopName: seller.shopName,
      banner: impersonationBannerText(seller.shopName),
    };
  }

  /** The exit button of the banner. */
  async exit(principal: ImpersonationPrincipal): Promise<void> {
    await this.prisma.$transaction((tx) =>
      this.sessions.endImpersonations(
        tx,
        { id: principal.impersonationId },
        ImpersonationEndReason.SORTIE,
      ),
    );
  }

  /**
   * Writes the end of every view whose 30 minutes ran out without an exit.
   * The token itself already stopped working at expiry; this is the record.
   */
  async endExpired(): Promise<number> {
    return this.prisma.$transaction((tx) =>
      this.sessions.endImpersonations(
        tx,
        { expiresAt: { lte: this.clock.now() } },
        ImpersonationEndReason.EXPIRATION,
      ),
    );
  }

  @Interval(60_000)
  async endExpiredJob(): Promise<void> {
    try {
      await this.endExpired();
    } catch (error) {
      this.logger.error('Clôture des consultations expirées impossible', error as Error);
    }
  }
}
