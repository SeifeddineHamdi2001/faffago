import { Controller, Get, Param, ParseUUIDPipe, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { LabelFormat, MAX_LABELS_PER_PDF, Permission, normalizeParcelCode } from '@faffago/shared';
import { CurrentPrincipal, RequirePermission } from '../auth/decorators';
import type { Principal } from '../auth/principal';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { LabelsService } from './labels.service';

const formatQuery = z.object({
  format: z.nativeEnum(LabelFormat).default(LabelFormat.THERMAL),
});
type FormatQuery = z.output<typeof formatQuery>;

const batchQuery = formatQuery.extend({
  codes: z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((code) => code.trim())
        .filter(Boolean),
    )
    .pipe(
      z
        .array(z.string())
        .min(1, 'Aucun colis')
        .max(MAX_LABELS_PER_PDF, `${MAX_LABELS_PER_PDF} étiquettes au maximum`),
    ),
});
type BatchQuery = z.output<typeof batchQuery>;

/**
 * Étiquettes (Vendeur 4.4), as PDF. GET, so the seller's screen opens them
 * with a plain link; nothing is written. Labels carry the customer's name,
 * phone and address, so no cache keeps them.
 */
@Controller()
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  /** A batch: `?codes=FG-…,FG-…`. */
  @Get('parcels/labels')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  async batch(
    @Query(new ZodValidationPipe(batchQuery)) query: BatchQuery,
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) response: Response,
  ) {
    const pdf = await this.labels.forCodes(principal, query.codes, query.format);
    return this.pdf(response, pdf, 'etiquettes');
  }

  @Get('parcels/imports/:id/labels')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  async forImport(
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(formatQuery)) query: FormatQuery,
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) response: Response,
  ) {
    const pdf = await this.labels.forImport(principal, id, query.format);
    return this.pdf(response, pdf, 'etiquettes-import');
  }

  @Get('parcels/:code/label')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  async single(
    @Param('code') code: string,
    @Query(new ZodValidationPipe(formatQuery)) query: FormatQuery,
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) response: Response,
  ) {
    const pdf = await this.labels.forCodes(principal, [code], query.format);
    return this.pdf(response, pdf, `etiquette-${normalizeParcelCode(code)}`);
  }

  private pdf(response: Response, pdf: Buffer, name: string): StreamableFile {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `inline; filename="${name}.pdf"`,
      length: pdf.length,
    });
  }
}
