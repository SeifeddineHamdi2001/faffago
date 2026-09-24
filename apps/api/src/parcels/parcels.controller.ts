import { Body, Controller, Get, HttpCode, Param, Patch, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  Permission,
  createParcelRequestSchema,
  parcelChangeRequestSchema,
  updateParcelSchema,
  type CreateParcelRequestValues,
  type ParcelChangeRequestValues,
  type UpdateParcelValues,
} from '@faffago/shared';
import { AllowImpersonation, CurrentPrincipal, RequirePermission } from '../auth/decorators';
import type { Principal, UserPrincipal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ParcelsService } from './parcels.service';

/**
 * The seller's parcels (Vendeur 4.2, 4.6). Seller space only: the back
 * office reads parcels through its own Colis screen (phase 5). "Voir comme
 * le vendeur" reads, never writes (D-5).
 */
@Controller('parcels')
export class ParcelsController {
  constructor(private readonly parcels: ParcelsService) {}

  /** Créer un colis. 201 when created, 200 when the same request came before. */
  @Post()
  @RequirePermission(Permission.ESPACE_VENDEUR)
  async create(
    @Body(new ZodValidationPipe(createParcelRequestSchema)) body: CreateParcelRequestValues,
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { parcel, replayed } = await this.parcels.createFromRequest(
      principal as UserPrincipal,
      body,
    );
    response.status(replayed ? 200 : 201);
    return parcel;
  }

  @Get(':code')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @AllowImpersonation()
  get(@Param('code') code: string, @CurrentPrincipal() principal: Principal) {
    return this.parcels.get(principal, code);
  }

  /** Modifier, while Créé (Vendeur 4.6, D-41). */
  @Patch(':code')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  update(
    @Param('code') code: string,
    @Body(new ZodValidationPipe(updateParcelSchema)) body: UpdateParcelValues,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.parcels.update(principal as UserPrincipal, code, body);
  }

  /** Annuler, before or after pickup (Vendeur 4.6, D-28). */
  @Post(':code/cancel')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @HttpCode(200)
  cancel(@Param('code') code: string, @CurrentPrincipal() principal: Principal) {
    return this.parcels.cancel(principal as UserPrincipal, code);
  }

  /** Demander une modification, after pickup (Vendeur 4.6). */
  @Post(':code/change-requests')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  requestChange(
    @Param('code') code: string,
    @Body(new ZodValidationPipe(parcelChangeRequestSchema)) body: ParcelChangeRequestValues,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.parcels.requestChange(principal as UserPrincipal, code, body);
  }
}
