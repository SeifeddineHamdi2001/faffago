import { Injectable, Logger, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTH_MESSAGES, AuthErrorCode, can, type Permission } from '@faffago/shared';
import { apiError } from '../../common/errors';
import {
  ALLOW_IMPERSONATION,
  IMPERSONATION_EXIT,
  IS_AUTHENTICATED,
  REQUIRED_PERMISSION,
  isPublicRoute,
} from '../decorators';
import type { AuthenticatedRequest } from './authentication.guard';

const READ_METHODS = new Set(['GET', 'HEAD']);

function refused(): Error {
  return apiError(403, AuthErrorCode.NON_AUTORISE, AUTH_MESSAGES.nonAutorise);
}

/**
 * Last global guard: deny by default. A route answers only if it declares
 * @Authenticated or a @RequirePermission the caller's role holds in the
 * shared matrix. An impersonation token is the seller's view, read-only.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const handler = context.getHandler();
    const controller = context.getClass();
    if (isPublicRoute(this.reflector, handler, controller)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.principal;
    if (!principal) throw refused();

    const targets = [handler, controller];
    const permission = this.reflector.getAllAndOverride<Permission>(REQUIRED_PERMISSION, targets);
    const anyRole = this.reflector.getAllAndOverride<boolean>(IS_AUTHENTICATED, targets) === true;

    if (principal.kind === 'impersonation') {
      if (this.reflector.get<boolean>(IMPERSONATION_EXIT, handler)) return true;
      if (!READ_METHODS.has(request.method)) {
        throw apiError(403, AuthErrorCode.LECTURE_SEULE, AUTH_MESSAGES.lectureSeule);
      }
      if (!this.reflector.get<boolean>(ALLOW_IMPERSONATION, handler)) throw refused();
    }

    if (!permission && !anyRole) {
      this.logger.error(
        `Route sans permission déclarée, refusée : ${controller.name}.${handler.name}`,
      );
      throw refused();
    }
    if (permission && !can(principal.role, permission)) throw refused();
    return true;
  }
}
