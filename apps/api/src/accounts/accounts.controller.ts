import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  Permission,
  createCourierAccountSchema,
  createStaffAccountSchema,
  type CreateCourierAccountValues,
  type CreateStaffAccountValues,
} from '@faffago/shared';
import { CurrentPrincipal, Meta, RequirePermission } from '../auth/decorators';
import type { Principal, UserPrincipal } from '../auth/principal';
import type { RequestMeta } from '../auth/sessions.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AccountsService } from './accounts.service';

/**
 * Account management for the admin. An impersonation principal never reaches
 * these handlers (every route is a write), so the principal is a user.
 */
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get('staff')
  @RequirePermission(Permission.COMPTES_STAFF)
  listStaff() {
    return this.accounts.listStaff();
  }

  @Get('couriers')
  @RequirePermission(Permission.COURSIERS_LECTURE)
  listCouriers(@CurrentPrincipal() principal: Principal) {
    return this.accounts.listCouriers(principal.role);
  }

  /** Paramètres › Staff users (Admin 4.16). */
  @Post('staff')
  @RequirePermission(Permission.COMPTES_STAFF)
  createStaff(
    @Body(new ZodValidationPipe(createStaffAccountSchema)) body: CreateStaffAccountValues,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.accounts.createStaff(principal as UserPrincipal, body, meta);
  }

  /** Créer un coursier (Admin 4.15). */
  @Post('couriers')
  @RequirePermission(Permission.GERER_VENDEURS_COURSIERS)
  createCourier(
    @Body(new ZodValidationPipe(createCourierAccountSchema)) body: CreateCourierAccountValues,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.accounts.createCourier(principal as UserPrincipal, body, meta);
  }

  /** Régénérer le mot de passe, on any account (A-20). */
  @Post(':id/regenerate-password')
  @RequirePermission(Permission.REGENERER_MOT_DE_PASSE)
  @HttpCode(200)
  regeneratePassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.accounts.regeneratePassword(principal as UserPrincipal, id, meta);
  }

  /** Admin 4.15, D-12: stops new work at once, refuses while work is open. */
  @Post('couriers/:id/deactivate')
  @RequirePermission(Permission.GERER_VENDEURS_COURSIERS)
  @HttpCode(200)
  deactivateCourier(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.accounts.deactivateCourier(principal as UserPrincipal, id, meta);
  }

  @Post('couriers/:id/activate')
  @RequirePermission(Permission.GERER_VENDEURS_COURSIERS)
  @HttpCode(200)
  activateCourier(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.accounts.activateCourier(principal as UserPrincipal, id, meta);
  }

  @Post('staff/:id/deactivate')
  @RequirePermission(Permission.COMPTES_STAFF)
  @HttpCode(200)
  deactivateStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.accounts.setStaffActive(principal as UserPrincipal, id, false, meta);
  }

  @Post('staff/:id/activate')
  @RequirePermission(Permission.COMPTES_STAFF)
  @HttpCode(200)
  activateStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.accounts.setStaffActive(principal as UserPrincipal, id, true, meta);
  }
}
