import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/** Tableau de bord, seller side (Vendeur 4.1, D-48). À recevoir and Taux de livraison come in phase 8. */
@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
