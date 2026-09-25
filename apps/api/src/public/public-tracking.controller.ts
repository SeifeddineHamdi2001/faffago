import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Langue } from '@faffago/shared';
import type { Response } from 'express';
import { apiError } from '../common/errors';
import { Meta, Public } from '../auth/decorators';
import type { RequestMeta } from '../auth/sessions.service';
import { PublicTrackingService, TooManyTrackingAttemptsError } from './public-tracking.service';

/** Suivre mon colis (Landing 4): no login, by parcel code, rate-limited. */
@Controller('public/tracking')
export class PublicTrackingController {
  constructor(private readonly tracking: PublicTrackingService) {}

  @Get(':code')
  @Public()
  async track(
    @Param('code') code: string,
    @Query('langue') langue: string | undefined,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ) {
    try {
      return await this.tracking.track(
        code,
        meta.ip ?? 'inconnu',
        langue === Langue.AR ? Langue.AR : Langue.FR,
      );
    } catch (error) {
      if (!(error instanceof TooManyTrackingAttemptsError)) throw error;
      response.setHeader('Retry-After', String(error.retryAfterSeconds));
      throw apiError(
        429,
        'TROP_DE_TENTATIVES',
        `Trop de tentatives. Réessayez dans ${error.retryAfterSeconds} s.`,
        { retryAfterSeconds: error.retryAfterSeconds },
      );
    }
  }
}
