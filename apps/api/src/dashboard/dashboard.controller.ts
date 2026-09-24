import { Controller, Get, Query } from '@nestjs/common';
import { Permission, dashboardQuerySchema, type DashboardQuery } from '@faffago/shared';
import { AllowImpersonation, CurrentPrincipal, RequirePermission } from '../auth/decorators';
import type { Principal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DashboardService } from './dashboard.service';

/** Tableau de bord (Vendeur 4.1). Seller space only; "Voir comme le vendeur" reads. */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** The counts of a period: `from` and `to` (Tunis days), or today without them. */
  @Get()
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @AllowImpersonation()
  forSeller(
    @Query(new ZodValidationPipe(dashboardQuerySchema)) query: DashboardQuery,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.dashboard.forSeller(principal, query);
  }
}
