import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Permission } from '@faffago/shared';
import type { Principal } from './principal';
import type { RequestMeta } from './sessions.service';

/**
 * Every route must say who may call it, with exactly one of @Public,
 * @Authenticated or @RequirePermission. A route with none is refused to
 * everyone (PermissionsGuard), and a test walks every route to catch one
 * before it ships.
 */

export const IS_PUBLIC = 'faffago:public';
export const IS_AUTHENTICATED = 'faffago:authenticated';
export const REQUIRED_PERMISSION = 'faffago:permission';
export const ALLOW_IMPERSONATION = 'faffago:allow-impersonation';
export const IMPERSONATION_EXIT = 'faffago:impersonation-exit';
export const COURIER_APP_ROUTE = 'faffago:courier-app-route';
export const ALLOW_OUTDATED_COURIER_APP = 'faffago:allow-outdated-courier-app';

/** No login needed: the login forms, refresh, and later public tracking. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

/** Any logged-in role: /auth/me, logout. Declared, never implied. */
export const Authenticated = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_AUTHENTICATED, true);

export const RequirePermission = (permission: Permission): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSION, permission);

/**
 * A seller-space route an admin may see in "Voir comme le vendeur" (D-5).
 * Only GET is ever let through: a write is refused whatever this says.
 */
export const AllowImpersonation = (): MethodDecorator => SetMetadata(ALLOW_IMPERSONATION, true);

/** The exit button: the one call an impersonation token may make that is not a read. */
export const ImpersonationExit = (): MethodDecorator => SetMetadata(IMPERSONATION_EXIT, true);

/** Called by the courier app before any session exists: checks the app version. */
export const CourierAppRoute = (): MethodDecorator => SetMetadata(COURIER_APP_ROUTE, true);

/**
 * The scan sync (phase 6): an outdated app must still be able to empty its
 * queue before it blocks for the update (tech-stack 5, Q12).
 */
export const AllowOutdatedCourierApp = (): MethodDecorator =>
  SetMetadata(ALLOW_OUTDATED_COURIER_APP, true);

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const request = context.switchToHttp().getRequest<{ principal?: Principal }>();
    if (!request.principal) throw new Error('CurrentPrincipal on a route without authentication');
    return request.principal;
  },
);

/** The caller's IP and user agent, kept on the session and in the audit. */
export const Meta = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestMeta => {
    const request = context.switchToHttp().getRequest<Request>();
    return { ip: request.ip ?? null, userAgent: request.headers['user-agent'] ?? null };
  },
);

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type Target = Function;

export function isPublicRoute(reflector: Reflector, handler: Target, controller: Target): boolean {
  return reflector.getAllAndOverride<boolean>(IS_PUBLIC, [handler, controller]) === true;
}

export function isRouteDeclared(
  reflector: Reflector,
  handler: Target,
  controller: Target,
): boolean {
  const targets = [handler, controller];
  return (
    reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets) === true ||
    reflector.getAllAndOverride<boolean>(IS_AUTHENTICATED, targets) === true ||
    reflector.getAllAndOverride<Permission>(REQUIRED_PERMISSION, targets) !== undefined
  );
}
