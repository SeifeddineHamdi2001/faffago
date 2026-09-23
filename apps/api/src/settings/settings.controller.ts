import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { Permission, updateSettingSchema } from '@faffago/shared';
import { CurrentPrincipal, Meta, RequirePermission } from '../auth/decorators';
import type { Principal, UserPrincipal } from '../auth/principal';
import type { RequestMeta } from '../auth/sessions.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SettingsService } from './settings.service';

/** Paramètres (Admin 4.16): the admin alone reads and changes them. */
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermission(Permission.PARAMETRES)
  list() {
    return this.settings.list();
  }

  /** One setting at a time; the value is checked against that key's rule. */
  @Patch(':key')
  @RequirePermission(Permission.PARAMETRES)
  update(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(updateSettingSchema)) body: { value?: unknown },
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.settings.update(principal as UserPrincipal, key, body.value, meta);
  }
}
