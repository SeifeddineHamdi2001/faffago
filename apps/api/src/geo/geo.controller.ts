import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  Permission,
  createLocaliteSchema,
  updateDelegationSchema,
  updateGouvernoratSchema,
  updateLocaliteSchema,
  type CreateLocaliteValues,
  type UpdateDelegationValues,
  type UpdateGouvernoratValues,
  type UpdateLocaliteValues,
} from '@faffago/shared';
import {
  AllowImpersonation,
  Authenticated,
  CurrentPrincipal,
  Meta,
  RequirePermission,
} from '../auth/decorators';
import type { Principal, UserPrincipal } from '../auth/principal';
import type { RequestMeta } from '../auth/sessions.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { GeoService } from './geo.service';

/**
 * Gouvernorat → délégation → localité (D-17). Every signed-in user reads the
 * tree: the seller's parcel form and pickup addresses, the back office, the
 * courier app. Only the admin changes them (Paramètres, Admin 4.16): he
 * renames gouvernorats and délégations, moves a délégation between zones
 * (D-51), and adds, renames and deactivates localités (D-17).
 */
@Controller()
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get('geo')
  @Authenticated()
  @AllowImpersonation()
  tree() {
    return this.geo.tree();
  }

  /** Paramètres › Géographie: every gouvernorat and délégation, with its zone. */
  @Get('geo/admin')
  @RequirePermission(Permission.PARAMETRES)
  geographyForAdmin() {
    return this.geo.geographyForAdmin();
  }

  @Patch('gouvernorats/:id')
  @RequirePermission(Permission.PARAMETRES)
  updateGouvernorat(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateGouvernoratSchema)) body: UpdateGouvernoratValues,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.geo.updateGouvernorat(principal as UserPrincipal, id, body, meta);
  }

  @Patch('delegations/:id')
  @RequirePermission(Permission.PARAMETRES)
  updateDelegation(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateDelegationSchema)) body: UpdateDelegationValues,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.geo.updateDelegation(principal as UserPrincipal, id, body, meta);
  }

  @Get('localites')
  @RequirePermission(Permission.PARAMETRES)
  list(@Query('delegationId', new ParseUUIDPipe({ optional: true })) delegationId?: string) {
    return this.geo.listForAdmin(delegationId);
  }

  /** The parcels filed under Autre, to find the localités missing from the list. */
  @Get('localites/autre/parcels')
  @RequirePermission(Permission.PARAMETRES)
  parcelsUnderAutre() {
    return this.geo.parcelsUnderAutre();
  }

  @Post('localites')
  @RequirePermission(Permission.PARAMETRES)
  create(
    @Body(new ZodValidationPipe(createLocaliteSchema)) body: CreateLocaliteValues,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.geo.create(principal as UserPrincipal, body, meta);
  }

  /** Rename, Arabic name, aliases, postal code, deactivate or reactivate. */
  @Patch('localites/:id')
  @RequirePermission(Permission.PARAMETRES)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateLocaliteSchema)) body: UpdateLocaliteValues,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.geo.update(principal as UserPrincipal, id, body, meta);
  }
}
