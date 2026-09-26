import { Controller, Get, Param, ParseUUIDPipe, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import {
  MONTHLY_REPORTS,
  Permission,
  REPORT_SLUGS,
  reportCsv,
  reportMonthSchema,
  reportPeriodSchema,
  type ReportKind,
} from '@faffago/shared';
import { z } from 'zod';
import { RequirePermission } from '../auth/decorators';
import { apiError } from '../common/errors';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { pdf } from '../money/money.controller';
import { RetenueService } from '../money/retenue.service';
import { reportXlsx } from './report-xlsx';
import { ReportsService } from './reports.service';

const formatQuery = z.enum(['json', 'csv', 'xlsx']).default('json');
const yearPipe = new ZodValidationPipe(z.string().regex(/^\d{4}$/, 'Année au format AAAA'));

function kindOf(slug: string): ReportKind {
  const found = (Object.entries(REPORT_SLUGS) as [ReportKind, string][]).find(
    ([, s]) => s === slug,
  );
  if (!found) throw apiError(404, 'RAPPORT_INCONNU', 'Rapport inconnu');
  return found[0];
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw apiError(400, 'PERIODE_INVALIDE', result.error.issues[0]?.message ?? 'Période invalide');
  }
  return result.data;
}

/** Rapports (Admin 4.13, D-89): the admin alone; each report as JSON, CSV or Excel. */
@Controller('rapports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly retenue: RetenueService,
  ) {}

  /** A certificate, from the Retenue report. */
  @Get('retenue/certificats/:id/pdf')
  @RequirePermission(Permission.RAPPORTS)
  async certificate(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.retenue.certificatePdf(id);
    return pdf(response, file.pdf, file.number);
  }

  /** A seller's yearly summary, from the Retenue report. */
  @Get('retenue/vendeurs/:sellerId/annuel/:year/pdf')
  @RequirePermission(Permission.RAPPORTS)
  async yearly(
    @Param('sellerId', ParseUUIDPipe) sellerId: string,
    @Param('year', yearPipe) year: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return pdf(response, await this.retenue.yearlyPdf(sellerId, year), `retenue-${year}`);
  }

  @Get(':slug')
  @RequirePermission(Permission.RAPPORTS)
  async report(
    @Param('slug') slug: string,
    @Query() query: Record<string, string>,
    @Res({ passthrough: true }) response: Response,
  ) {
    const kind = kindOf(slug);
    const format = parse(formatQuery, query.format);
    const table = MONTHLY_REPORTS.includes(kind)
      ? await this.reports.build(kind, { month: parse(reportMonthSchema, query).mois })
      : await this.reports.build(kind, {
          period: parse(reportPeriodSchema, { from: query.from, to: query.to }),
        });
    if (format === 'json') return table;
    const name = `${slug}-${query.mois ?? `${query.from}_${query.to}`}`;
    response.setHeader('Cache-Control', 'no-store');
    if (format === 'csv') {
      return new StreamableFile(Buffer.from(reportCsv(table), 'utf8'), {
        type: 'text/csv; charset=utf-8',
        disposition: `attachment; filename="${name}.csv"`,
      });
    }
    return new StreamableFile(await reportXlsx(table), {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="${name}.xlsx"`,
    });
  }
}
