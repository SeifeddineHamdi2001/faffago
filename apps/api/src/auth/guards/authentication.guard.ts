import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_MESSAGES, AuthErrorCode } from '@faffago/shared';
import type { Request } from 'express';
import { apiError } from '../../common/errors';
import { isPublicRoute } from '../decorators';
import type { Principal } from '../principal';
import { SessionsService } from '../sessions.service';
import { TokensService } from '../tokens.service';

export type AuthenticatedRequest = Request & { principal?: Principal };

/**
 * First global guard. Every route but the @Public ones needs a valid token
 * whose session, account and role are re-read from the database.
 */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublicRoute(this.reflector, context.getHandler(), context.getClass())) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
    const claims = token ? this.tokens.verify(token) : null;
    if (!claims) {
      throw apiError(401, AuthErrorCode.SESSION_EXPIREE, AUTH_MESSAGES.sessionExpiree);
    }

    request.principal = await this.sessions.authenticate(claims);
    return true;
  }
}
