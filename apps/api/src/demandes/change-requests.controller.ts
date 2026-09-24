import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  Permission,
  refuseChangeRequestSchema,
  type RefuseChangeRequestValues,
} from '@faffago/shared';
import { CurrentPrincipal, RequirePermission } from '../auth/decorators';
import type { Principal, UserPrincipal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ChangeRequestsService } from './change-requests.service';

/**
 * Demandes de modification, the team's side (Admin 2, 4.7, D-57): Service
 * client and Admin apply or refuse. Every staff role reads a parcel's
 * requests on its Colis page. The seller's routes are under /parcels.
 */
@Controller('demandes-modification')
export class ChangeRequestsController {
  constructor(private readonly requests: ChangeRequestsService) {}

  @Get()
  @RequirePermission(Permission.DEMANDES_VENDEUR)
  waiting() {
    return this.requests.waiting();
  }

  @Post(':id/apply')
  @RequirePermission(Permission.DEMANDES_VENDEUR)
  @HttpCode(200)
  apply(@Param('id', ParseUUIDPipe) id: string, @CurrentPrincipal() principal: Principal) {
    return this.requests.apply(principal as UserPrincipal, id);
  }

  @Post(':id/refuse')
  @RequirePermission(Permission.DEMANDES_VENDEUR)
  @HttpCode(200)
  refuse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(refuseChangeRequestSchema)) body: RefuseChangeRequestValues,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.requests.refuse(principal as UserPrincipal, id, body);
  }
}
