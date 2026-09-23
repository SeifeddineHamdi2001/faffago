import { createHmac, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { SESSION_POLICY, type Role } from '@faffago/shared';
import { CLOCK, type Clock } from '../common/clock';

export interface AccessClaims {
  typ: 'access';
  sub: string;
  sid: string;
  /** Carried as tech-stack 2 asks, and checked against the database each time. */
  role: Role;
}

export interface ImpersonationClaims {
  typ: 'impersonation';
  /** The admin. */
  sub: string;
  /** The admin's own session. */
  sid: string;
  iid: string;
  sellerId: string;
}

export type TokenClaims = AccessClaims | ImpersonationClaims;

export interface SignedToken {
  token: string;
  expiresAt: Date;
}

/**
 * Access and impersonation tokens are short HS256 JWTs. Refresh tokens are
 * opaque random strings stored only as an HMAC, so a database leak does not
 * hand out live sessions.
 */
@Injectable()
export class TokensService {
  private readonly refreshSecret: string;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.refreshSecret = requireSecret(config, 'JWT_REFRESH_SECRET');
  }

  signAccess(claims: Omit<AccessClaims, 'typ'>): SignedToken {
    return this.sign({ typ: 'access', ...claims }, SESSION_POLICY.accessTokenTtlSeconds);
  }

  signImpersonation(claims: Omit<ImpersonationClaims, 'typ'>, expiresAt: Date): SignedToken {
    const seconds = Math.floor((expiresAt.getTime() - this.clock.now().getTime()) / 1000);
    return this.sign({ typ: 'impersonation', ...claims }, seconds);
  }

  /** Null for anything that is not a valid, unexpired token of ours. */
  verify(token: string): TokenClaims | null {
    try {
      const claims = this.jwt.verify<TokenClaims & { iat: number; exp: number }>(token, {
        algorithms: ['HS256'],
        clockTimestamp: Math.floor(this.clock.now().getTime() / 1000),
      });
      if (claims.typ !== 'access' && claims.typ !== 'impersonation') return null;
      return claims;
    } catch {
      return null;
    }
  }

  newRefreshToken(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHmac('sha256', this.refreshSecret).update(token).digest('hex');
  }

  private sign(claims: TokenClaims, ttlSeconds: number): SignedToken {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const token = this.jwt.sign({ ...claims, iat }, { expiresIn: ttlSeconds, algorithm: 'HS256' });
    return { token, expiresAt: new Date((iat + ttlSeconds) * 1000) };
  }
}

/** Refuses to start on a missing, placeholder or short secret. */
export function requireSecret(config: ConfigService, name: string): string {
  const value = config.get<string>(name);
  if (!value || value === 'CHANGE_ME' || value.length < 32) {
    throw new Error(
      `${name} doit être défini, et faire au moins 32 caractères (voir .env.example).`,
    );
  }
  return value;
}
