import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Permission } from '@faffago/shared';
import { CurrentPrincipal, RequirePermission } from '../auth/decorators';
import type { Principal, UserPrincipal } from '../auth/principal';
import { ExceptionsService } from './exceptions.service';

/** Exceptions (Admin 4.7, D-11, D-50): every staff role reads the queue. */
@Controller('exceptions')
export class ExceptionsController {
  constructor(private readonly exceptions: ExceptionsService) {}

  @Get()
  @RequirePermission(Permission.EXCEPTIONS_LECTURE)
  queue(@CurrentPrincipal() principal: Principal) {
    return this.exceptions.queue((principal as UserPrincipal).role);
  }

  /** Marquer comme traité (Admin, Dépôt, A-22): the entry leaves the queue. */
  @Post('manual-entries/:scanId/treat')
  @RequirePermission(Permission.SCAN_DEPOT)
  @HttpCode(200)
  treatManualEntry(
    @Param('scanId', ParseUUIDPipe) scanId: string,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.exceptions.treatManualEntry(principal as UserPrincipal, scanId);
  }
}
