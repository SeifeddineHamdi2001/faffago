import { Body, Controller, HttpCode, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Permission, depotScanSchema, type DepotScanValues } from '@faffago/shared';
import { CurrentPrincipal, RequirePermission } from '../auth/decorators';
import type { Principal, UserPrincipal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DepotScansService } from './depot-scans.service';

/**
 * Scans. The depot's station in phase 5 (Admin 4.2, D-50); the courier app's
 * upload comes with phase 6 (D-14).
 */
@Controller('scans')
export class ScansController {
  constructor(private readonly depotScans: DepotScansService) {}

  /**
   * One scan of the station. 201 when recorded, accepted or refused; 200 for
   * the same scan sent again (its first result) or an identifier reused.
   */
  @Post('depot')
  @RequirePermission(Permission.SCAN_DEPOT)
  async depot(
    @Body(new ZodValidationPipe(depotScanSchema)) body: DepotScanValues,
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { created, result } = await this.depotScans.scan(principal as UserPrincipal, body);
    response.status(created ? 201 : 200);
    return result;
  }

  /**
   * Annuler le dernier scan (A-11, D-54): only the person who scanned, within
   * the window. After it, only the admin corrects (D-56).
   */
  @Post('depot/:scanId/cancel')
  @RequirePermission(Permission.SCAN_DEPOT)
  @HttpCode(200)
  cancel(@Param('scanId', ParseUUIDPipe) scanId: string, @CurrentPrincipal() principal: Principal) {
    return this.depotScans.cancel(principal as UserPrincipal, scanId);
  }
}
