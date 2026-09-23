import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { APP_VERSION_HEADER, isCourierRole } from '@faffago/shared';
import { AuthService } from '../auth.service';
import { ALLOW_OUTDATED_COURIER_APP, COURIER_APP_ROUTE } from '../decorators';
import type { AuthenticatedRequest } from './authentication.guard';

/**
 * Second global guard: the API refuses courier app versions below the minimum
 * set in Paramètres (tech-stack 2 and 5), on the courier login and on every
 * request made with a courier session.
 */
@Injectable()
export class CourierAppVersionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(ALLOW_OUTDATED_COURIER_APP, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = request.principal;
    const isCourierCall =
      this.reflector.getAllAndOverride<boolean>(COURIER_APP_ROUTE, targets) === true ||
      (principal?.kind === 'user' && isCourierRole(principal.role));
    if (!isCourierCall) return true;

    const header = request.headers[APP_VERSION_HEADER];
    await this.auth.assertCourierAppVersion(Array.isArray(header) ? header[0] : header);
    return true;
  }
}
