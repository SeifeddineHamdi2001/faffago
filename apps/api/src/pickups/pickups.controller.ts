import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  Permission,
  createPickupAddressSchema,
  pickupAddressSchema,
  pickupRequestSchema,
  type CreatePickupAddressValues,
  type PickupAddressValues,
  type PickupRequestValues,
} from '@faffago/shared';
import { AllowImpersonation, CurrentPrincipal, RequirePermission } from '../auth/decorators';
import type { Principal, UserPrincipal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PickupAddressesService } from './pickup-addresses.service';
import { PickupsService } from './pickups.service';

/** Ramassages (Vendeur 4.5). Seller space only; "Voir comme le vendeur" reads. */
@Controller('pickups')
export class PickupsController {
  constructor(private readonly pickups: PickupsService) {}

  @Get()
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @AllowImpersonation()
  list(@CurrentPrincipal() principal: Principal) {
    return this.pickups.list(principal);
  }

  /** The parcels the request form offers. Before `:id`, so it is not read as one. */
  @Get('ready-parcels')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @AllowImpersonation()
  readyParcels(@CurrentPrincipal() principal: Principal) {
    return this.pickups.readyParcels(principal);
  }

  @Get(':id')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @AllowImpersonation()
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentPrincipal() principal: Principal) {
    return this.pickups.detail(principal, id);
  }

  /** Demander un ramassage. 201 when created, 200 when the same request came before. */
  @Post()
  @RequirePermission(Permission.ESPACE_VENDEUR)
  async request(
    @Body(new ZodValidationPipe(pickupRequestSchema)) body: PickupRequestValues,
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { pickup, replayed } = await this.pickups.request(principal as UserPrincipal, body);
    response.status(replayed ? 200 : 201);
    return pickup;
  }

  @Post(':id/cancel')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string, @CurrentPrincipal() principal: Principal) {
    return this.pickups.cancel(principal as UserPrincipal, id);
  }
}

/** Adresses de ramassage (Vendeur 4.14): add, edit, choose the default. */
@Controller('pickup-addresses')
export class PickupAddressesController {
  constructor(private readonly addresses: PickupAddressesService) {}

  @Get()
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @AllowImpersonation()
  list(@CurrentPrincipal() principal: Principal) {
    return this.addresses.list(principal);
  }

  @Post()
  @RequirePermission(Permission.ESPACE_VENDEUR)
  create(
    @Body(new ZodValidationPipe(createPickupAddressSchema)) body: CreatePickupAddressValues,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.addresses.create(principal, body);
  }

  @Patch(':id')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(pickupAddressSchema)) body: PickupAddressValues,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.addresses.update(principal, id, body);
  }

  @Post(':id/default')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @HttpCode(200)
  setDefault(@Param('id', ParseUUIDPipe) id: string, @CurrentPrincipal() principal: Principal) {
    return this.addresses.setDefault(principal, id);
  }
}
