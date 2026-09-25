import { Body, Controller, Get, HttpCode, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import {
  APP_VERSION_HEADER,
  Permission,
  courierSyncSchema,
  type CourierSyncValues,
} from '@faffago/shared';
import {
  AllowOutdatedCourierApp,
  CurrentPrincipal,
  RequirePermission,
} from '../auth/decorators';
import type { Principal, UserPrincipal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CourierDayService } from './courier-day.service';
import { CourierPickupsService } from './courier-pickups.service';
import { CourierSyncService } from './courier-sync.service';

const languageSchema = z.object({ langue: z.enum(['FR', 'AR']) }).strict();

/**
 * The courier app's queue upload (Coursier 4.9). The one route an outdated
 * app still reaches, so the phone empties its queue before it blocks for the
 * update (D-14, tech-stack 5).
 */
@Controller('scans')
export class CourierSyncController {
  constructor(private readonly sync: CourierSyncService) {}

  @Post('courier')
  @RequirePermission(Permission.APP_COURSIER)
  @AllowOutdatedCourierApp()
  @HttpCode(200)
  upload(
    @Body(new ZodValidationPipe(courierSyncSchema)) body: CourierSyncValues,
    @CurrentPrincipal() principal: Principal,
    @Req() request: Request,
  ) {
    const header = request.headers[APP_VERSION_HEADER];
    const appVersion = (Array.isArray(header) ? header[0] : header)?.slice(0, 32) ?? null;
    return this.sync
      .sync(principal as UserPrincipal, body.operations, { appVersion })
      .then((results) => ({ results }));
  }
}

/** The courier's own day: always his own work (Coursier 1). */
@Controller('coursier')
export class CourierController {
  constructor(
    private readonly day: CourierDayService,
    private readonly pickups: CourierPickupsService,
  ) {}

  /** Ma tournée and Retour au dépôt (Coursier 4.2, 4.5). */
  @Get('tournee')
  @RequirePermission(Permission.APP_LIVREUR)
  tour(@CurrentPrincipal() principal: Principal) {
    return this.day.tour(principal as UserPrincipal);
  }

  /** The ramasseur's pickups (Coursier 4.6). */
  @Get('ramassages')
  @RequirePermission(Permission.APP_RAMASSEUR)
  pickupDay(@CurrentPrincipal() principal: Principal) {
    return this.pickups.day(principal as UserPrincipal);
  }

  /** Ma caisse (Coursier 4.7). */
  @Get('caisse')
  @RequirePermission(Permission.APP_COURSIER)
  cash(@CurrentPrincipal() principal: Principal) {
    return this.day.cash(principal as UserPrincipal);
  }

  /** Profil (Coursier 4.12). */
  @Get('moi')
  @RequirePermission(Permission.APP_COURSIER)
  profile(@CurrentPrincipal() principal: Principal) {
    return this.day.profile(principal as UserPrincipal);
  }

  /** The language, chosen by the courier on his phone (Coursier 2, Q4). */
  @Patch('moi/langue')
  @RequirePermission(Permission.APP_COURSIER)
  setLanguage(
    @Body(new ZodValidationPipe(languageSchema)) body: z.output<typeof languageSchema>,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.day.setLanguage(principal as UserPrincipal, body.langue);
  }
}
