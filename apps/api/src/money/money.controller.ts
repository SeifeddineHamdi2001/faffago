import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  PAYSLIP_STATUS_LABELS_FR,
  Permission,
  assignBonSchema,
  caisseCountSchema,
  caisseDaySchema,
  cancelBonSchema,
  changePayPlanSchema,
  debtCancelSchema,
  ecartCheckSchema,
  handOutBonsSchema,
  preparePayslipSchema,
  prepareBonSchema,
  type AssignBonValues,
  type CaisseCountValues,
  type CancelBonValues,
  type ChangePayPlanValues,
  type DebtCancelValues,
  type EcartCheckValues,
  type HandOutBonsValues,
  type PrepareBonValues,
  type PreparePayslipValues,
} from '@faffago/shared';
import { z } from 'zod';
import { AllowImpersonation, CurrentPrincipal, Meta, RequirePermission } from '../auth/decorators';
import { sellerIdOf, type Principal, type UserPrincipal } from '../auth/principal';
import type { RequestMeta } from '../auth/sessions.service';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BonHandoverService } from './bon-handover.service';
import { BonsRetourService } from './bons-retour.service';
import { BonsVersementService } from './bons-versement.service';
import { CaisseService } from './caisse.service';
import { renderBonRetour, renderBonVersement, renderPayslip } from './money-pdf';
import { PayrollService } from './payroll.service';
import { SellerMoneyService } from './seller-money.service';

const dayPipe = new ZodValidationPipe(caisseDaySchema);
const optionalDay = new ZodValidationPipe(z.object({ date: caisseDaySchema.optional() }));
const listQuery = new ZodValidationPipe(
  z.object({
    status: z.enum(['PREPARE', 'EN_ROUTE', 'REMIS', 'ARCHIVE', 'ANNULE']).optional(),
    sellerId: z.string().uuid().optional(),
  }),
);
const payslipQuery = new ZodValidationPipe(
  z.object({
    status: z.enum(['A_PAYER', 'PAYEE']).optional(),
    livreurId: z.string().uuid().optional(),
  }),
);

function pdf(response: Response, file: Buffer, name: string): StreamableFile {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  return new StreamableFile(file, {
    type: 'application/pdf',
    disposition: `inline; filename="${name}.pdf"`,
    length: file.length,
  });
}

/** Caisse (Admin 4.9, D-79): Admin and Dépôt; a positive écart is the admin's to check. */
@Controller('caisse')
export class CaisseController {
  constructor(
    private readonly caisse: CaisseService,
    private readonly handover: BonHandoverService,
  ) {}

  /** The daily summary (answer 1); today without a date. */
  @Get()
  @RequirePermission(Permission.CAISSE)
  summary(@Query(optionalDay) query: { date?: string }) {
    return this.caisse.summary(query.date ?? this.caisse.today());
  }

  @Get('ecarts')
  @RequirePermission(Permission.CAISSE_ECARTS)
  ecarts() {
    return this.caisse.ecarts();
  }

  @Post('sessions/:id/verifier-ecart')
  @RequirePermission(Permission.CAISSE_ECARTS)
  @HttpCode(200)
  checkEcart(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ecartCheckSchema)) body: EcartCheckValues,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.caisse.checkEcart(principal as UserPrincipal, id, body.note, meta);
  }

  /** The ramasseurs, with the bons planned for them (answer 5). */
  @Get('depart')
  @RequirePermission(Permission.CAISSE)
  ramasseurs() {
    return this.handover.ramasseurs();
  }

  @Get('depart/:userId')
  @RequirePermission(Permission.CAISSE)
  departure(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.handover.departure(userId);
  }

  /** Hands bons and their cash to a ramasseur as he leaves (D-80, D-81). */
  @Post('depart')
  @RequirePermission(Permission.CAISSE)
  @HttpCode(200)
  handOut(
    @Body(new ZodValidationPipe(handOutBonsSchema)) body: HandOutBonsValues,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.handover.handOut(principal as UserPrincipal, body);
  }

  @Get(':userId/:date')
  @RequirePermission(Permission.CAISSE)
  session(@Param('userId', ParseUUIDPipe) userId: string, @Param('date', dayPipe) date: string) {
    return this.caisse.session(userId, date);
  }

  @Post(':userId/:date/compter')
  @RequirePermission(Permission.CAISSE)
  @HttpCode(200)
  count(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('date', dayPipe) date: string,
    @Body(new ZodValidationPipe(caisseCountSchema)) body: CaisseCountValues,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.caisse.count(principal as UserPrincipal, userId, date, body.countedMillimes);
  }

  @Post(':userId/:date/cloturer')
  @RequirePermission(Permission.CAISSE)
  @HttpCode(200)
  close(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('date', dayPipe) date: string,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.caisse.close(principal as UserPrincipal, userId, date, meta);
  }
}

/** Paiements vendeurs (Admin 4.10): the admin alone. */
@Controller('paiements-vendeurs')
export class PaiementsVendeursController {
  constructor(private readonly bons: BonsVersementService) {}

  @Get()
  @RequirePermission(Permission.BONS_VERSEMENT)
  summary() {
    return this.bons.sellersSummary();
  }

  @Get(':sellerId')
  @RequirePermission(Permission.BONS_VERSEMENT)
  seller(@Param('sellerId', ParseUUIDPipe) sellerId: string) {
    return this.bons.sellerDetail(sellerId);
  }
}

@Controller('bons-versement')
export class BonsVersementController {
  constructor(private readonly bons: BonsVersementService) {}

  /** Préparer le bon (Admin 4.10). */
  @Post()
  @RequirePermission(Permission.BONS_VERSEMENT)
  prepare(
    @Body(new ZodValidationPipe(prepareBonSchema)) body: PrepareBonValues,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.bons.prepare(principal as UserPrincipal, body);
  }

  @Get()
  @RequirePermission(Permission.BONS_VERSEMENT)
  list(@Query(listQuery) query: { status?: string; sellerId?: string }) {
    return this.bons.list(query);
  }

  @Get(':id')
  @RequirePermission(Permission.BONS_VERSEMENT)
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.bons.detail(id);
  }

  @Get(':id/pdf')
  @RequirePermission(Permission.BONS_VERSEMENT)
  async print(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const bon = await this.bons.detail(id);
    return pdf(
      response,
      await renderBonVersement({
        ...bon,
        status: bon.status as never,
        sellerStatutSnapshot: bon.sellerStatutSnapshot as never,
      }),
      bon.number,
    );
  }

  /** A ramasseur and a day, for a bon with no planned pickup (answer 4). */
  @Post(':id/affecter')
  @RequirePermission(Permission.PLANIFIER_RAMASSAGES_TOURNEES)
  @HttpCode(200)
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignBonSchema)) body: AssignBonValues,
  ) {
    return this.bons.assign(id, body);
  }

  /** Annuler le bon (A-5). */
  @Post(':id/annuler')
  @RequirePermission(Permission.BONS_VERSEMENT)
  @HttpCode(200)
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelBonSchema)) body: CancelBonValues,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.bons.cancel(principal as UserPrincipal, id, body.reason, meta);
  }
}

/** Retours (Admin 4.11): every staff reads; Admin and Dépôt prepare (D-11). */
@Controller('bons-retour')
export class BonsRetourController {
  constructor(private readonly bons: BonsRetourService) {}

  /** The returns waiting, by seller, with their open bons. */
  @Get()
  @RequirePermission(Permission.RETOURS_LECTURE)
  bySeller() {
    return this.bons.bySeller();
  }

  @Get('liste')
  @RequirePermission(Permission.RETOURS_LECTURE)
  list(@Query(listQuery) query: { status?: string; sellerId?: string }) {
    return this.bons.list(query);
  }

  @Get(':id')
  @RequirePermission(Permission.RETOURS_LECTURE)
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.bons.detail(id);
  }

  @Get(':id/pdf')
  @RequirePermission(Permission.BONS_RETOUR)
  async print(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const bon = await this.bons.detail(id);
    return pdf(
      response,
      await renderBonRetour({ ...bon, status: bon.status as never }),
      bon.number,
    );
  }

  @Post(':id/affecter')
  @RequirePermission(Permission.PLANIFIER_RAMASSAGES_TOURNEES)
  @HttpCode(200)
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignBonSchema)) body: AssignBonValues,
  ) {
    return this.bons.assign(id, body);
  }
}

/** Paie coursiers (Admin 4.12): the admin alone. */
@Controller('paie')
export class PaieController {
  constructor(
    private readonly payroll: PayrollService,
    private readonly caisse: CaisseService,
  ) {}

  @Get()
  @RequirePermission(Permission.PAIE_COURSIERS)
  overview() {
    return this.payroll.overview();
  }

  @Get('fiches')
  @RequirePermission(Permission.PAIE_COURSIERS)
  payslips(@Query(payslipQuery) query: { status?: string; livreurId?: string }) {
    return this.payroll.payslips({ status: query.status, userId: query.livreurId });
  }

  @Post('fiches')
  @RequirePermission(Permission.PAIE_COURSIERS)
  prepare(
    @Body(new ZodValidationPipe(preparePayslipSchema)) body: PreparePayslipValues,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.payroll.prepare(principal as UserPrincipal, body.livreurId);
  }

  @Get('fiches/:id')
  @RequirePermission(Permission.PAIE_COURSIERS)
  payslip(@Param('id', ParseUUIDPipe) id: string) {
    return this.payroll.detail(id);
  }

  @Get('fiches/:id/pdf')
  @RequirePermission(Permission.PAIE_COURSIERS)
  async print(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const slip = await this.payroll.detail(id);
    return pdf(
      response,
      await renderPayslip({ ...slip, statusLabel: PAYSLIP_STATUS_LABELS_FR[slip.status] }),
      slip.number,
    );
  }

  @Post('fiches/:id/payer')
  @RequirePermission(Permission.PAIE_COURSIERS)
  @HttpCode(200)
  markPaid(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.payroll.markPaid(principal as UserPrincipal, id, meta);
  }

  @Patch('livreurs/:userId/plan')
  @RequirePermission(Permission.PAIE_COURSIERS)
  changePlan(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(new ZodValidationPipe(changePayPlanSchema)) body: ChangePayPlanValues,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.payroll.changePlan(principal as UserPrincipal, userId, body.payPlan, meta);
  }

  @Get('livreurs/:userId/dettes')
  @RequirePermission(Permission.PAIE_COURSIERS)
  debts(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.payroll.debts(userId);
  }

  @Post('dettes/:id/annuler')
  @RequirePermission(Permission.PAIE_COURSIERS)
  @HttpCode(200)
  cancelDebt(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(debtCancelSchema)) body: DebtCancelValues,
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
  ) {
    return this.caisse.cancelDebt(principal as UserPrincipal, id, body.note, meta);
  }
}

/**
 * The seller's money (Vendeur 4.11, 4.12): his own only, open to Voir comme
 * le vendeur (read-only, D-5). Another seller's bon does not exist (D-26).
 */
@Controller()
export class SellerMoneyController {
  constructor(
    private readonly money: SellerMoneyService,
    private readonly bonsVersement: BonsVersementService,
    private readonly bonsRetour: BonsRetourService,
  ) {}

  @Get('paiements')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @AllowImpersonation()
  paiements(@CurrentPrincipal() principal: Principal) {
    return this.money.paiements(sellerIdOf(principal));
  }

  @Get('paiements/resume')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @AllowImpersonation()
  badges(@CurrentPrincipal() principal: Principal) {
    return this.money.badges(sellerIdOf(principal));
  }

  @Get('paiements/bons/:id')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @AllowImpersonation()
  bon(@Param('id', ParseUUIDPipe) id: string, @CurrentPrincipal() principal: Principal) {
    return this.sellerBon(id, sellerIdOf(principal));
  }

  @Get('paiements/bons/:id/pdf')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @AllowImpersonation()
  async printBon(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) response: Response,
  ) {
    const bon = await this.sellerBon(id, sellerIdOf(principal));
    return pdf(
      response,
      await renderBonVersement({
        ...bon,
        status: bon.status as never,
        sellerStatutSnapshot: bon.sellerStatutSnapshot as never,
      }),
      bon.number,
    );
  }

  @Get('retours')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @AllowImpersonation()
  retours(@CurrentPrincipal() principal: Principal) {
    return this.money.retours(sellerIdOf(principal));
  }

  @Get('retours/bons/:id')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @AllowImpersonation()
  bonRetour(@Param('id', ParseUUIDPipe) id: string, @CurrentPrincipal() principal: Principal) {
    return this.bonsRetour.detail(id, sellerIdOf(principal));
  }

  @Get('retours/bons/:id/pdf')
  @RequirePermission(Permission.ESPACE_VENDEUR)
  @AllowImpersonation()
  async printBonRetour(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) response: Response,
  ) {
    const bon = await this.bonsRetour.detail(id, sellerIdOf(principal));
    return pdf(
      response,
      await renderBonRetour({ ...bon, status: bon.status as never }),
      bon.number,
    );
  }

  private sellerBon(id: string, sellerId: string) {
    return this.bonsVersement.detail(id, sellerId);
  }
}
