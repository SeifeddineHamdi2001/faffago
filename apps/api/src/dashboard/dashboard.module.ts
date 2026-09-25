import { Module } from '@nestjs/common';
import { MoneyModule } from '../money/money.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

/** Tableau de bord, seller side (Vendeur 4.1, D-48), with its money part (D-83). */
@Module({
  imports: [MoneyModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
