import { Controller, Get, Param, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { Permission, staffParcelQuerySchema, type StaffParcelQuery } from '@faffago/shared';
import { RequirePermission } from '../auth/decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ColisService } from './colis.service';

/**
 * Colis (Admin 4.3, D-11): Admin, Dépôt and Service client read. Réimprimer
 * l'étiquette is `GET /colis/:code/label`, in the labels module (A-9).
 * The seller's own parcels are under /parcels.
 */
@Controller('colis')
export class ColisController {
  constructor(private readonly colis: ColisService) {}

  @Get()
  @RequirePermission(Permission.COLIS_LECTURE)
  list(@Query(new ZodValidationPipe(staffParcelQuerySchema)) query: StaffParcelQuery) {
    return this.colis.list(query);
  }

  // Fixed segments before `:code`.
  @Get('filters')
  @RequirePermission(Permission.COLIS_LECTURE)
  filters() {
    return this.colis.filters();
  }

  @Get('export')
  @RequirePermission(Permission.COLIS_LECTURE)
  async export(
    @Query(new ZodValidationPipe(staffParcelQuerySchema)) query: StaffParcelQuery,
    @Res({ passthrough: true }) response: Response,
  ) {
    const csv = Buffer.from(await this.colis.exportCsv(query), 'utf8');
    // The customers' names, phones and addresses: no cache keeps them.
    response.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(csv, {
      type: 'text/csv; charset=utf-8',
      disposition: 'attachment; filename="colis.csv"',
      length: csv.length,
    });
  }

  @Get(':code')
  @RequirePermission(Permission.COLIS_LECTURE)
  detail(@Param('code') code: string) {
    return this.colis.detail(code);
  }
}
