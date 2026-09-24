import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Permission, csvImportRequestSchema, type CsvImportRequest } from '@faffago/shared';
import { AllowImpersonation, CurrentPrincipal, RequirePermission } from '../auth/decorators';
import type { Principal, UserPrincipal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ParcelImportsService } from './parcel-imports.service';

/** Import CSV (Vendeur 4.3). Seller space only; "Voir comme le vendeur" reads. */
@Controller('parcels/imports')
export class ParcelImportsController {
  constructor(private readonly imports: ParcelImportsService) {}

  /** 201 when imported, 200 when the same import came before. */
  @Post()
  @RequirePermission(Permission.ESPACE_VENDEUR)
  async create(
    @Body(new ZodValidationPipe(csvImportRequestSchema)) body: CsvImportRequest,
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { view, replayed } = await this.imports.import(principal as UserPrincipal, body);
    response.status(replayed ? 200 : 201);
    return view;
  }

  @Get(':id')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @AllowImpersonation()
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentPrincipal() principal: Principal) {
    return this.imports.get(principal, id);
  }
}
