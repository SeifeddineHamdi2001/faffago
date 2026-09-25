import { Module } from '@nestjs/common';
import { ParcelsModule } from '../parcels/parcels.module';
import { BonCorrectionsService } from './bon-corrections.service';
import { BonHandoverService } from './bon-handover.service';
import { BonsRetourService } from './bons-retour.service';
import { BonsVersementService } from './bons-versement.service';
import { CaisseService } from './caisse.service';
import {
  BonsRetourController,
  BonsVersementController,
  CaisseController,
  PaieController,
  PaiementsVendeursController,
  SellerMoneyController,
} from './money.controller';
import { PayrollService } from './payroll.service';
import { SellerMoneyService } from './seller-money.service';

/**
 * Money (phase 8, D-79 to D-85): the Caisse, bons de versement and de
 * retour, livreur pay, and what the seller sees of it. The courier and depot
 * scans reach the bons through the services exported here.
 */
@Module({
  imports: [ParcelsModule],
  controllers: [
    CaisseController,
    PaiementsVendeursController,
    BonsVersementController,
    BonsRetourController,
    PaieController,
    SellerMoneyController,
  ],
  providers: [
    BonCorrectionsService,
    BonHandoverService,
    BonsRetourService,
    BonsVersementService,
    CaisseService,
    PayrollService,
    SellerMoneyService,
  ],
  exports: [
    BonHandoverService,
    BonsRetourService,
    CaisseService,
    PayrollService,
    SellerMoneyService,
  ],
})
export class MoneyModule {}
