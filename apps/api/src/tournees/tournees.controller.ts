import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Permission, moveToCourierSchema, type MoveToCourierValues } from '@faffago/shared';
import { CurrentPrincipal, RequirePermission } from '../auth/decorators';
import type { Principal, UserPrincipal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TourneesService } from './tournees.service';

/** Tournées (Admin 4.5, D-55): Admin and Dépôt, who plan the tours. */
@Controller('tournees')
export class TourneesController {
  constructor(private readonly tournees: TourneesService) {}

  @Get()
  @RequirePermission(Permission.PLANIFIER_RAMASSAGES_TOURNEES)
  plan() {
    return this.tournees.plan();
  }

  /** Move parcels to another courier; `courierId: null` puts them back under the zone. */
  @Post('moves')
  @RequirePermission(Permission.PLANIFIER_RAMASSAGES_TOURNEES)
  @HttpCode(200)
  move(
    @Body(new ZodValidationPipe(moveToCourierSchema)) body: MoveToCourierValues,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.tournees.move(principal as UserPrincipal, body);
  }
}
