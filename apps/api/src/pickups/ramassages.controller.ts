import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  PickupStatus,
  isTunisDayKey,
  planPickupSchema,
  type PlanPickupValues,
} from '@faffago/shared';
import { CurrentPrincipal, RequirePermission } from '../auth/decorators';
import type { Principal, UserPrincipal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RamassagesService } from './ramassages.service';

const statusQuery = z.nativeEnum(PickupStatus).optional();
const dayQuery = z.string().refine(isTunisDayKey, 'Date invalide');

/**
 * Ramassages, the team's side (Admin 4.4, D-58): Admin and Dépôt plan the
 * pickups. There is deliberately no cancel route: the seller cancels (D-35).
 * The seller's own routes are under /pickups.
 */
@Controller('ramassages')
export class RamassagesController {
  constructor(private readonly ramassages: RamassagesService) {}

  @Get()
  @RequirePermission(Permission.PLANIFIER_RAMASSAGES_TOURNEES)
  list(@Query('status', new ZodValidationPipe(statusQuery)) status?: PickupStatus) {
    return this.ramassages.list(status);
  }

  @Get(':id')
  @RequirePermission(Permission.PLANIFIER_RAMASSAGES_TOURNEES)
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.ramassages.detail(id);
  }

  /** The ramasseur to pre-fill for that day (A-14, D-52). */
  @Get(':id/suggestion')
  @RequirePermission(Permission.PLANIFIER_RAMASSAGES_TOURNEES)
  suggestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('date', new ZodValidationPipe(dayQuery)) date: string,
  ) {
    return this.ramassages.suggestion(id, date);
  }

  @Post(':id/plan')
  @RequirePermission(Permission.PLANIFIER_RAMASSAGES_TOURNEES)
  @HttpCode(200)
  plan(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(planPickupSchema)) body: PlanPickupValues,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.ramassages.plan(principal as UserPrincipal, id, body);
  }
}
