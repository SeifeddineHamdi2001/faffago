import { Body, Controller, Delete, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import {
  APP_VERSION_HEADER,
  AUTH_MESSAGES,
  AuthErrorCode,
  Permission,
  courierLoginSchema,
  refreshSchema,
  staffLoginSchema,
  startImpersonationSchema,
  vendeurLoginSchema,
} from '@faffago/shared';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { apiError } from '../common/errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AuthService, TooManyAttemptsError } from './auth.service';
import {
  AllowImpersonation,
  Authenticated,
  CourierAppRoute,
  CurrentPrincipal,
  ImpersonationExit,
  Meta,
  Public,
  RequirePermission,
} from './decorators';
import { ImpersonationService } from './impersonation.service';
import type { ImpersonationPrincipal, Principal, UserPrincipal } from './principal';
import type { RequestMeta } from './sessions.service';

/** Turns a throttled attempt into a 429 with Retry-After (D-6). */
async function throttled<T>(response: Response, attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt();
  } catch (error) {
    if (!(error instanceof TooManyAttemptsError)) throw error;
    response.setHeader('Retry-After', String(error.retryAfterSeconds));
    throw apiError(
      429,
      AuthErrorCode.TROP_DE_TENTATIVES,
      AUTH_MESSAGES.tropDeTentatives(error.retryAfterSeconds),
      { retryAfterSeconds: error.retryAfterSeconds },
    );
  }
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly impersonation: ImpersonationService,
  ) {}

  @Post('login/vendeur')
  @Public()
  @HttpCode(200)
  loginVendeur(
    @Body(new ZodValidationPipe(vendeurLoginSchema)) body: z.output<typeof vendeurLoginSchema>,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ) {
    return throttled(response, () => this.auth.loginVendeur(body.email, body.password, meta));
  }

  @Post('login/staff')
  @Public()
  @HttpCode(200)
  loginStaff(
    @Body(new ZodValidationPipe(staffLoginSchema)) body: z.output<typeof staffLoginSchema>,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ) {
    return throttled(response, () => this.auth.loginStaff(body.username, body.password, meta));
  }

  @Post('login/coursier')
  @Public()
  @CourierAppRoute()
  @HttpCode(200)
  loginCoursier(
    @Body(new ZodValidationPipe(courierLoginSchema)) body: z.output<typeof courierLoginSchema>,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ) {
    return throttled(response, () => this.auth.loginCourier(body, meta));
  }

  /** Public: the access token may have expired, the refresh token is the proof. */
  @Post('refresh')
  @Public()
  @HttpCode(200)
  refresh(
    @Body(new ZodValidationPipe(refreshSchema)) body: z.output<typeof refreshSchema>,
    @Req() request: Request,
    @Meta() meta: RequestMeta,
  ) {
    const version = request.headers[APP_VERSION_HEADER];
    return this.auth.refresh(
      body.refreshToken,
      Array.isArray(version) ? version[0] : version,
      meta,
    );
  }

  @Post('logout')
  @Authenticated()
  @HttpCode(204)
  async logout(@CurrentPrincipal() principal: Principal): Promise<void> {
    await this.auth.logout(principal);
  }

  @Get('me')
  @Authenticated()
  @AllowImpersonation()
  me(@CurrentPrincipal() principal: Principal) {
    return this.auth.me(principal);
  }

  /** Voir comme le vendeur (D-5, Admin 4.14). */
  @Post('impersonation')
  @RequirePermission(Permission.VOIR_COMME_VENDEUR)
  startImpersonation(
    @Body(new ZodValidationPipe(startImpersonationSchema))
    body: z.output<typeof startImpersonationSchema>,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.impersonation.start(principal as UserPrincipal, body.sellerId, meta);
  }

  /** The exit button of the banner. Called with the impersonation token. */
  @Delete('impersonation')
  @Authenticated()
  @ImpersonationExit()
  @HttpCode(204)
  async exitImpersonation(@CurrentPrincipal() principal: Principal): Promise<void> {
    if (principal.kind !== 'impersonation') return;
    await this.impersonation.exit(principal as ImpersonationPrincipal);
  }
}
