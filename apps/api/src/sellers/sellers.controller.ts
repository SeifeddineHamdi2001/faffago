import { Controller, Get } from '@nestjs/common';
import { Permission } from '@faffago/shared';
import { CurrentPrincipal, RequirePermission } from '../auth/decorators';
import type { Principal } from '../auth/principal';
import { SellersService } from './sellers.service';

@Controller('sellers')
export class SellersController {
  constructor(private readonly sellers: SellersService) {}

  /** Vendeurs (Admin 4.14, D-11). */
  @Get()
  @RequirePermission(Permission.VENDEURS_LECTURE)
  list(@CurrentPrincipal() principal: Principal) {
    return this.sellers.list(principal.role);
  }
}
